import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRemovalSuggestions } from './removal-suggestions.ts';

function candidate(address, timestamp, sourceAddress, sequence) {
  return {
    id: `${address}:${sourceAddress}`,
    address,
    timestamp,
    sourceAddress,
    sequence,
    exchange: sourceAddress.startsWith('wallet-a') ? 'MEXC' : 'Binance',
    cexLabel: sourceAddress,
  };
}

test('suggests two removals when one hot-wallet group has six members', () => {
  const suggestions = buildRemovalSuggestions(
    Array.from({ length: 6 }, (_, index) =>
      candidate(`recipient-${index + 1}`, 1_000 + index, 'wallet-a', `${index + 1}-1`),
    ),
  );

  assert.deepEqual(
    suggestions.map(({ address }) => address),
    ['recipient-5', 'recipient-6'],
  );
  assert.equal(suggestions[0].groups[0].originalMemberCount, 6);
  assert.equal(suggestions[0].groups[0].remainingMemberCount, 4);
});

test('prioritizes one address that covers two oversized groups', () => {
  const candidates = [];
  for (let index = 1; index <= 5; index += 1) {
    candidates.push(
      candidate(`recipient-${index}`, 1_000 + index, 'wallet-a', `${index}-1`),
    );
  }
  for (let index = 5; index <= 9; index += 1) {
    candidates.push(
      candidate(`recipient-${index}`, 2_000 + index, 'wallet-b', `${index}-2`),
    );
  }

  const suggestions = buildRemovalSuggestions(candidates);

  assert.deepEqual(suggestions.map(({ address }) => address), ['recipient-5']);
  assert.deepEqual(
    suggestions[0].groups.map(({ originalMemberCount, remainingMemberCount }) => [
      originalMemberCount,
      remainingMemberCount,
    ]),
    [
      [5, 4],
      [5, 4],
    ],
  );
});

test('does not suggest removals for groups of four or fewer', () => {
  const suggestions = buildRemovalSuggestions(
    Array.from({ length: 4 }, (_, index) =>
      candidate(`recipient-${index + 1}`, 1_000 + index, 'wallet-a', `${index + 1}-1`),
    ),
  );

  assert.deepEqual(suggestions, []);
});
