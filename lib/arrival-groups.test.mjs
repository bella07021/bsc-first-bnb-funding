import assert from 'node:assert/strict';
import test from 'node:test';

import { buildArrivalGroupDetailsMap } from './arrival-groups.ts';

test('groups arrivals by the exact hot-wallet address', () => {
  const details = buildArrivalGroupDetailsMap([
    {
      id: 'recipient-1:wallet-a',
      address: 'recipient-1',
      timestamp: 1_000,
      sourceAddress: 'wallet-a',
      sequence: '1-1',
    },
    {
      id: 'recipient-2:wallet-a',
      address: 'recipient-2',
      timestamp: 2_200,
      sourceAddress: 'WALLET-A',
      sequence: '2-1',
    },
  ]);

  assert.deepEqual(details.get('recipient-1:wallet-a'), {
    groupNumber: 1,
    memberCount: 2,
    memberSequences: ['1-1', '2-1'],
  });
  assert.deepEqual(details.get('recipient-2:wallet-a'), {
    groupNumber: 1,
    memberCount: 2,
    memberSequences: ['1-1', '2-1'],
  });
});

test('does not merge different hot wallets from the same exchange', () => {
  const details = buildArrivalGroupDetailsMap([
    {
      id: 'recipient-1:binance-wallet-6',
      address: 'recipient-1',
      timestamp: 1_000,
      sourceAddress: 'binance-wallet-6',
      sequence: '1-1',
    },
    {
      id: 'recipient-2:binance-wallet-7',
      address: 'recipient-2',
      timestamp: 1_001,
      sourceAddress: 'binance-wallet-7',
      sequence: '2-1',
    },
  ]);

  assert.equal(details.size, 0);
});

test('keeps separate relations when one recipient was funded by two hot wallets', () => {
  const details = buildArrivalGroupDetailsMap([
    {
      id: 'recipient-1:wallet-a',
      address: 'recipient-1',
      timestamp: 1_000,
      sourceAddress: 'wallet-a',
      sequence: '1-1',
    },
    {
      id: 'recipient-2:wallet-a',
      address: 'recipient-2',
      timestamp: 1_100,
      sourceAddress: 'wallet-a',
      sequence: '2-1',
    },
    {
      id: 'recipient-1:wallet-b',
      address: 'recipient-1',
      timestamp: 2_000,
      sourceAddress: 'wallet-b',
      sequence: '1-2',
    },
    {
      id: 'recipient-3:wallet-b',
      address: 'recipient-3',
      timestamp: 2_100,
      sourceAddress: 'wallet-b',
      sequence: '3-1',
    },
  ]);

  assert.equal(details.get('recipient-1:wallet-a')?.groupNumber, 1);
  assert.equal(details.get('recipient-1:wallet-b')?.groupNumber, 2);
  assert.deepEqual(details.get('recipient-1:wallet-a')?.memberSequences, [
    '1-1',
    '2-1',
  ]);
  assert.deepEqual(details.get('recipient-1:wallet-b')?.memberSequences, [
    '1-2',
    '3-1',
  ]);
});

test('splits only when the adjacent gap is greater than 20 minutes', () => {
  const details = buildArrivalGroupDetailsMap([
    {
      id: 'recipient-1:wallet-a',
      address: 'recipient-1',
      timestamp: 1_000,
      sourceAddress: 'wallet-a',
      sequence: '1-1',
    },
    {
      id: 'recipient-2:wallet-a',
      address: 'recipient-2',
      timestamp: 2_200,
      sourceAddress: 'wallet-a',
      sequence: '2-1',
    },
    {
      id: 'recipient-3:wallet-a',
      address: 'recipient-3',
      timestamp: 3_401,
      sourceAddress: 'wallet-a',
      sequence: '3-1',
    },
  ]);

  assert.equal(details.get('recipient-1:wallet-a')?.memberCount, 2);
  assert.equal(details.get('recipient-2:wallet-a')?.memberCount, 2);
  assert.equal(details.has('recipient-3:wallet-a'), false);
});
