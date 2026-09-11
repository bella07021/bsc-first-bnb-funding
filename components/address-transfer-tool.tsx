'use client';

import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Search,
  ShieldCheck,
  Upload,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type ParsedAddress = {
  address: string;
  label: string;
};

type AddressSummary = ParsedAddress & {
  status: 'has_transfer' | 'no_transfer' | 'incomplete';
  coverageComplete: boolean;
  ordinaryTransferCount: number;
  ordinaryCounterpartyCount: number;
  hasImportedAddressTransfer: boolean;
  importedAddressTransferCount: number;
  importedAddressCounterpartyCount: number;
  error?: string;
};

type Transfer = {
  hash: string;
  blockNumber: number;
  timestamp: number;
  from: string;
  to: string;
  wei: string;
  amount: string;
};

type CheckerResult = {
  complete: boolean;
  transfers: Transfer[];
  addressSummaries: AddressSummary[];
};

type CheckerResponse = {
  result?: CheckerResult;
  error?: string;
};

const addressPattern = /0x[a-fA-F0-9]{40}/g;
const maxAddresses = 100;
const maxFileBytes = 512 * 1024;

function parseAddressList(value: string) {
  const seen = new Set<string>();
  const output: ParsedAddress[] = [];

  value
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .forEach((rawLine) => {
      const line = rawLine.trim();
      const match = line.match(addressPattern)?.[0];
      if (!match) return;
      const address = match.toLowerCase();
      if (seen.has(address)) return;
      seen.add(address);
      const suppliedLabel = line
        .replace(match, '')
        .replace(/^[\s,;|\t\-:：]+|[\s,;|\t\-:：]+$/g, '')
        .slice(0, 80);
      output.push({
        address,
        label: suppliedLabel || `地址 ${output.length + 1}`,
      });
    });

  return output;
}

function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(new Date(timestamp * 1000))
    .replaceAll('/', '-');
}

function csvCell(value: string | number) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function statusText(summary: AddressSummary) {
  if (summary.status === 'incomplete') return '查询不完整';
  if (summary.hasImportedAddressTransfer) return '不干净 + 名单内互转';
  return summary.status === 'has_transfer' ? '不干净' : '干净';
}

function emptyIncompleteSummary(item: ParsedAddress, error: string): AddressSummary {
  return {
    ...item,
    status: 'incomplete',
    coverageComplete: false,
    ordinaryTransferCount: 0,
    ordinaryCounterpartyCount: 0,
    hasImportedAddressTransfer: false,
    importedAddressTransferCount: 0,
    importedAddressCounterpartyCount: 0,
    error,
  };
}

