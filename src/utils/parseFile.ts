import * as XLSX from 'xlsx';

type ParsedRow = Record<string, string>;

interface ParsedCandidate {
  data: ParsedRow[];
  matchCount: number;
  score: number;
}

interface SampleColumnMatch {
  explicit: boolean;
  index: number;
}

const TEXT_EXTENSIONS = new Set(['csv', 'tsv', 'txt']);
const SPREADSHEET_EXTENSIONS = new Set(['xlsx', 'xls']);

const OXIDE_KEYS = ['SiO2', 'TiO2', 'Al2O3', 'Cr2O3', 'FeO', 'MnO', 'MgO', 'CaO', 'Na2O', 'K2O', 'BaO'];
const CORE_OXIDES = ['SiO2', 'Al2O3', 'FeO', 'MgO'];

const SAMPLE_ALIASES = [
  'sample', 'sampleno', 'sampleid', 'comment', '样品编号', '样品号', '样品',
  'drillholeno.', 'drillholeno', 'point', 'no', 'no.', '编号', '测点',
  'label', 'name', 'description', '分析点', 'analysis'
];

const DESCRIPTIVE_SAMPLE_ALIASES = [
  'comment', 'sampleid', '样品编号', '样品号', '样品',
  'label', 'name', 'description', '分析点', 'analysis'
];

const GENERIC_SAMPLE_ALIASES = [
  'sample', 'sampleno', 'drillholeno.', 'drillholeno', 'point', 'no', 'no.', '编号', '测点'
];

const SUMMARY_ROW_PATTERN = /^(平均|average|mean|std|stdev|max|min|total|合计|标准差)$/i;
const GENERIC_HEADER_PATTERN = /^(inputdata|here|sample|samples|reformattedoxidepercentages|formulaunitcalculations)$/i;

/**
 * 解析 CSV/TSV/TXT/XLS/XLSX 文件，支持行式表和“样本按列排布”的模板。
 */
export async function parseFile(file: File): Promise<ParsedRow[]> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (!ext) {
    throw new Error('无法识别文件类型');
  }
  if (TEXT_EXTENSIONS.has(ext)) {
    return parseDelimitedText(file, ext);
  }
  if (SPREADSHEET_EXTENSIONS.has(ext)) {
    return parseWorkbook(file);
  }

  throw new Error(`暂不支持 ${ext} 文件`);
}

function parseDelimitedText(file: File, ext: string): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result ?? '');
        const rawRows = parseTextMatrix(text, ext);
        resolve(parseRawRows(rawRows));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function parseWorkbook(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'array' });
        let bestCandidate: ParsedCandidate | null = null;

        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' }) as any[][];
          const candidate = buildBestCandidate(rawRows);
          if (candidate && (!bestCandidate || candidate.score > bestCandidate.score)) {
            bestCandidate = candidate;
          }
        }

        resolve(bestCandidate?.data ?? []);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function parseTextMatrix(text: string, ext: string): any[][] {
  const normalized = text.replace(/^\uFEFF/, '');
  const lines = normalized.split(/\r?\n/);
  const delimiter = detectDelimiter(lines, ext);

  return lines
    .map((line) => splitDelimitedLine(line, delimiter))
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
}

function detectDelimiter(lines: string[], ext: string): string | RegExp {
  if (ext === 'csv') return ',';
  if (ext === 'tsv') return '\t';

  const firstDataLine = lines.find((line) => line.trim());
  if (!firstDataLine) return ',';
  if (firstDataLine.includes('\t')) return '\t';
  if (firstDataLine.includes(',')) return ',';
  if (firstDataLine.includes(';')) return ';';
  return /\s{2,}|\t+/;
}

