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
      timestamp: number;
      amountWei: string;
      transactionHash: string;
      sourceAddress: string;
      cex: ReturnType<typeof getCexLabel>;
    }
  | {
      address: string;
      status: 'no_inbound' | 'contract' | 'error';
      message: string;
    };

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function parseAddresses(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim().toLowerCase()))];
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
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
  const payload = (await response.json()) as Array<{ id: number; result?: string; error?: unknown }>;
  if (!Array.isArray(payload)) throw new Error('BSC RPC 返回格式异常');

  const byId = new Map(payload.map((entry) => [entry.id, entry]));
  return new Map(
    addresses.map((address, index) => {
      const entry = byId.get(index + 1);
      if (!entry || entry.error || typeof entry.result !== 'string') return [address, 'unknown'] as const;
      return [address, entry.result === '0x' || entry.result === '0x0' ? 'eoa' : 'contract'] as const;
    }),
  );
}

function toBigInt(value: string | number) {
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  return BigInt(value);
}

async function lookupFirstInbound(addresses: string[], token: string) {
  const unresolved = new Set(addresses);
  const found = new Map<string, Extract<LookupResult, { status: 'ok' }>>();
  let fromBlock = 0;
  let pages = 0;

  while (unresolved.size > 0) {
    pages += 1;
    if (pages > 80) throw new Error('历史扫描分页超过安全上限');

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
          transactions: [...unresolved].map((address) => ({
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
          max_num_transactions: Math.max(500, unresolved.size * 20),
          join_mode: 'JoinNothing',
        }),
      },
      25_000,
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`历史数据源 HTTP ${response.status}: ${detail.slice(0, 160)}`);
    }

    const payload = (await response.json()) as HyperResponse;
    if (!payload.data || typeof payload.next_block !== 'number') {
      throw new Error('历史数据源返回格式异常');
    }

    const timestamps = new Map(
      (payload.data.blocks ?? []).map((block) => [Number(block.number), Number(block.timestamp)]),
    );
    const transactions = [...(payload.data.transactions ?? [])].sort((a, b) => {
      const blockDelta = Number(a.block_number) - Number(b.block_number);
      return blockDelta || Number(a.transaction_index) - Number(b.transaction_index);
    });

    for (const tx of transactions) {
      const recipient = tx.to?.toLowerCase();
      if (!recipient || !unresolved.has(recipient)) continue;
      const value = toBigInt(tx.value);
      if (value <= 0n || Number(tx.status) !== 1) continue;
      const timestamp = timestamps.get(Number(tx.block_number));
      if (!timestamp) throw new Error(`区块 ${tx.block_number} 缺少时间戳`);

      const sourceAddress = tx.from.toLowerCase();
      found.set(recipient, {
        address: recipient,
        status: 'ok',
        timestamp,
        amountWei: value.toString(),
        transactionHash: tx.hash,
        sourceAddress,
        cex: getCexLabel(sourceAddress),
      });
      unresolved.delete(recipient);
    }

    const archiveHeight = payload.archive_height;
    if (archiveHeight == null || payload.next_block >= archiveHeight) break;
    if (payload.next_block <= fromBlock) throw new Error('历史扫描未向前推进');
    fromBlock = payload.next_block;
  }

  return { found, unresolved };
}

function cexFromProxy(sourceAddress: string, transfer: ProxyTransfer) {
  const exact = getCexLabel(sourceAddress);
  if (exact) return exact;

  const label = transfer.fromLabel?.trim();
  if (!label || !transfer.fromIsExchange) return null;
  const exchange = label.match(/^(Binance|MEXC|Gate\.io|Bybit|OKX|Bitget|KuCoin|Crypto\.com|Huobi|HTX|BitMart|CoinDCX|MaskEX|CoinField|IndoEx|FixedFloat|Azbit)/i)?.[1];
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
    throw new Error(payload.result.failures?.[0]?.error || '备用历史数据源覆盖不完整');
  }

  const incoming = (payload.result.transfers ?? []).find((transfer) => {
    try {
      return transfer.to.toLowerCase() === address && BigInt(transfer.wei) > 0n;
    } catch {
      return false;
    }
  });

  if (!incoming) {
    return {
      address,
      status: 'no_inbound',
      message: '未找到成功且金额大于 0 的普通 BNB 入账',
    };
  }

  const sourceAddress = incoming.from.toLowerCase();
  return {
    address,
    status: 'ok',
    timestamp: Number(incoming.timestamp),
    amountWei: BigInt(incoming.wei).toString(),
    transactionHash: incoming.hash,
    sourceAddress,
    cex: cexFromProxy(sourceAddress, incoming),
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

  const addresses = parseAddresses((body as { addresses?: unknown })?.addresses);
  if (addresses.length === 0) return json({ error: '请至少提供一个有效地址' }, 400);
  if (addresses.length > MAX_ADDRESSES) return json({ error: `一次最多查询 ${MAX_ADDRESSES} 个地址` }, 400);
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
      results.set(address, { address, status: 'contract', message: '当前地址存在合约代码，不属于普通 EOA' });
    } else if (classification === 'unknown') {
      results.set(address, { address, status: 'error', message: '无法确认是否为普通 EOA' });
    } else {
      eoaAddresses.push(address);
    }
  }

  if (eoaAddresses.length > 0) {
    if (token) {
      try {
        const { found, unresolved } = await lookupFirstInbound(eoaAddresses, token);
        for (const [address, result] of found) results.set(address, result);
        for (const address of unresolved) {
          results.set(address, { address, status: 'no_inbound', message: '未找到成功且金额大于 0 的普通 BNB 入账' });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const address of eoaAddresses) {
          if (!results.has(address)) results.set(address, { address, status: 'error', message });
        }
      }
    } else {
      const fallbackResults = await lookupViaProxy(eoaAddresses);
      for (const [address, result] of fallbackResults) results.set(address, result);
    }
  }

  return json({
    queriedAt: new Date().toISOString(),
    complete: [...results.values()].every((result) => result.status !== 'error'),
    results: addresses.map((address) => results.get(address)),
  });
}