export default function AddressTransferTool() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summaries, setSummaries] = useState<AddressSummary[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [processed, setProcessed] = useState(0);
  const [activeLabel, setActiveLabel] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addresses = useMemo(() => parseAddressList(input), [input]);
  const tooMany = addresses.length > maxAddresses;
  const progressPercent = addresses.length
    ? Math.round((processed / addresses.length) * 100)
    : 0;
  const importedAddressSet = useMemo(
    () => new Set(addresses.map((item) => item.address)),
    [addresses],
  );
  const importedTransfers = useMemo(
    () =>
      transfers.filter(
        (transfer) =>
          importedAddressSet.has(transfer.from) &&
          importedAddressSet.has(transfer.to),
      ),
    [importedAddressSet, transfers],
  );
  const cleanCount = summaries.filter(
    (summary) => summary.status === 'no_transfer',
  ).length;
  const uncleanCount = summaries.filter(
    (summary) => summary.status === 'has_transfer',
  ).length;
  const incompleteCount = summaries.filter(
    (summary) => summary.status === 'incomplete',
  ).length;

  async function queryAddress(index: number) {
    let lastError = '查询失败';
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetch('/api/address-transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addressText: input, targetIndex: index }),
        });
        const payload = (await response.json()) as CheckerResponse;
        if (!response.ok || !payload.result) {
          throw new Error(payload.error || `HTTP ${response.status}`);
        }
        return payload.result;
      } catch (cause) {
        lastError = cause instanceof Error ? cause.message : String(cause);
        if (attempt < 2) {
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
        }
      }
    }
    throw new Error(lastError);
  }

  async function runCheck() {
    if (addresses.length === 0 || tooMany || loading) return;
    setLoading(true);
    setError('');
    setSummaries([]);
    setTransfers([]);
    setProcessed(0);

    const summaryByAddress = new Map<string, AddressSummary>();
    const transferById = new Map<string, Transfer>();

    for (let index = 0; index < addresses.length; index += 1) {
      const item = addresses[index];
      setActiveLabel(item.label);
      try {
        const result = await queryAddress(index);
        const summary = result.addressSummaries[0];
        summaryByAddress.set(
          item.address,
          summary ? { ...summary, label: item.label } : emptyIncompleteSummary(item, '接口未返回地址结果'),
        );
        for (const transfer of result.transfers ?? []) {
          if (
            !importedAddressSet.has(transfer.from) ||
            !importedAddressSet.has(transfer.to)
          ) {
            continue;
          }
          transferById.set(
            `${transfer.hash}:${transfer.from}:${transfer.to}:${transfer.wei}`,
            transfer,
          );
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        summaryByAddress.set(item.address, emptyIncompleteSummary(item, message));
      }

      setProcessed(index + 1);
      setSummaries(
        addresses
          .slice(0, index + 1)
          .map((address) => summaryByAddress.get(address.address)!)
          .filter(Boolean),
      );
      setTransfers(
        [...transferById.values()].sort(
          (a, b) =>
            a.timestamp - b.timestamp ||
            a.blockNumber - b.blockNumber ||
            a.hash.localeCompare(b.hash),
        ),
      );

      if (index + 1 < addresses.length) {
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
    }

    const incomplete = [...summaryByAddress.values()].filter(
      (summary) => summary.status === 'incomplete',
    ).length;
    if (incomplete > 0) {
      setError(`${incomplete} 个地址查询不完整，不能据此判断为“无转账”。`);
    }
    setActiveLabel('');
    setLoading(false);
  }

  async function loadFile(file?: File) {
    if (!file) return;
    setError('');
    if (file.size > maxFileBytes) {
      setError('文件超过 512 KB，请缩小后重试。');
      return;
    }
    setInput(await file.text());
    setSummaries([]);
    setTransfers([]);
    setProcessed(0);
  }

  function exportCsv() {
    if (summaries.length === 0) return;
    const rows = [
      ['名称', '地址', '检查结果', '普通钱包转账笔数', '普通钱包对手数', '名单内互转笔数', '名单内对手数', '备注'],
      ...summaries.map((summary) => [
        summary.label,
        summary.address,
        statusText(summary),
        summary.ordinaryTransferCount,
        summary.ordinaryCounterpartyCount,
        summary.importedAddressTransferCount,
        summary.importedAddressCounterpartyCount,
        summary.error ?? '',
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `BNB地址转账检查-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1580px] px-5 py-8 sm:px-8 lg:py-10">
        <section className="mb-8">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
            <ShieldCheck className="size-3.5 text-primary" />
            只查询公开链上数据，不连接钱包，不发起交易
          </div>
          <h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-[-0.045em] sm:text-5xl sm:leading-[1.08]">
            BNB 地址转账
            <span className="block text-primary">关系检查</span>
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground">
            批量检查每个地址是否与普通钱包发生过原生 BNB 转账，并单独标记名单内地址之间的互转关系。合约交互和已识别的交易所钱包不计入“普通钱包转账”。
          </p>
        </section>

        <section className="grid items-start gap-5 lg:grid-cols-[minmax(340px,0.78fr)_minmax(0,1.55fr)]">
          <Card className="border-border bg-card shadow-[0_24px_80px_rgba(10,18,35,0.08)] ring-0">
            <CardHeader className="border-b border-border">
              <CardTitle className="text-lg">导入地址</CardTitle>
              <CardDescription>
                每行一个，也支持“名称, 地址”；最多 {maxAddresses} 个。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <Textarea
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setSummaries([]);
                  setTransfers([]);
                  setProcessed(0);
                  setError('');
                }}
                disabled={loading}
                aria-label="待检查的 BSC 地址列表"
                aria-invalid={tooMany}
                className="min-h-72 resize-y bg-secondary/45 p-4 font-mono text-sm leading-6"
                placeholder={'项目钱包, 0x1234...\n做市钱包, 0xabcd...'}
                spellCheck={false}
              />

              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv,.json,text/plain,text/csv,application/json"
                className="hidden"
                onChange={(event) => void loadFile(event.target.files?.[0])}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-4" />
                  上传 TXT / CSV / JSON
                </Button>
                <p className={`text-sm ${tooMany ? 'text-destructive' : 'text-muted-foreground'}`}>
                  已识别 {addresses.length} 个不同地址
                </p>
              </div>

              {tooMany && (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>地址数量超过上限</AlertTitle>
                  <AlertDescription>
                    当前 {addresses.length} 个，请分批控制在 {maxAddresses} 个以内。
                  </AlertDescription>
                </Alert>
              )}

              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={addresses.length === 0 || tooMany || loading}
                onClick={() => void runCheck()}
              >
                {loading ? <Spinner className="size-4" /> : <Search className="size-4" />}
                {loading ? `正在检查 ${processed + 1}/${addresses.length}` : '开始检查'}
              </Button>

              {loading && (
                <div className="space-y-2 rounded-xl border border-border bg-secondary/35 p-4">
                  <Progress value={progressPercent}>
                    <ProgressLabel>{progressPercent}%</ProgressLabel>
                  </Progress>
                  <p className="text-sm text-muted-foreground">
                    正在检查 {activeLabel || '地址'}，请保持页面打开。
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-5">
            {error && (
              <Alert variant={summaries.length ? 'default' : 'destructive'}>
                <AlertTriangle className="size-4" />
                <AlertTitle>{summaries.length ? '部分结果不完整' : '无法开始检查'}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {summaries.length === 0 && !loading ? (
              <Card className="grid min-h-[28rem] place-items-center border-dashed bg-card/70 ring-0">
                <CardContent className="max-w-md text-center">
                  <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary">
                    <ArrowRightLeft className="size-6" />
                  </div>
                  <CardTitle className="text-xl">等待地址列表</CardTitle>
                  <CardDescription className="mt-2 text-sm leading-6">
                    检查完成后，这里会分别显示干净、不干净、名单内互转和查询不完整的地址。
                  </CardDescription>
                </CardContent>
              </Card>
            ) : (
              <>
                <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="检查汇总">
                  {[
                    ['名单地址', summaries.length, '已返回结果'],
                    ['干净', cleanCount, '无普通地址转账'],
                    ['不干净', uncleanCount, '存在普通地址转账'],
                    ['查询不完整', incompleteCount, '不能判断为无转账'],
                  ].map(([label, value, note]) => (
                    <Card key={String(label)} className="bg-card ring-0">
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">{label}</p>
                        <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
                      </CardContent>
                    </Card>
                  ))}
                </section>

                <Card className="min-w-0 bg-card ring-0">
                  <CardHeader className="flex-row items-center justify-between gap-4 border-b border-border">
                    <div>
                      <CardTitle className="text-lg">地址检查结果</CardTitle>
                      <CardDescription className="mt-1">
                        “查询不完整”不会被误标为“干净”。
                      </CardDescription>
                    </div>
                    <Button type="button" variant="outline" onClick={exportCsv}>
                      <Download className="size-4" />
                      导出 CSV
                    </Button>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    <div className="max-h-[32rem] overflow-auto overscroll-contain">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          <TableRow>
                            <TableHead className="pl-5">名称</TableHead>
                            <TableHead>地址</TableHead>
                            <TableHead>结果</TableHead>
                            <TableHead>普通钱包转账</TableHead>
                            <TableHead className="pr-5">名单内互转</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summaries.map((summary) => (
                            <TableRow key={summary.address}>
                              <TableCell className="pl-5 font-medium">{summary.label}</TableCell>
                              <TableCell className="font-mono text-xs" title={summary.address}>
                                {shortAddress(summary.address)}
                              </TableCell>
                              <TableCell>
                                {summary.status === 'no_transfer' ? (
                                  <Badge className="bg-emerald-100 text-emerald-800">
                                    <CheckCircle2 className="size-3" /> 干净
                                  </Badge>
                                ) : summary.status === 'has_transfer' ? (
                                  <Badge className="bg-red-100 text-red-800">不干净</Badge>
                                ) : (
                                  <Badge className="bg-amber-100 text-amber-800">查询不完整</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {summary.status === 'incomplete'
                                  ? summary.error || '覆盖不完整'
                                  : `${summary.ordinaryTransferCount} 笔 / ${summary.ordinaryCounterpartyCount} 个对手`}
                              </TableCell>
                              <TableCell className="pr-5">
                                {summary.hasImportedAddressTransfer ? (
                                  <Badge className="bg-primary/15 text-primary">
                                    {summary.importedAddressTransferCount} 笔 / {summary.importedAddressCounterpartyCount} 个地址
                                  </Badge>
                                ) : (
                                  '无'
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {importedTransfers.length > 0 && (
                  <Card className="min-w-0 bg-card ring-0">
                    <CardHeader className="border-b border-border">
                      <CardTitle className="text-lg">名单内地址互转明细</CardTitle>
                      <CardDescription>
                        仅显示本次导入地址之间的普通原生 BNB 转账。
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                      <div className="max-h-80 overflow-auto overscroll-contain">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-card">
                            <TableRow>
                              <TableHead className="pl-5">时间（UTC+8）</TableHead>
                              <TableHead>转出</TableHead>
                              <TableHead>转入</TableHead>
                              <TableHead>BNB</TableHead>
                              <TableHead className="pr-5">交易</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {importedTransfers.map((transfer) => (
                              <TableRow key={`${transfer.hash}:${transfer.from}:${transfer.to}:${transfer.wei}`}>
                                <TableCell className="pl-5 whitespace-nowrap text-xs">
                                  {formatTimestamp(transfer.timestamp)}
                                </TableCell>
                                <TableCell className="font-mono text-xs" title={transfer.from}>
                                  {shortAddress(transfer.from)}
                                </TableCell>
                                <TableCell className="font-mono text-xs" title={transfer.to}>
                                  {shortAddress(transfer.to)}
                                </TableCell>
                                <TableCell className="font-medium">{transfer.amount}</TableCell>
                                <TableCell className="pr-5">
                                  <a
                                    href={`https://bscscan.com/tx/${transfer.hash}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                                  >
                                    {shortAddress(transfer.hash)}
                                    <ArrowUpRight className="size-3" />
                                  </a>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </section>

        <footer className="mt-12 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">
          只统计普通原生 BNB 转账；不包含 WBNB 或其他 BEP-20 代币。合约交互和已识别的交易所钱包不计入普通钱包关系。部分地址查询失败时保留“查询不完整”状态。
        </footer>
      </div>
    </main>
  );
}
