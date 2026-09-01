export type ArrivalGroupCandidate = {
  id: string;
  address: string;
  timestamp: number;
  sourceAddress: string;
};

export type IndexedArrivalGroupCandidate = ArrivalGroupCandidate & {
  sequence: string;
};

export type ArrivalGroupDetails = {
  groupNumber: number;
  memberCount: number;
  memberSequences: string[];
};

type QualifiedRun = {
  members: ArrivalGroupCandidate[];
  firstTimestamp: number;
  sourceAddress: string;
};

export type ArrivalGroup = QualifiedRun & {
  groupNumber: number;
};

export function buildArrivalGroups(
  candidates: ArrivalGroupCandidate[],
  options: { maxGapSeconds?: number; minGroupSize?: number } = {},
) {
  const maxGapSeconds = options.maxGapSeconds ?? 20 * 60;
  const minGroupSize = options.minGroupSize ?? 2;
  const bySourceAddress = new Map<string, ArrivalGroupCandidate[]>();

  for (const candidate of candidates) {
    const sourceAddress = candidate.sourceAddress.trim().toLowerCase();
    if (!sourceAddress || !Number.isFinite(candidate.timestamp)) continue;
    const bucket = bySourceAddress.get(sourceAddress) ?? [];
    bucket.push(candidate);
    bySourceAddress.set(sourceAddress, bucket);
  }

  const qualifiedRuns: QualifiedRun[] = [];
  for (const [sourceAddress, sourceCandidates] of bySourceAddress) {
    const sorted = [...sourceCandidates].sort(
      (a, b) => a.timestamp - b.timestamp || a.address.localeCompare(b.address),
    );
    let run: ArrivalGroupCandidate[] = [];

    const finishRun = () => {
      if (run.length >= minGroupSize) {
        qualifiedRuns.push({
          members: run,
          firstTimestamp: run[0].timestamp,
          sourceAddress,
        });
      }
      run = [];
    };

    for (const candidate of sorted) {
      const previous = run.at(-1);
      if (
        !previous ||
        candidate.timestamp - previous.timestamp <= maxGapSeconds
      ) {
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
      a.sourceAddress.localeCompare(b.sourceAddress) ||
      a.members[0].address.localeCompare(b.members[0].address),
  );

  return qualifiedRuns.map((run, index) => ({
    ...run,
    groupNumber: index + 1,
  }));
}

export function buildArrivalGroupMap(
  candidates: ArrivalGroupCandidate[],
  options: { maxGapSeconds?: number; minGroupSize?: number } = {},
) {
  const groups = new Map<string, number>();
  for (const group of buildArrivalGroups(candidates, options)) {
    for (const member of group.members)
      groups.set(member.id, group.groupNumber);
  }
  return groups;
}

export function buildArrivalGroupDetailsMap(
  candidates: IndexedArrivalGroupCandidate[],
  options: { maxGapSeconds?: number; minGroupSize?: number } = {},
) {
  const groupNumbers = buildArrivalGroupMap(candidates, options);
  const sequencesByGroup = new Map<number, string[]>();

  for (const candidate of candidates) {
    const groupNumber = groupNumbers.get(candidate.id);
    if (!groupNumber) continue;
    const sequences = sequencesByGroup.get(groupNumber) ?? [];
    sequences.push(candidate.sequence);
    sequencesByGroup.set(groupNumber, sequences);
  }

  for (const sequences of sequencesByGroup.values()) {
    sequences.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  const details = new Map<string, ArrivalGroupDetails>();
  for (const candidate of candidates) {
    const groupNumber = groupNumbers.get(candidate.id);
    if (!groupNumber) continue;
    const memberSequences = sequencesByGroup.get(groupNumber) ?? [];
    details.set(candidate.id, {
      groupNumber,
      memberCount: memberSequences.length,
      memberSequences,
    });
  }

  return details;
}
