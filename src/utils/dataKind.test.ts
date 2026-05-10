import assert from 'node:assert/strict';
import test from 'node:test';

import { detectParsedDataKind } from './dataKind';

test('detectParsedDataKind recognizes oxide rows', () => {
  const kind = detectParsedDataKind([
    { Sample: 'C-1', SiO2: 28, Al2O3: 20, FeO: 24, MgO: 18, K2O: 0.02 },
  ]);

  assert.equal(kind, 'oxide');
});

test('detectParsedDataKind recognizes XRD spectra and peak tables', () => {
  assert.equal(detectParsedDataKind([{ Sample: 'quartz', TwoTheta: 26.64, Intensity: 100 }]), 'xrd-pattern');
  assert.equal(detectParsedDataKind([{ Sample: 'qlek403', TwoTheta: 20.9, Height: 1854, Area: 9703 }]), 'xrd-peaks');
});
