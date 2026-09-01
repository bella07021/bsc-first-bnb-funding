'use client';

import { useMemo, useState } from 'react';
import type { SheetData } from 'write-excel-file/browser';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Database,
  Download,
  Search,
  ShieldCheck,
  Trash2,
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
import { Spinner } from '@/components/ui/spinner';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { buildArrivalGroupDetailsMap } from '@/lib/arrival-groups';

type CexFunding = {
  timestamp: number;
  amountWei: string;
  transactionHash: string;
  sourceAddress: string;
  cex: { exchange: string; label: string };
};

type OkResult = {
  address: string;
  status: 'ok';
  fundings: CexFunding[];
};

type OtherResult = {
  address: string;
  status: 'no_inbound' | 'contract' | 'error';
  message: string;
};

type LookupResult = OkResult | OtherResult;

type ApiResponse = {
  complete: boolean;
  results: LookupResult[];
  error?: string;
  detail?: string;
};

type LookupProgress = {
  processed: number;
  total: number;
  batch: number;
  totalBatches: number;
};

const addressPattern = /0x[a-fA-F0-9]{40}/g;
const maxAddresses = 300;
const batchSize = 20;
const emptyProgress: LookupProgress = {
  processed: 0,
  total: 0,
  batch: 0,
  totalBatches: 0,
};

function extractAddresses(value: string) {
  return [
    ...new Set(
      (value.match(addressPattern) ?? []).map((address) =>
        address.toLowerCase(),
      ),
    ),
  ];
}

function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function relationId(address: string, sourceAddress: string) {
  return `${address.toLowerCase()}:${sourceAddress.toLowerCase()}`;
}

function formatWei(value: string) {
  const wei = BigInt(value);
  const base = 10n ** 18n;
  const whole = wei / base;
  const fraction = (wei % base).toString().padStart(18, '0').replace(/0+$/, '');
  const amount = fraction ? `${whole}.${fraction}` : `${whole}`;
  return `${amount} BNB`;
}

