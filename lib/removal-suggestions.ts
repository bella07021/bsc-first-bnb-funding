import {
  buildArrivalGroups,
  type IndexedArrivalGroupCandidate,
} from './arrival-groups.ts';

export type RemovalSuggestionCandidate = IndexedArrivalGroupCandidate & {
  exchange: string;
  cexLabel: string;
};

export type RemovalSuggestionGroup = {
  groupNumber: number;
  originalMemberCount: number;
  remainingMemberCount: number;
  sourceAddress: string;
  exchange: string;
  cexLabel: string;
};

export type RemovalSuggestion = {
  address: string;
  inputSequence: number;
  groups: RemovalSuggestionGroup[];
};

function inputSequence(sequence: string) {
  const parsed = Number.parseInt(sequence.split('-')[0] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function buildRemovalSuggestions(
  candidates: RemovalSuggestionCandidate[],
  options: { maxRemainingPerGroup?: number } = {},
) {
  const maxRemainingPerGroup = options.maxRemainingPerGroup ?? 4;
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const candidateDetailsByAddress = new Map<
    string,
    { latestTimestamp: number; inputSequence: number }
  >();

  for (const candidate of candidates) {
    const address = candidate.address.toLowerCase();
    const current = candidateDetailsByAddress.get(address);
    const next = {
      latestTimestamp: Math.max(
        current?.latestTimestamp ?? 0,
        candidate.timestamp,
      ),
      inputSequence: Math.min(
        current?.inputSequence ?? Number.MAX_SAFE_INTEGER,
        inputSequence(candidate.sequence),
      ),
    };
    candidateDetailsByAddress.set(address, next);
  }

  const groups = buildArrivalGroups(candidates)
    .filter((group) => group.members.length > maxRemainingPerGroup)
    .map((group) => {
      const members = new Set(
        group.members.map((member) => member.address.toLowerCase()),
      );
      const firstCandidate = candidateById.get(group.members[0].id);
      return {
        groupNumber: group.groupNumber,
        originalMemberCount: members.size,
        sourceAddress: group.sourceAddress,
        exchange: firstCandidate?.exchange ?? '',
        cexLabel: firstCandidate?.cexLabel ?? '',
        originalMembers: new Set(members),
        members,
      };
    })
    .filter((group) => group.originalMemberCount > maxRemainingPerGroup);

  const selected = new Set<string>();
  const groupsByAddress = new Map<string, typeof groups>();
  const scoreByAddress = new Map<string, number>();
  for (const group of groups) {
    for (const address of group.originalMembers) {
      const addressGroups = groupsByAddress.get(address) ?? [];
      addressGroups.push(group);
      groupsByAddress.set(address, addressGroups);
      scoreByAddress.set(address, (scoreByAddress.get(address) ?? 0) + 1);
    }
  }

  type HeapItem = {
    address: string;
    score: number;
    latestTimestamp: number;
    inputSequence: number;
  };
  const heap: HeapItem[] = [];
  const isBetter = (a: HeapItem, b: HeapItem) =>
    a.score !== b.score
      ? a.score > b.score
      : a.latestTimestamp !== b.latestTimestamp
        ? a.latestTimestamp > b.latestTimestamp
        : a.inputSequence !== b.inputSequence
          ? a.inputSequence < b.inputSequence
          : a.address.localeCompare(b.address) < 0;
  const push = (item: HeapItem) => {
    heap.push(item);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!isBetter(heap[index], heap[parent])) break;
      [heap[index], heap[parent]] = [heap[parent], heap[index]];
      index = parent;
    }
  };
  const pop = () => {
    const first = heap[0];
    const last = heap.pop();
    if (heap.length > 0 && last) {
      heap[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let best = index;
        if (left < heap.length && isBetter(heap[left], heap[best])) best = left;
        if (right < heap.length && isBetter(heap[right], heap[best]))
          best = right;
        if (best === index) break;
        [heap[index], heap[best]] = [heap[best], heap[index]];
        index = best;
      }
    }
    return first;
  };
  const pushCurrentScore = (address: string) => {
    const details = candidateDetailsByAddress.get(address);
    push({
      address,
      score: scoreByAddress.get(address) ?? 0,
      latestTimestamp: details?.latestTimestamp ?? 0,
      inputSequence: details?.inputSequence ?? Number.MAX_SAFE_INTEGER,
    });
  };

  for (const address of scoreByAddress.keys()) pushCurrentScore(address);
  let activeGroupCount = groups.length;

  while (activeGroupCount > 0) {
    let best = pop();
    while (
      best &&
      (selected.has(best.address) ||
        best.score !== (scoreByAddress.get(best.address) ?? 0))
    ) {
      best = pop();
    }
    if (!best || best.score === 0) break;

    selected.add(best.address);
    for (const group of groupsByAddress.get(best.address) ?? []) {
      const wasOversized = group.members.size > maxRemainingPerGroup;
      group.members.delete(best.address);
      if (wasOversized && group.members.size === maxRemainingPerGroup) {
        activeGroupCount -= 1;
        for (const address of group.members) {
          scoreByAddress.set(address, (scoreByAddress.get(address) ?? 0) - 1);
          pushCurrentScore(address);
        }
      }
    }
    scoreByAddress.set(best.address, 0);
  }

  return [...selected]
    .map((address): RemovalSuggestion => {
      const relatedGroups = groups
        .filter((group) => group.originalMembers.has(address))
        .map((group) => ({
          groupNumber: group.groupNumber,
          originalMemberCount: group.originalMemberCount,
          remainingMemberCount: group.members.size,
          sourceAddress: group.sourceAddress,
          exchange: group.exchange,
          cexLabel: group.cexLabel,
        }));
      return {
        address,
        inputSequence:
          candidateDetailsByAddress.get(address)?.inputSequence ??
          Number.MAX_SAFE_INTEGER,
        groups: relatedGroups,
      };
    })
    .sort(
      (a, b) =>
        a.inputSequence - b.inputSequence || a.address.localeCompare(b.address),
    );
}
