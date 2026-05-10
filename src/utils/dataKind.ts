export type ParsedDataKind = 'oxide' | 'xrd-pattern' | 'xrd-peaks' | 'unknown';

const CORE_OXIDE_KEYS = ['SiO2', 'Al2O3', 'FeO', 'MgO'];

export function detectParsedDataKind(rows: Array<Record<string, unknown>>): ParsedDataKind {
  if (rows.length === 0) return 'unknown';

  const keys = new Set<string>();
  rows.slice(0, 5).forEach((row) => {
    Object.keys(row ?? {}).forEach((key) => keys.add(key));
  });

  const coreOxides = CORE_OXIDE_KEYS.filter((key) => keys.has(key)).length;
  if (coreOxides >= 3) return 'oxide';

  if (keys.has('TwoTheta') && (keys.has('Height') || keys.has('Area') || keys.has('DSpacing'))) {
    return 'xrd-peaks';
  }

  if (keys.has('TwoTheta') && keys.has('Intensity')) {
    return 'xrd-pattern';
  }

  return 'unknown';
}

export function isOxideDataset(rows: Array<Record<string, unknown>>): boolean {
  return detectParsedDataKind(rows) === 'oxide';
}
