export type ArrivalGroupCandidate = {
  address: string;
  timestamp: number;
  cexExchange: string | null;
};

type QualifiedRun = {
  members: ArrivalGroupCandidate[];
  firstTimestamp: number;
  exchangeKey: string;
};

export function buildArrivalGroupMap(
  candidates: ArrivalGroupCandidate[],
  options: { maxGapSeconds?: number; minGroupSize?: number } = {},
) {
  const maxGapSeconds = options.maxGapSeconds ?? 20 * 60;
  const minGroupSize = options.minGroupSize ?? 2;
  const byExchange = new Map<string, ArrivalGroupCandidate[]>();

  for (const candidate of candidates) {
    const exchangeKey = candidate.cexExchange?.trim().toLowerCase();
    if (!exchangeKey || !Number.isFinite(candidate.timestamp)) continue;
    const bucket = byExchange.get(exchangeKey) ?? [];
    bucket.push(candidate);
    byExchange.set(exchangeKey, bucket);
  }

  const qualifiedRuns: QualifiedRun[] = [];
  for (const [exchangeKey, exchangeCandidates] of byExchange) {
    const sorted = [...exchangeCandidates].sort(
      (a, b) => a.timestamp - b.timestamp || a.address.localeCompare(b.address),
    );
    let run: ArrivalGroupCandidate[] = [];

    const finishRun = () => {
      if (run.length >= minGroupSize) {
        qualifiedRuns.push({
          members: run,
          firstTimestamp: run[0].timestamp,
          exchangeKey,
        });
      }
      run = [];
    };

    for (const candidate of sorted) {
      const previous = run.at(-1);
      if (!previous || candidate.timestamp - previous.timestamp <= maxGapSeconds) {
        run.push(candidate);
      } else {
        finishRun();
        run.push(candidate);
      }
    }
    finishRun();
  }

  qualifiedRuns.sort(
    (a, b) =>
      a.firstTimestamp - b.firstTimestamp ||
      a.exchangeKey.localeCompare(b.exchangeKey) ||
      a.members[0].address.localeCompare(b.members[0].address),
  );

  const groups = new Map<string, number>();
  qualifiedRuns.forEach((run, index) => {
    for (const member of run.members) groups.set(member.address, index + 1);
  });
  return groups;
}
