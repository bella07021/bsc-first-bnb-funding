import { getCexLabel } from '@/lib/cex-labels';

export const runtime = 'nodejs';
export const maxDuration = 120;

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const MAX_ADDRESSES = 20;
const BSC_RPC_URL = 'https://bsc-dataseed.bnbchain.org';
const HYPERSYNC_URL = 'https://bsc.hypersync.xyz/query';
const FALLBACK_LOOKUP_URL =
  process.env.LOOKUP_PROXY_URL?.trim() ||
  'https://bnb-address-transfer-checker.pages.dev/api/check-address';

type HyperTransaction = {
  block_number: number | string;
  transaction_index: number | string;
  hash: string;
  from: string;
  to: string | null;
  value: string | number;
  status: number | string;
};

type HyperBlock = {
  number: number | string;
  timestamp: number | string;
};

type HyperResponse = {
  archive_height?: number;
  next_block?: number;
  data?: {
    blocks?: HyperBlock[];
    transactions?: HyperTransaction[];
  };
};

type ProxyTransfer = {
  hash: string;
  timestamp: number;
  from: string;
  to: string;
  wei: string;
  fromLabel?: string | null;
  fromIsExchange?: boolean;
};

type ProxyResponse = {
  result?: {
    complete?: boolean;
    failures?: Array<{ error?: string }>;
    transfers?: ProxyTransfer[];
  };
  error?: string;
};

type LookupResult =
  | {
      address: string;
      status: 'ok';
      fundings: CexFunding[];
    }
  | {
      address: string;
      status: 'no_inbound' | 'contract' | 'error';
      message: string;
    };

type CexFunding = {
  timestamp: number;
  amountWei: string;
  transactionHash: string;
  sourceAddress: string;
  cex: NonNullable<ReturnType<typeof getCexLabel>>;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function parseAddresses(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().toLowerCase()),
    ),
  ];
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function classifyAddresses(addresses: string[]) {
  const response = await fetchWithTimeout(
    BSC_RPC_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        addresses.map((address, index) => ({
          jsonrpc: '2.0',
          id: index + 1,
          method: 'eth_getCode',
          params: [address, 'latest'],
        })),
      ),
    },
    12_000,
  );

  if (!response.ok) throw new Error(`BSC RPC HTTP ${response.status}`);
  const payload = (await response.json()) as Array<{
    id: number;
    result?: string;
    error?: unknown;
  }>;
  if (!Array.isArray(payload)) throw new Error('BSC RPC 返回格式异常');

  const byId = new Map(payload.map((entry) => [entry.id, entry]));
  return new Map(
    addresses.map((address, index) => {
      const entry = byId.get(index + 1);
      if (!entry || entry.error || typeof entry.result !== 'string')
        return [address, 'unknown'] as const;
      return [
        address,
        entry.result === '0x' || entry.result === '0x0' ? 'eoa' : 'contract',
      ] as const;
    }),
  );
}

function toBigInt(value: string | number) {
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  return BigInt(value);
}