function formatWeiForExport(value: string) {
  return formatWei(value).replace(/ BNB$/, '');
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

function StatusMessage({ result }: { result: OtherResult }) {
  const styles = {
    no_inbound: 'bg-secondary text-muted-foreground',
    contract: 'bg-amber-100 text-amber-800',
    error: 'bg-red-50 text-red-700',
  } as const;
  const labels = {
    no_inbound: '无 CEX 入账',
    contract: '非普通 EOA',
    error: '查询失败',
  } as const;

  return (
    <div className="flex items-center gap-2">
      <Badge className={styles[result.status]}>{labels[result.status]}</Badge>
      <span className="max-w-[430px] whitespace-normal text-xs text-muted-foreground">
        {result.message}
      </span>
    </div>
  );
}

export default function Home() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<LookupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(true);
  const [progress, setProgress] = useState<LookupProgress>(emptyProgress);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const addresses = useMemo(() => extractAddresses(input), [input]);
  const tooMany = addresses.length > maxAddresses;
  const progressPercent = progress.total
    ? Math.round((progress.processed / progress.total) * 100)
    : 0;
  const fundingRows = useMemo(
    () =>
      results.flatMap((result, index) =>
        result.status === 'ok'
          ? result.fundings.map((funding, fundingIndex) => ({
              id: relationId(result.address, funding.sourceAddress),
              address: result.address,
              funding,
              sequence: `${index + 1}-${fundingIndex + 1}`,
            }))
          : [],
      ),
    [results],
  );
  const arrivalGroupDetails = useMemo(
    () =>
      buildArrivalGroupDetailsMap(
        fundingRows.map(({ id, address, funding, sequence }) => ({
          id,
          address,
          timestamp: funding.timestamp,
          sourceAddress: funding.sourceAddress,
          sequence,
        })),
      ),
    [fundingRows],
  );

  async function runLookup() {
    if (addresses.length === 0 || tooMany || loading) return;
    const queryAddresses = [...addresses];
    const totalBatches = Math.ceil(queryAddresses.length / batchSize);
    setLoading(true);
    setError('');
    setExportError('');
    setResults([]);
    setComplete(true);
    setProgress({
      processed: 0,
      total: queryAddresses.length,
      batch: 1,
      totalBatches,
    });

    try {
      let aggregatedResults: LookupResult[] = [];
      let allComplete = true;

      for (
        let offset = 0;
        offset < queryAddresses.length;
        offset += batchSize
      ) {
        const batchNumber = Math.floor(offset / batchSize) + 1;
        const batch = queryAddresses.slice(offset, offset + batchSize);
        setProgress({
          processed: offset,
          total: queryAddresses.length,
          batch: batchNumber,
          totalBatches,
        });

        let batchResults: LookupResult[];
        try {
          const response = await fetch('/api/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addresses: batch }),
          });
          const payload = (await response.json()) as ApiResponse;
          if (!response.ok) {
            throw new Error(
              [payload.error, payload.detail].filter(Boolean).join('：') ||
                `HTTP ${response.status}`,
            );
          }
          batchResults = payload.results ?? [];
          if (batchResults.length !== batch.length) {
            throw new Error('返回结果数量与本批地址数量不一致');
          }
          allComplete = allComplete && payload.complete;
        } catch (cause) {
          allComplete = false;
          batchResults = batch.map((address) => ({
            address,
            status: 'error',
            message: `第 ${batchNumber} 批查询失败：${cause instanceof Error ? cause.message : '查询失败，请稍后重试'}`,
          }));
        }

        aggregatedResults = [...aggregatedResults, ...batchResults];
        setResults(aggregatedResults);
        setComplete(allComplete);
        setProgress({
          processed: Math.min(offset + batch.length, queryAddresses.length),
          total: queryAddresses.length,
          batch: batchNumber,
          totalBatches,
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '查询失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  function updateInput(value: string) {
    if (loading) return;
    setInput(value);
    setResults([]);
    setError('');
    setExportError('');
    setComplete(true);
    setProgress(emptyProgress);
  }

  function clearAll() {
    setInput('');
    setResults([]);
    setError('');
    setExportError('');
    setComplete(true);
    setProgress(emptyProgress);
  }

  async function exportExcel() {
    if (loading || exporting || results.length === 0) return;
    setExporting(true);
    setExportError('');

    try {
      const { default: writeExcelFile } =
        await import('write-excel-file/browser');
      const header = (value: string) => ({
        value,
        fontWeight: 'bold' as const,
        backgroundColor: '#F3BA2F',
        textColor: '#152038',
        align: 'center' as const,
        alignVertical: 'center' as const,
      });
      const sheetData: SheetData = [
        [
          header('序号'),
          header('地址'),
          header('查询状态'),
          header('到账时间（UTC+8）'),
          header('到账时间分组'),
          header('组内地址数'),
          header('对应序号'),
          header('BNB 金额（精确值）'),
          header('来源 CEX'),
          header('来源地址'),
          header('交易哈希'),
          header('备注'),
        ],
      ];
      results.forEach((result, index) => {
        if (result.status === 'ok') {
          for (const [fundingIndex, funding] of result.fundings.entries()) {
            const groupDetails = arrivalGroupDetails.get(
              relationId(result.address, funding.sourceAddress),
            );
            sheetData.push([
              `${index + 1}-${fundingIndex + 1}`,
              result.address,
              '成功',
              {
                value: new Date((funding.timestamp + 8 * 60 * 60) * 1000),
                type: Date,
                format: 'yyyy-mm-dd hh:mm:ss',
              },
              groupDetails
                ? {
                    value: `组别 ${groupDetails.groupNumber}`,
                    backgroundColor: '#FFF4CC',
                    fontWeight: 'bold' as const,
                  }
                : '无',
              groupDetails?.memberCount ?? '无',
              groupDetails?.memberSequences.join('、') ?? '无',
              formatWeiForExport(funding.amountWei),
              funding.cex.label,
              funding.sourceAddress,
              funding.transactionHash,
              '',
            ]);
          }
          return;
        }

        const statusLabel = {
          no_inbound: '无 CEX 入账',
          contract: '非普通 EOA',
          error: '查询失败',
        }[result.status];
        sheetData.push([
          index + 1,
          result.address,
          statusLabel,
          null,
          '无',
          null,
          '无',
          null,
          null,
          null,
          null,
          result.message,
        ]);
      });
      const timestamp = formatTimestamp(Math.floor(Date.now() / 1000))
        .replace(/\D/g, '')
        .slice(0, 14);

      await writeExcelFile(
        sheetData,
        {
          sheet: '查询结果',
          columns: [
            { width: 8 },
            { width: 44 },
            { width: 16 },
            { width: 23 },
            { width: 18 },
            { width: 14 },
            { width: 28 },
            { width: 24 },
            { width: 24 },
            { width: 44 },
            { width: 68 },
            { width: 42 },
          ],
          stickyRowsCount: 1,
          stickyColumnsCount: 2,
          orientation: 'landscape',
          zoomScale: 0.85,
        },
        { fontFamily: 'Aptos', fontSize: 11 },
      ).toFile(`CEX热钱包首笔BNB到账关系-${timestamp}.xlsx`);
    } catch (cause) {
      setExportError(
        cause instanceof Error ? cause.message : '生成 Excel 文件失败',
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1580px] px-5 py-6 sm:px-8 lg:py-10">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(240,185,11,0.18)]">
              <Database className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                BNB Smart Chain
              </p>
              <p className="text-sm font-semibold">链上地址工具</p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary/10 text-primary"
          >
            BSC Mainnet
          </Badge>
        </header>

        <section className="mb-8">
          <div className="pt-2">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
              <ShieldCheck className="size-3.5 text-primary" />
              仅查询来自已识别 CEX 热钱包的普通原生 BNB 入账
            </div>
            <h1 className="max-w-xl text-balance text-4xl font-semibold tracking-[-0.045em] sm:text-5xl sm:leading-[1.08]">
              CEX 热钱包首笔 BNB
              <span className="block text-primary">到账关系与分组</span>
            </h1>
            <p className="mt-5 max-w-lg text-pretty text-base leading-7 text-muted-foreground">
              批量扫描 BSC EOA 地址收到的 CEX 热钱包
              BNB，分别保留每个具体热钱包与接收地址之间的首次到账，并按相邻 20
              分钟分组。
            </p>

            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                ['01', 'CEX 入账'],
                ['02', '按热钱包取首次'],
                ['03', '20 分钟分组'],
              ].map(([number, label]) => (
                <div key={number} className="border-l border-border pl-3">
                  <div className="font-mono text-xs text-primary">{number}</div>
                  <div className="mt-1 text-sm font-medium">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid items-start gap-5 lg:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.65fr)]">
          <div className="min-w-0 space-y-5">
            <Card className="h-[36rem] border border-border bg-card shadow-[0_24px_80px_rgba(10,18,35,0.08)] ring-0 lg:h-[calc(100vh-8rem)] lg:min-h-[36rem] lg:max-h-[48rem]">
              <CardHeader className="border-b border-border pb-4">
                <CardTitle className="text-lg">输入地址</CardTitle>
                <CardDescription>
                  每行一个地址，也支持从文本中自动提取。最多 {maxAddresses} 个。
                </CardDescription>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-4 pt-1">
                <Textarea
                  value={input}
                  onChange={(event) => updateInput(event.target.value)}
                  aria-label="BSC EOA 地址列表"
                  aria-invalid={tooMany}
                  disabled={loading}
                  className="min-h-0 flex-1 resize-none overflow-y-auto overscroll-contain border-border bg-secondary/45 p-4 font-mono text-sm leading-6 [field-sizing:fixed] focus-visible:border-primary focus-visible:ring-primary/20"
                  placeholder={'0x1234...\n0xabcd...'}
                  spellCheck={false}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p
                    className={`text-xs leading-5 ${tooMany ? 'text-destructive' : 'text-muted-foreground'}`}
                  >
                    已识别 {addresses.length} 个有效地址
                    {tooMany ? `，超过 ${maxAddresses} 个上限` : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    {(input || results.length > 0) && (
                      <Button
                        variant="ghost"
                        size="lg"
                        className="h-10"
                        onClick={clearAll}
                        disabled={loading}
                      >
                        <Trash2 data-icon="inline-start" />
                        清空
                      </Button>
                    )}
                    <Button
                      size="lg"
                      className="h-10 min-w-28 rounded-xl bg-primary px-4 text-primary-foreground hover:bg-primary/85"
                      onClick={runLookup}
                      disabled={addresses.length === 0 || tooMany || loading}
                    >
                      {loading ? (
                        <Spinner />
                      ) : (
                        <Search data-icon="inline-start" />
                      )}
                      {loading ? '查询中' : '开始查询'}
                    </Button>
                  </div>
                </div>
                {progress.total > 0 && (
                  <div
                    className="rounded-xl border border-border bg-secondary/45 p-4"
                    aria-live="polite"
                  >
                    <Progress value={progressPercent}>
                      <ProgressLabel>
                        {loading
                          ? `正在查询第 ${progress.batch}/${progress.totalBatches} 批`
                          : complete
                            ? '全部查询完成'
                            : '查询完成，包含失败项'}
                      </ProgressLabel>
                      <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                        {progress.processed}/{progress.total} ·{' '}
                        {progressPercent}%
                      </span>
                    </Progress>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      每批最多 {batchSize}{' '}
                      个地址，依次查询并统一汇总。查询期间请保持页面打开。
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {error && (
              <Alert
                variant="destructive"
                className="border-destructive/25 bg-red-50/70 px-4 py-3"
              >
                <AlertCircle />
                <AlertTitle>本次查询未完成</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {exportError && (
              <Alert
                variant="destructive"
                className="border-destructive/25 bg-red-50/70 px-4 py-3"
              >
                <AlertCircle />
                <AlertTitle>Excel 导出失败</AlertTitle>
                <AlertDescription>{exportError}</AlertDescription>
              </Alert>
            )}

            {results.length > 0 && !complete && (
              <Alert className="border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
                <AlertCircle />
                <AlertTitle>部分地址查询失败</AlertTitle>
                <AlertDescription>
                  失败项不会被当作“无 CEX 入账”，请稍后重试。
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Card className="h-[36rem] min-w-0 border border-border bg-card ring-0 lg:h-[calc(100vh-8rem)] lg:min-h-[36rem] lg:max-h-[48rem]">
            <CardHeader className="border-b border-border pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>查询结果</CardTitle>
                  <CardDescription className="mt-1">
                    时间统一显示为北京时间（UTC+8）
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {results.length > 0 && (
                    <Badge variant={complete ? 'secondary' : 'outline'}>
                      {complete ? (
                        <CheckCircle2 className="size-3" />
                      ) : (
                        <AlertCircle className="size-3" />
                      )}
                      {results.length} 个地址 · {fundingRows.length} 条关系
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportExcel}
                    disabled={loading || exporting || results.length === 0}
                  >
                    {exporting ? (
                      <Spinner />
                    ) : (
                      <Download data-icon="inline-start" />
                    )}
                    {exporting ? '导出中' : '导出 Excel'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 px-0 pb-0">
              <section
                className="h-full overflow-auto overscroll-contain [&_[data-slot=table-container]]:overflow-visible"
                aria-label="查询结果数据"
              >
                {results.length === 0 ? (
                  <div className="grid h-full min-h-44 place-items-center px-6 text-center">
                    <div>
                      <Search className="mx-auto mb-3 size-6 text-muted-foreground/50" />
                      <p className="text-sm font-medium">等待查询</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        结果将显示每个具体 CEX 热钱包的首次到账关系和分组。
                      </p>
                    </div>
                  </div>
                ) : (
                  <Table className="min-w-[1260px]">
                    <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
                      <TableRow className="bg-secondary/45 hover:bg-secondary/45">
                        <TableHead className="pl-4">序号</TableHead>
                        <TableHead>地址</TableHead>
                        <TableHead>到账时间</TableHead>
                        <TableHead>到账时间分组</TableHead>
                        <TableHead>组内地址数</TableHead>
                        <TableHead>对应序号</TableHead>
                        <TableHead>BNB 金额</TableHead>
                        <TableHead>CEX 热钱包</TableHead>
                        <TableHead>热钱包地址</TableHead>
                        <TableHead className="pr-4">交易哈希</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.flatMap((result, index) =>
                        result.status === 'ok'
                          ? result.fundings.map((funding, fundingIndex) => {
                              const id = relationId(
                                result.address,
                                funding.sourceAddress,
                              );
                              const groupDetails = arrivalGroupDetails.get(id);
                              return (
                                <TableRow key={id}>
                                  <TableCell className="pl-4 text-sm font-medium">
                                    {index + 1}-{fundingIndex + 1}
                                  </TableCell>
                                  <TableCell
                                    className="font-mono text-xs"
                                    title={result.address}
                                  >
                                    {shortAddress(result.address)}
                                  </TableCell>
                                  <TableCell>
                                    {formatTimestamp(funding.timestamp)}
                                  </TableCell>
                                  <TableCell>
                                    {loading ? (
                                      <Badge variant="outline">计算中</Badge>
                                    ) : groupDetails ? (
                                      <Badge className="bg-primary/15 text-primary">
                                        组别 {groupDetails.groupNumber}
                                      </Badge>
                                    ) : (
                                      <span className="text-sm text-muted-foreground">
                                        无
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {loading || !groupDetails
                                      ? '无'
                                      : groupDetails.memberCount}
                                  </TableCell>
                                  <TableCell className="max-w-48 whitespace-normal text-xs leading-5">
                                    {loading || !groupDetails
                                      ? '无'
                                      : groupDetails.memberSequences.join('、')}
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {formatWei(funding.amountWei)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      className="bg-primary/15 text-primary"
                                      title={funding.sourceAddress}
                                    >
                                      {funding.cex.label}
                                    </Badge>
                                  </TableCell>
                                  <TableCell
                                    className="font-mono text-xs"
                                    title={funding.sourceAddress}
                                  >
                                    {shortAddress(funding.sourceAddress)}
                                  </TableCell>
                                  <TableCell className="pr-4">
                                    <a
                                      href={`https://bscscan.com/tx/${funding.transactionHash}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                                      title={funding.transactionHash}
                                    >
                                      {shortAddress(funding.transactionHash)}
                                      <ArrowUpRight className="size-3" />
                                    </a>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          : [
                              <TableRow key={result.address}>
                                <TableCell className="pl-4 text-sm font-medium">
                                  {index + 1}
                                </TableCell>
                                <TableCell
                                  className="font-mono text-xs"
                                  title={result.address}
                                >
                                  {shortAddress(result.address)}
                                </TableCell>
                                <TableCell colSpan={8} className="pr-4">
                                  <StatusMessage result={result} />
                                </TableCell>
                              </TableRow>,
                            ],
                      )}
                    </TableBody>
                  </Table>
                )}
              </section>
            </CardContent>
          </Card>
        </section>

        <footer className="mt-12 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">
          每条结果代表“具体 CEX 热钱包 → 接收地址 →
          BNB”的首次成功普通转账，不包含内部交易。同一交易所的不同热钱包分别计算、绝不合并；同一热钱包下按首次到账时间排序，相邻间隔不超过
          20 分钟且连续至少 2 个地址才形成分组。CEX
          标签采用精确地址匹配，未命中不代表一定不是交易所地址。
        </footer>
      </div>
    </main>
  );
}
