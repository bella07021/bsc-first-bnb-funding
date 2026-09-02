export type RetainedAddressRecord = {
  address: string;
  inputSequence: number;
  sequence: string;
  groupNumber?: number;
  cexLabel?: string;
};

export type RetainedAddressRow = {
  address: string;
  inputSequence: number;
  queryRecordCount: number;
  sequences: string[];
  groups: Array<{
    groupNumber: number;
    remainingMemberCount: number;
  }>;
  cexLabels: string[];
};

function uniqueInOrder<T>(values: T[]) {
  return [...new Set(values)];
}

export function buildRetainedAddressRows(
  records: RetainedAddressRecord[],
  removedAddresses: Iterable<string>,
) {
  const removed = new Set(
    [...removedAddresses].map((address) => address.toLowerCase()),
  );
  const retainedRecords = records.filter(
    (record) => !removed.has(record.address.toLowerCase()),
  );
  const remainingMembersByGroup = new Map<number, Set<string>>();

  for (const record of retainedRecords) {
    if (!record.groupNumber) continue;
    const members =
      remainingMembersByGroup.get(record.groupNumber) ?? new Set();
    members.add(record.address.toLowerCase());
    remainingMembersByGroup.set(record.groupNumber, members);
  }

  const recordsByAddress = new Map<string, RetainedAddressRecord[]>();
  for (const record of retainedRecords) {
    const address = record.address.toLowerCase();
    const addressRecords = recordsByAddress.get(address) ?? [];
    addressRecords.push(record);
    recordsByAddress.set(address, addressRecords);
  }

  return [...recordsByAddress]
    .map(([address, addressRecords]): RetainedAddressRow => {
      const groupNumbers = uniqueInOrder(
        addressRecords.flatMap((record) =>
          record.groupNumber ? [record.groupNumber] : [],
        ),
      );
      return {
        address,
        inputSequence: Math.min(
          ...addressRecords.map((record) => record.inputSequence),
        ),
        queryRecordCount: addressRecords.length,
        sequences: addressRecords.map((record) => record.sequence),
        groups: groupNumbers.map((groupNumber) => ({
          groupNumber,
          remainingMemberCount:
            remainingMembersByGroup.get(groupNumber)?.size ?? 0,
        })),
        cexLabels: uniqueInOrder(
          addressRecords.flatMap((record) =>
            record.cexLabel ? [record.cexLabel] : [],
          ),
        ),
      };
    })
    .sort(
      (a, b) =>
        a.inputSequence - b.inputSequence || a.address.localeCompare(b.address),
    );
}