async function lookupCexFundings(addresses: string[], token: string) {
  const addressSet = new Set(addresses);
  const fundingsByAddress = new Map(
    addresses.map((address) => [address, new Map<string, CexFunding>()]),
  );
  let fromBlock = 0;
  let pages = 0;

  while (true) {
    pages += 1;
    if (pages > 400) throw new Error('CEX 入账历史扫描分页超过安全上限');

    const response = await fetchWithTimeout(
      HYPERSYNC_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from_block: fromBlock,
          transactions: addresses.map((address) => ({
            to: [address],
            status: 1,
          })),
          field_selection: {
            block: ['number', 'timestamp'],
            transaction: [
              'block_number',
              'transaction_index',
              'hash',
              'from',
              'to',
              'value',
              'status',
            ],
          },
          max_num_transactions: Math.max(2_000, addresses.length * 500),
          join_mode: 'JoinNothing',
        }),
      },
      25_000,
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `历史数据源 HTTP ${response.status}: ${detail.slice(0, 160)}`,
      );
    }

    const payload = (await response.json()) as HyperResponse;
    if (
      !payload.data ||
      typeof payload.next_block !== 'number' ||
      typeof payload.archive_height !== 'number'
    ) {
      throw new Error('历史数据源返回格式异常');
    }

    const timestamps = new Map(
      (payload.data.blocks ?? []).map((block) => [
        Number(block.number),
        Number(block.timestamp),
      ]),
    );
    const transactions = [...(payload.data.transactions ?? [])].sort((a, b) => {
      const blockDelta = Number(a.block_number) - Number(b.block_number);
      return (
        blockDelta || Number(a.transaction_index) - Number(b.transaction_index)
      );
    });

    for (const tx of transactions) {
      const recipient = tx.to?.toLowerCase();
      if (!recipient || !addressSet.has(recipient)) continue;
      const value = toBigInt(tx.value);
      if (value <= 0n || Number(tx.status) !== 1) continue;
      const sourceAddress = tx.from.toLowerCase();
      const cex = getCexLabel(sourceAddress);
      if (!cex) continue;

      const fundingsBySource = fundingsByAddress.get(recipient);
      if (!fundingsBySource || fundingsBySource.has(sourceAddress)) continue;
      const timestamp = timestamps.get(Number(tx.block_number));
      if (!timestamp) throw new Error(`区块 ${tx.block_number} 缺少时间戳`);

      fundingsBySource.set(sourceAddress, {
        timestamp,
        amountWei: value.toString(),
        transactionHash: tx.hash,
        sourceAddress,
        cex,
      });
    }

    const archiveHeight = payload.archive_height;
    if (payload.next_block >= archiveHeight) break;
    if (payload.next_block <= fromBlock) throw new Error('历史扫描未向前推进');
    fromBlock = payload.next_block;
  }

  return new Map<string, LookupResult>(
    addresses.map((address) => {
      const fundings = [
        ...(fundingsByAddress.get(address)?.values() ?? []),
      ].sort(
        (a, b) =>
          a.timestamp - b.timestamp ||
          a.sourceAddress.localeCompare(b.sourceAddress),
      );
      return fundings.length > 0
        ? [address, { address, status: 'ok', fundings }]
        : [
            address,
            {
              address,
              status: 'no_inbound',
              message: '未找到来自已识别 CEX 热钱包的普通 BNB 入账',
            },
          ];
    }),
  );
}

function cexFromProxy(sourceAddress: string, transfer: ProxyTransfer) {
  const exact = getCexLabel(sourceAddress);
  if (exact) return exact;

  const label = transfer.fromLabel?.trim();
  if (!label || !transfer.fromIsExchange) return null;
  const exchange = label.match(
    /^(Binance|MEXC|Gate\.io|Bybit|OKX|Bitget|KuCoin|Crypto\.com|Huobi|HTX|BitMart|CoinDCX|MaskEX|CoinField|IndoEx|FixedFloat|Azbit)/i,
  )?.[1];
  return exchange ? { exchange, label } : null;
}

