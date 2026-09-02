import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRetainedAddressRows } from './retained-addresses.ts';

test('removes suggested addresses and globally deduplicates retained addresses', () => {
  const rows = buildRetainedAddressRows(
    [
      {
        address: '0xAAA',
        inputSequence: 1,
        sequence: '1-1',
        groupNumber: 1,
        cexLabel: 'MEXC 13',
      },
      {
        address: '0xaaa',
        inputSequence: 1,
        sequence: '1-2',
        groupNumber: 2,
        cexLabel: 'Binance: Hot Wallet 7',
      },
      {
        address: '0xBBB',
        inputSequence: 2,
        sequence: '2-1',
        groupNumber: 1,
        cexLabel: 'MEXC 13',
      },
      {
        address: '0xCCC',
        inputSequence: 3,
        sequence: '3-1',
        groupNumber: 2,
        cexLabel: 'Binance: Hot Wallet 7',
      },
    ],
    ['0xbbb'],
  );

  assert.deepEqual(rows, [
    {
      address: '0xaaa',
      inputSequence: 1,
      queryRecordCount: 2,
      sequences: ['1-1', '1-2'],
      groups: [
        { groupNumber: 1, remainingMemberCount: 1 },
        { groupNumber: 2, remainingMemberCount: 2 },
      ],
      cexLabels: ['MEXC 13', 'Binance: Hot Wallet 7'],
    },
    {
      address: '0xccc',
      inputSequence: 3,
      queryRecordCount: 1,
      sequences: ['3-1'],
      groups: [{ groupNumber: 2, remainingMemberCount: 2 }],
      cexLabels: ['Binance: Hot Wallet 7'],
    },
  ]);
});

test('keeps ungrouped and non-funding result rows', () => {
  const rows = buildRetainedAddressRows(
    [
      {
        address: '0x111',
        inputSequence: 1,
        sequence: '1-1',
        cexLabel: 'MEXC 13',
      },
      {
        address: '0x222',
        inputSequence: 2,
        sequence: '2',
      },
    ],
    [],
  );

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].groups, []);
  assert.deepEqual(rows[1].cexLabels, []);
});