function splitDelimitedLine(line: string, delimiter: string | RegExp): string[] {
  if (delimiter instanceof RegExp) {
    return line.trim().split(delimiter).map((part) => part.trim());
  }

  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseRawRows(rawRows: any[][]): ParsedRow[] {
  const candidate = buildBestCandidate(rawRows);
  return candidate?.data ?? [];
}

function buildBestCandidate(rawRows: any[][]): ParsedCandidate | null {
  const candidates = [
    buildRowBasedCandidate(rawRows),
    buildTransposedCandidate(rawRows),
  ].filter((candidate): candidate is ParsedCandidate => candidate !== null);

  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => b.score - a.score)[0];
}

function buildRowBasedCandidate(rawRows: any[][], maxScan = 20): ParsedCandidate | null {
  let best: ParsedCandidate | null = null;

  for (let headerRowIdx = 0; headerRowIdx < Math.min(maxScan, rawRows.length); headerRowIdx++) {
    const headerRow = rawRows[headerRowIdx];
    if (!headerRow || headerRow.length < 3) continue;

    const colMap = mapOxideColumns(headerRow);
    const matchCount = Object.keys(colMap).length;
    const coreMatched = CORE_OXIDES.filter((oxide) => oxide in colMap).length;
    if (matchCount < 3 || coreMatched < 3) continue;

    const sampleColumn = resolveSampleColumn(headerRow, colMap);
    const data = extractRowBasedData(rawRows, headerRowIdx, colMap, sampleColumn.index);
    if (data.length === 0) continue;

    const sampleTextScore = scoreTextualSamples(data);
    const score = matchCount * 100 + (sampleColumn.explicit ? 300 : 0) + sampleTextScore * 500 + data.length;

    if (!best || score > best.score) {
      best = { data, matchCount, score };
    }
  }

  return best;
}

function buildTransposedCandidate(rawRows: any[][], maxScan = 40): ParsedCandidate | null {
  let best: ParsedCandidate | null = null;
  const maxCols = getMaxColumnCount(rawRows);
  const labelColLimit = Math.min(4, maxCols);

  for (let headerRowIdx = 0; headerRowIdx < Math.min(maxScan, rawRows.length); headerRowIdx++) {
    for (let labelColIdx = 0; labelColIdx < labelColLimit; labelColIdx++) {
      const oxideRowMap = findTransposedOxideRows(rawRows, headerRowIdx, labelColIdx);
      const matchCount = Object.keys(oxideRowMap).length;
      const coreMatched = CORE_OXIDES.filter((oxide) => oxide in oxideRowMap).length;
      if (matchCount < 3 || coreMatched < 3) continue;

      const sampleColumns = findTransposedSampleColumns(rawRows, headerRowIdx, labelColIdx, oxideRowMap);
      if (sampleColumns.length === 0) continue;

      const data = sampleColumns
        .map((columnIdx) => buildTransposedRow(rawRows, headerRowIdx, columnIdx, oxideRowMap))
        .filter((row): row is ParsedRow => row !== null);

      if (data.length === 0) continue;

      const sampleTextScore = scoreTextualSamples(data);
      if (sampleTextScore === 0) continue;

      const firstOxideRowIdx = Math.min(...Object.values(oxideRowMap));
      const headerDistance = Math.max(0, firstOxideRowIdx - headerRowIdx - 1);
      const score = matchCount * 1000 + sampleColumns.length * 20 + sampleTextScore * 40 - headerDistance * 150;

      if (!best || score > best.score) {
        best = { data, matchCount, score };
      }
    }
  }

  return best;
}

function mapOxideColumns(row: any[]): Record<string, number> {
  const headers = Array.from(row, (value) => cleanHeader(String(value ?? '')));
  const colMap: Record<string, number> = {};

  for (let columnIdx = 0; columnIdx < headers.length; columnIdx++) {
    const header = headers[columnIdx];
    if (!header) continue;

    for (const oxide of OXIDE_KEYS) {
      if (!(oxide in colMap) && matchesOxide(header, oxide)) {
        colMap[oxide] = columnIdx;
      }
    }
  }

  return colMap;
}