async function lookupOneViaProxy(address: string): Promise<LookupResult> {
  const response = await fetchWithTimeout(
    FALLBACK_LOOKUP_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addressText: address, targetIndex: 0 }),
    },
    70_000,
  );

  const payload = (await response.json()) as ProxyResponse;
  if (!response.ok || !payload.result) {
    throw new Error(payload.error || `备用历史数据源 HTTP ${response.status}`);
  }
  if (payload.result.complete !== true) {
    throw new Error(
      payload.result.failures?.[0]?.error || '备用历史数据源覆盖不完整',
    );
  }

  const fundingsBySource = new Map<string, CexFunding>();
  const incomingTransfers = [...(payload.result.transfers ?? [])].sort(
    (a, b) =>
      Number(a.timestamp) - Number(b.timestamp) || a.hash.localeCompare(b.hash),
  );

  for (const transfer of incomingTransfers) {
    let amountWei: bigint;
    try {
      if (transfer.to.toLowerCase() !== address) continue;
      amountWei = BigInt(transfer.wei);
      if (amountWei <= 0n) continue;
    } catch {
      continue;
    }

    const sourceAddress = transfer.from.toLowerCase();
    if (fundingsBySource.has(sourceAddress)) continue;
    const cex = cexFromProxy(sourceAddress, transfer);
    if (!cex) continue;
    fundingsBySource.set(sourceAddress, {
      timestamp: Number(transfer.timestamp),
      amountWei: amountWei.toString(),
      transactionHash: transfer.hash,
      sourceAddress,
      cex,
    });
  }

  const fundings = [...fundingsBySource.values()].sort(
    (a, b) =>
      a.timestamp - b.timestamp ||
      a.sourceAddress.localeCompare(b.sourceAddress),
  );
  if (fundings.length === 0) {
    return {
      address,
      status: 'no_inbound',
      message: '未找到来自已识别 CEX 热钱包的普通 BNB 入账',
    };
  }

  return {
    address,
    status: 'ok',
    fundings,
  };
}

async function lookupViaProxy(addresses: string[]) {
  const results = new Map<string, LookupResult>();
  let cursor = 0;
  const workerCount = Math.min(4, addresses.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < addresses.length) {
        const address = addresses[cursor];
        cursor += 1;
        try {
          results.set(address, await lookupOneViaProxy(address));
        } catch (error) {
          results.set(address, {
            address,
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }),
  );

  return results;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求内容不是有效 JSON' }, 400);
  }

  const addresses = parseAddresses(
    (body as { addresses?: unknown })?.addresses,
  );
  if (addresses.length === 0)
    return json({ error: '请至少提供一个有效地址' }, 400);
  if (addresses.length > MAX_ADDRESSES)
    return json({ error: `一次最多查询 ${MAX_ADDRESSES} 个地址` }, 400);
  if (addresses.some((address) => !ADDRESS_PATTERN.test(address))) {
    return json({ error: '地址格式不正确' }, 400);
  }

  const token = process.env.ENVIO_API_TOKEN?.trim();

  let classifications: Awaited<ReturnType<typeof classifyAddresses>>;
  try {
    classifications = await classifyAddresses(addresses);
  } catch (error) {
    return json(
      {
        error: 'EOA 类型检查失败，未执行历史查询',
        detail: error instanceof Error ? error.message : String(error),
      },
      502,
    );
  }

  const results = new Map<string, LookupResult>();
  const eoaAddresses: string[] = [];
  for (const address of addresses) {
    const classification = classifications.get(address);
    if (classification === 'contract') {
      results.set(address, {
        address,
        status: 'contract',
        message: '当前地址存在合约代码，不属于普通 EOA',
      });
    } else if (classification === 'unknown') {
      results.set(address, {
        address,
        status: 'error',
        message: '无法确认是否为普通 EOA',
      });
    } else {
      eoaAddresses.push(address);
    }
  }

  if (eoaAddresses.length > 0) {
    if (token) {
      try {
        const cexFundingResults = await lookupCexFundings(eoaAddresses, token);
        for (const [address, result] of cexFundingResults)
          results.set(address, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const address of eoaAddresses) {
          if (!results.has(address))
            results.set(address, { address, status: 'error', message });
        }
      }
    } else {
      const fallbackResults = await lookupViaProxy(eoaAddresses);
      for (const [address, result] of fallbackResults)
        results.set(address, result);
    }
  }

  return json({
    queriedAt: new Date().toISOString(),
    complete: [...results.values()].every(
      (result) => result.status !== 'error',
    ),
    results: addresses.map((address) => results.get(address)),
  });
}
