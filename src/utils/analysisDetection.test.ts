import assert from 'node:assert/strict';
import test from 'node:test';

import { detectAnalysisMode } from './analysisDetection';

const chloriteRows = [
  { Sample: 'C-1', SiO2: 28, TiO2: 0.05, Al2O3: 20, Cr2O3: 0.01, FeO: 24, MnO: 0.2, MgO: 18, CaO: 0.05, Na2O: 0.02, K2O: 0.02 },
  { Sample: 'C-2', SiO2: 27.5, TiO2: 0.04, Al2O3: 19.8, Cr2O3: 0.01, FeO: 23.2, MnO: 0.18, MgO: 18.4, CaO: 0.05, Na2O: 0.02, K2O: 0.02 },
  { Sample: 'C-3', SiO2: 28.2, TiO2: 0.03, Al2O3: 20.2, Cr2O3: 0.01, FeO: 24.5, MnO: 0.2, MgO: 17.8, CaO: 0.05, Na2O: 0.02, K2O: 0.02 },
];

const muscoviteMixedRows = [
  { Sample: 'M-1', SiO2: 47, TiO2: 0.3, Al2O3: 33, Cr2O3: 0.01, FeO: 1.8, MnO: 0.02, MgO: 0.9, CaO: 0.03, Na2O: 0.4, K2O: 10.2 },
  { Sample: 'M-2', SiO2: 46.6, TiO2: 0.28, Al2O3: 32.5, Cr2O3: 0.01, FeO: 1.6, MnO: 0.02, MgO: 0.8, CaO: 0.03, Na2O: 0.35, K2O: 10.0 },
  { Sample: 'X-1', SiO2: 36, TiO2: 2.5, Al2O3: 15, Cr2O3: 0.01, FeO: 18, MnO: 0.2, MgO: 13, CaO: 0.05, Na2O: 0.15, K2O: 9.0 },
];

test('detectAnalysisMode recognizes chlorite files', () => {
  const result = detectAnalysisMode(chloriteRows);

  assert.equal(result.source, 'chlorite');
  assert.equal(result.dominantMineral, 'Chlorite');
  assert.equal(result.confidence >= 0.9, true);
});

test('detectAnalysisMode falls back to mineral identification for muscovite or mixed files', () => {
  const result = detectAnalysisMode(muscoviteMixedRows);

  assert.equal(result.source, 'mineral');
  assert.ok(['Muscovite', 'Biotite'].includes(result.dominantMineral));
  assert.equal(result.validRows > 0, true);
});