function resolveSampleColumn(headerRow: any[], colMap: Record<string, number>): SampleColumnMatch {
  const oxideColumns = new Set(Object.values(colMap));
  let bestMatch: SampleColumnMatch | null = null;
  let bestScore = 0;

  for (let columnIdx = 0; columnIdx < headerRow.length; columnIdx++) {
    if (oxideColumns.has(columnIdx)) continue;

    const header = String(headerRow[columnIdx] ?? '');
    const score = getSampleAliasScore(header);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { explicit: true, index: columnIdx };
    }
  }

  if (bestMatch) return bestMatch;

  for (let columnIdx = 0; columnIdx < headerRow.length; columnIdx++) {
    if (!oxideColumns.has(columnIdx)) {
      return { explicit: false, index: columnIdx };
    }
  }

  return { explicit: false, index: 0 };
}

function extractRowBasedData(
  rawRows: any[][],
  headerRowIdx: number,
  colMap: Record<string, number>,
  sampleColumnIdx: number,
): ParsedRow[] {
  const data: ParsedRow[] = [];

  for (let rowIdx = headerRowIdx + 1; rowIdx < rawRows.length; rowIdx++) {
    const row = rawRows[rowIdx];
    if (!row || row.length === 0) continue;

    const sampleValue = String(row[sampleColumnIdx] ?? '').trim();
    if (shouldSkipSampleValue(sampleValue)) continue;

    const parsedRow = buildParsedRow(sampleValue, (oxide) => row[colMap[oxide]]);
    if (parsedRow) data.push(parsedRow);
  }

  return data;
}

function findTransposedOxideRows(
  rawRows: any[][],
  headerRowIdx: number,
  labelColIdx: number,
  maxDepth = 80,
): Record<string, number> {
  const rowMap: Record<string, number> = {};

  for (let rowIdx = headerRowIdx + 1; rowIdx < Math.min(rawRows.length, headerRowIdx + maxDepth); rowIdx++) {
    const label = cleanHeader(String(rawRows[rowIdx]?.[labelColIdx] ?? ''));
    if (!label) continue;

    for (const oxide of OXIDE_KEYS) {
      if (!(oxide in rowMap) && matchesOxide(label, oxide)) {
        rowMap[oxide] = rowIdx;
      }
    }
  }

  return rowMap;
}

function findTransposedSampleColumns(
  rawRows: any[][],
  headerRowIdx: number,
  labelColIdx: number,
  oxideRowMap: Record<string, number>,
): number[] {
  const matchedOxides = Object.keys(oxideRowMap);
  const columns: number[] = [];
  const maxCols = getMaxColumnCount(rawRows);

  for (let columnIdx = labelColIdx + 1; columnIdx < maxCols; columnIdx++) {
    let numericCount = 0;
    for (const oxide of matchedOxides) {
      if (parseFlexibleNumber(rawRows[oxideRowMap[oxide]]?.[columnIdx]) !== null) {
        numericCount += 1;
      }
    }
    if (numericCount >= 3) {
      columns.push(columnIdx);
    }
  }

  return columns;
}

function buildTransposedRow(
  rawRows: any[][],
  headerRowIdx: number,
  columnIdx: number,
  oxideRowMap: Record<string, number>,
): ParsedRow | null {
  const sample = buildTransposedSampleName(rawRows, headerRowIdx, columnIdx);
  return buildParsedRow(sample, (oxide) => rawRows[oxideRowMap[oxide]]?.[columnIdx]);
}

function buildTransposedSampleName(rawRows: any[][], headerRowIdx: number, columnIdx: number): string {
  const parts = [
    normalizeSamplePart(rawRows[headerRowIdx - 1]?.[columnIdx]),
    normalizeSamplePart(rawRows[headerRowIdx]?.[columnIdx]),
  ].filter(Boolean);

  const uniqueParts = parts.filter((part, index) => parts.indexOf(part) === index && !isGenericHeaderPart(part));
  return uniqueParts.join(' ').trim() || `Sample-${columnIdx}`;
}

