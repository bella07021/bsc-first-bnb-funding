import assert from 'node:assert/strict';
import test from 'node:test';

import { getCexLabel } from './cex-labels.ts';

test('labels the verified MEXC 13 hot wallet by exact address', () => {
  assert.deepEqual(getCexLabel('0x4982085C9e2F89F2eCb8131Eca71aFAD896e89CB'), {
    exchange: 'MEXC',
    label: 'MEXC 13',
  });
});
