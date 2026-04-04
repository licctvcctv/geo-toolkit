import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRenderVisualization } from './visualizationState';

test('visualization requires the current page upload and calculation', () => {
  assert.equal(shouldRenderVisualization({ uploadedRows: 0, calculatedRows: 12 }), false);
  assert.equal(shouldRenderVisualization({ uploadedRows: 8, calculatedRows: 0 }), false);
  assert.equal(shouldRenderVisualization({ uploadedRows: 8, calculatedRows: 12 }), true);
});