function buildParsedRow(sample: string, valueGetter: (oxide: string) => any): ParsedRow | null {
  const sampleText = String(sample ?? '').trim();
  if (!sampleText) return null;

  const parsedRow: ParsedRow = { Sample: sampleText };
  let hasValue = false;

  for (const oxide of OXIDE_KEYS) {
    const numericValue = parseFlexibleNumber(valueGetter(oxide));
    parsedRow[oxide] = numericValue === null ? '0' : String(numericValue);
    if (numericValue !== null && numericValue > 0) {
      hasValue = true;
    }
  }

  return hasValue ? parsedRow : null;
}

function scoreTextualSamples(data: ParsedRow[]): number {
  return data
    .slice(0, 5)
    .reduce((score, row) => score + (looksLikeDescriptiveSample(String(row.Sample ?? '')) ? 1 : 0), 0);
}

function looksLikeDescriptiveSample(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return false;
  if (/^sample-\d+$/i.test(trimmed)) return false;
  return /[A-Za-z\u4e00-\u9fa5_-]/.test(trimmed);
}

function shouldSkipSampleValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (SUMMARY_ROW_PATTERN.test(trimmed)) return true;
  return getSampleAliasScore(trimmed) >= 80;
}

function getSampleAliasScore(value: string): number {
  const normalized = cleanHeader(value).toLowerCase();
  const raw = String(value ?? '').trim().toLowerCase();
  let bestScore = 0;

  DESCRIPTIVE_SAMPLE_ALIASES.forEach((alias, index) => {
    const exactScore = 220 - index;
    const partialScore = 180 - index;
    if (normalized === alias || raw === alias) {
      bestScore = Math.max(bestScore, exactScore);
    } else if (normalized.includes(alias) || raw.includes(alias)) {
      bestScore = Math.max(bestScore, partialScore);
    }
  });

  GENERIC_SAMPLE_ALIASES.forEach((alias, index) => {
    const exactScore = 140 - index;
    const partialScore = 100 - index;
    if (normalized === alias || raw === alias) {
      bestScore = Math.max(bestScore, exactScore);
    } else if (normalized.includes(alias) || raw.includes(alias)) {
      bestScore = Math.max(bestScore, partialScore);
    }
  });

  return bestScore;
}

function parseFlexibleNumber(value: any): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Number(value.toFixed(6)).valueOf() : null;
  }

  const cleaned = String(value ?? '').replace(/,/g, '').trim();
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(6)).valueOf() : null;
}

function getMaxColumnCount(rawRows: any[][]): number {
  return rawRows.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);
}

function normalizeSamplePart(value: any): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isGenericHeaderPart(value: string): boolean {
  const normalized = cleanHeader(value).toLowerCase();
  return !normalized || GENERIC_HEADER_PATTERN.test(normalized);
}

/** 清理列名，方便兼容不同导出模板。 */
function cleanHeader(header: string): string {
  return String(header ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[（(][%％wt]*[）)]/g, '')  // (%), (wt%), （%）
    .replace(/^\(%\)\[?/, '')
    .replace(/\]?\(%\)$/, '')
    .replace(/[%％]/g, '')
    .replace(/[\[\]]/g, '');             // 去掉残留的方括号，如 (%)[SiO2 → [SiO2 → SiO2
}

/** 检查清理后的列名是否匹配某个氧化物。 */
function matchesOxide(cleaned: string, oxide: string): boolean {
  if (cleaned === oxide) return true;
  if (
    cleaned.startsWith(oxide) &&
    (cleaned.length === oxide.length || /^[^A-Za-z]/.test(cleaned.slice(oxide.length)))
  ) {
    return true;
  }
  if (oxide === 'FeO' && /^FeO[tT(]/.test(cleaned)) return true;
  return false;
}
