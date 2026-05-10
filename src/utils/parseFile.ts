import * as XLSX from 'xlsx';

type ParsedRow = Record<string, string>;

interface ParsedCandidate {
  data: ParsedRow[];
  matchCount: number;
  score: number;
}

interface ParsedCandidateContext {
  datasetLabel: string;
  sheetName?: string;
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
const MEASUREMENT_ROW_PATTERN = /^(含量|含量％|wt|wt%|wtpercent|weightpercent|masspercent)$/i;
const TEMPLATE_TEXT_PATTERN = /(resumelicalculation|nolicalculation|required|formulaunitcalculations|peaksearchreport|parabolicfilter|threshold|cutoff|peaktop|lio2calc|monier|tindle|webb|europeanjournalofmineralogy)/i;

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
        resolve(parseRawRows(rawRows, { datasetLabel: stripExtension(file.name) }));
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
        const workbook = XLSX.read(e.target?.result, { type: 'array', bookFiles: true });
        const datasetLabel = stripExtension(file.name);

        for (const sheetName of resolvePreferredSheetNames(workbook)) {
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) continue;

          const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' }) as any[][];
          const candidate = buildBestCandidate(rawRows, { datasetLabel, sheetName });
          if (candidate) {
            resolve(candidate.data);
            return;
          }
        }

        resolve([]);
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

function parseRawRows(rawRows: any[][], context: ParsedCandidateContext): ParsedRow[] {
  const candidate = buildBestCandidate(rawRows, context);
  return candidate?.data ?? [];
}

function resolvePreferredSheetNames(workbook: XLSX.WorkBook): string[] {
  const allSheetNames = workbook.SheetNames.slice();
  const activeSheetName = resolveActiveSheetName(workbook);
  const visibleSheetNames = allSheetNames.filter((sheetName, index) => {
    const hidden = workbook.Workbook?.Sheets?.[index]?.Hidden;
    return hidden !== 1 && hidden !== 2;
  });

  const preferred = activeSheetName
    ? [
      activeSheetName,
      ...visibleSheetNames.filter((sheetName) => sheetName !== activeSheetName),
      ...allSheetNames.filter((sheetName) => sheetName !== activeSheetName && !visibleSheetNames.includes(sheetName)),
    ]
    : [
      ...visibleSheetNames,
      ...allSheetNames.filter((sheetName) => !visibleSheetNames.includes(sheetName)),
    ];

  return preferred.filter((sheetName, index) => preferred.indexOf(sheetName) === index);
}

function resolveActiveSheetName(workbook: XLSX.WorkBook): string | null {
  const workbookXml = readWorkbookXml(workbook);
  if (!workbookXml) return null;

  const match = workbookXml.match(/\bactiveTab="(\d+)"/);
  if (!match) return null;

  const activeSheetIndex = Number(match[1]);
  if (!Number.isInteger(activeSheetIndex) || activeSheetIndex < 0) return null;

  return workbook.SheetNames[activeSheetIndex] ?? null;
}

function readWorkbookXml(workbook: XLSX.WorkBook): string | null {
  const workbookFile = (workbook as XLSX.WorkBook & {
    files?: Record<string, { content?: string | Uint8Array | ArrayBuffer }>;
  }).files?.['xl/workbook.xml'];

  const content = workbookFile?.content;
  if (!content) return null;
  if (typeof content === 'string') return content;
  if (content instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(content));
  if (content instanceof Uint8Array) return new TextDecoder().decode(content);

  return null;
}

function buildBestCandidate(rawRows: any[][], context: ParsedCandidateContext): ParsedCandidate | null {
  const oxideCandidates = [
    buildRowBasedCandidate(rawRows),
    buildTransposedCandidate(rawRows),
    buildBlockBasedCandidate(rawRows),
  ].filter((candidate): candidate is ParsedCandidate => candidate !== null);

  if (oxideCandidates.length > 0) {
    return oxideCandidates.sort((a, b) => b.score - a.score)[0];
  }

  const generalCandidates = [
    buildPeakReportCandidate(rawRows, context),
    buildPatternSeriesCandidate(rawRows, context),
  ].filter((candidate): candidate is ParsedCandidate => candidate !== null);

  if (generalCandidates.length === 0) return null;

  return generalCandidates.sort((a, b) => b.score - a.score)[0];
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
    const oxideMagnitude = scoreOxideMagnitude(data);
    if (oxideMagnitude < 60) continue;
    const score = matchCount * 100 + (sampleColumn.explicit ? 300 : 0) + sampleTextScore * 500 + oxideMagnitude * 10 + data.length;

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
      if (sampleTextScore === 0 && sampleColumns.length < 6) continue;

      const firstOxideRowIdx = Math.min(...Object.values(oxideRowMap));
      const headerDistance = Math.max(0, firstOxideRowIdx - headerRowIdx - 1);
      const oxideMagnitude = scoreOxideMagnitude(data);
      if (oxideMagnitude < 60) continue;
      const headerSampleScore = scoreHeaderSampleRow(rawRows[headerRowIdx]) + scoreHeaderSampleRow(rawRows[headerRowIdx - 1] ?? []);
      const score = matchCount * 1000 + sampleColumns.length * 20 + sampleTextScore * 40 + oxideMagnitude * 20 + headerSampleScore * 150 - headerDistance * 150 - firstOxideRowIdx * 30 - (sampleTextScore === 0 ? 120 : 0);

      if (!best || score > best.score) {
        best = { data, matchCount, score };
      }
    }
  }

  return best;
}

function buildBlockBasedCandidate(rawRows: any[][], maxScan = 120): ParsedCandidate | null {
  const data: ParsedRow[] = [];
  let strongestMatch = 0;

  for (let rowIdx = 0; rowIdx < Math.min(maxScan, rawRows.length - 2); rowIdx++) {
    const sample = normalizeSamplePart(rawRows[rowIdx]?.[0]);
    const headerRow = rawRows[rowIdx + 1];
    const valuesRow = rawRows[rowIdx + 2];

    if (!looksLikeDescriptiveSample(sample) || looksLikeTemplateInstruction(sample)) continue;
    if (!headerRow || !valuesRow) continue;
    if (!isMeasurementRow(valuesRow[0])) continue;

    const colMap = mapOxideColumns(headerRow);
    const matchCount = Object.keys(colMap).length;
    const coreMatched = CORE_OXIDES.filter((oxide) => oxide in colMap).length;
    if (matchCount < 3 || coreMatched < 3) continue;

    const parsedRow = buildParsedRow(sample, (oxide) => valuesRow[colMap[oxide]]);
    if (!parsedRow) continue;

    strongestMatch = Math.max(strongestMatch, matchCount);
    data.push(parsedRow);
  }

  if (data.length === 0) return null;

  const oxideMagnitude = scoreOxideMagnitude(data);
  if (oxideMagnitude < 60) return null;
  const score = strongestMatch * 1000 + scoreTextualSamples(data) * 300 + oxideMagnitude * 20 + data.length * 20;
  return { data, matchCount: strongestMatch, score };
}

function buildPeakReportCandidate(rawRows: any[][], context: ParsedCandidateContext, maxScan = 24): ParsedCandidate | null {
  let best: ParsedCandidate | null = null;

  for (let headerRowIdx = 0; headerRowIdx < Math.min(maxScan, rawRows.length); headerRowIdx++) {
    const columnMap = mapPeakColumns(rawRows[headerRowIdx] ?? []);
    const matched = Object.keys(columnMap).length;
    if (columnMap.TwoTheta === undefined) continue;
    if (columnMap.Height === undefined && columnMap.Area === undefined && columnMap.Intensity === undefined) continue;
    if (matched < 3) continue;

    const seriesLabel = resolveDatasetSeriesLabel(rawRows, headerRowIdx, context);
    const data = extractPeakRows(rawRows, headerRowIdx, columnMap, seriesLabel);
    if (data.length === 0) continue;

    const score = matched * 500 + data.length * 10;
    if (!best || score > best.score) {
      best = { data, matchCount: matched, score };
    }
  }

  return best;
}

function buildPatternSeriesCandidate(rawRows: any[][], context: ParsedCandidateContext, maxScan = 16): ParsedCandidate | null {
  let best: ParsedCandidate | null = null;

  for (let headerRowIdx = 0; headerRowIdx < Math.min(maxScan, rawRows.length); headerRowIdx++) {
    const columnMap = mapPatternColumns(rawRows[headerRowIdx] ?? []);
    if (columnMap.TwoTheta === undefined || columnMap.Intensity === undefined) continue;

    const data = extractPatternRows(rawRows, headerRowIdx + 1, columnMap, context.sheetName ?? context.datasetLabel);
    if (data.length === 0) continue;

    const score = data.length * 10 + 300;
    if (!best || score > best.score) {
      best = { data, matchCount: 2, score };
    }
  }

  const numericDataStart = findNumericPairStart(rawRows);
  if (numericDataStart === -1) return best;

  const fallbackData = extractPatternRows(rawRows, numericDataStart, { TwoTheta: 0, Intensity: 1 }, context.datasetLabel);
  if (fallbackData.length === 0) return best;

  const fallbackScore = fallbackData.length * 10 + 200;
  if (!best || fallbackScore > best.score) {
    return { data: fallbackData, matchCount: 2, score: fallbackScore };
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
    normalizeSamplePart(rawRows[headerRowIdx - 2]?.[columnIdx]),
    normalizeSamplePart(rawRows[headerRowIdx - 1]?.[columnIdx]),
    normalizeSamplePart(rawRows[headerRowIdx]?.[columnIdx]),
  ].filter(Boolean);

  const uniqueParts = parts.filter((part, index) =>
    parts.indexOf(part) === index &&
    !isGenericHeaderPart(part) &&
    !looksLikeTemplateInstruction(part) &&
    looksLikeDescriptiveSample(part),
  );
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

function scoreOxideMagnitude(data: ParsedRow[]): number {
  if (data.length === 0) return 0;

  const totals = data.slice(0, 5).map((row) =>
    OXIDE_KEYS.reduce((sum, oxide) => sum + (parseFlexibleNumber(row[oxide]) ?? 0), 0),
  );
  const averageTotal = totals.reduce((sum, total) => sum + total, 0) / totals.length;
  return Math.min(120, Math.max(0, averageTotal));
}

function scoreHeaderSampleRow(row: any[]): number {
  return (row ?? []).reduce((score, value) => score + (looksLikeDescriptiveSample(normalizeSamplePart(value)) ? 1 : 0), 0);
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
  if (looksLikeTemplateInstruction(trimmed)) return true;
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
  return !normalized || GENERIC_HEADER_PATTERN.test(normalized) || looksLikeTemplateInstruction(value);
}

function isMeasurementRow(value: any): boolean {
  const normalized = cleanHeader(String(value ?? ''));
  return MEASUREMENT_ROW_PATTERN.test(normalized) || normalized === '含量';
}

function looksLikeTemplateInstruction(value: string): boolean {
  const normalized = cleanHeader(value).toLowerCase();
  return (
    (normalized.length > 24 && TEMPLATE_TEXT_PATTERN.test(normalized)) ||
    (normalized.length > 36 && /[a-z]{8,}/i.test(value) && !/[A-Z]{1,3}\d{2,}/.test(value))
  );
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

function resolveDatasetSeriesLabel(rawRows: any[][], headerRowIdx: number, context: ParsedCandidateContext): string {
  for (let rowIdx = headerRowIdx - 1; rowIdx >= Math.max(0, headerRowIdx - 3); rowIdx--) {
    const parts = (rawRows[rowIdx] ?? []).map((value) => normalizeSamplePart(value)).filter(Boolean);
    const combined = parts.join(' ').trim();
    if (!combined) continue;

    const bracketMatch = combined.match(/\[([^\]]+)\]/);
    if (bracketMatch) return bracketMatch[1];
    if (!looksLikeTemplateInstruction(combined)) return combined;
  }

  return context.sheetName ?? context.datasetLabel;
}

function mapPatternColumns(row: any[]): Record<string, number> {
  const columnMap: Record<string, number> = {};

  row.forEach((value, index) => {
    const raw = String(value ?? '').trim().toLowerCase();
    const normalized = cleanHeader(String(value ?? '')).toLowerCase();
    if (columnMap.TwoTheta === undefined && (normalized === '2-theta' || normalized === '2theta' || raw === '2-theta' || raw === '2-theta°')) {
      columnMap.TwoTheta = index;
      return;
    }
    if (columnMap.Intensity === undefined && (normalized === 'if' || raw === 'i(f)' || normalized === 'intensity' || normalized === 'counts')) {
      columnMap.Intensity = index;
    }
  });

  return columnMap;
}

function mapPeakColumns(row: any[]): Record<string, number> {
  const columnMap: Record<string, number> = {};

  row.forEach((value, index) => {
    const raw = String(value ?? '').trim().toLowerCase();
    const normalized = cleanHeader(String(value ?? '')).toLowerCase();

    if (columnMap.TwoTheta === undefined && (normalized === '2theta' || raw === '2-theta')) {
      columnMap.TwoTheta = index;
      return;
    }
    if (columnMap.DSpacing === undefined && (raw.startsWith('d(') || raw === 'd(?)' || normalized === 'd' || normalized === 'd?')) {
      columnMap.DSpacing = index;
      return;
    }
    if (columnMap.Background === undefined && normalized === 'bg') {
      columnMap.Background = index;
      return;
    }
    if (columnMap.Height === undefined && normalized === 'height') {
      columnMap.Height = index;
      return;
    }
    if (columnMap.Intensity === undefined && raw === 'i%') {
      columnMap.Intensity = index;
      return;
    }
    if (columnMap.Area === undefined && normalized === 'area') {
      columnMap.Area = index;
      return;
    }
    if (columnMap.AreaPercent === undefined && raw === 'i%') {
      columnMap.AreaPercent = index;
      return;
    }
    if (columnMap.FWHM === undefined && normalized === 'fwhm') {
      columnMap.FWHM = index;
    }
  });

  return columnMap;
}

function extractPatternRows(
  rawRows: any[][],
  startRowIdx: number,
  columnMap: Record<string, number>,
  seriesLabel: string,
): ParsedRow[] {
  const data: ParsedRow[] = [];
  let started = false;

  for (let rowIdx = startRowIdx; rowIdx < rawRows.length; rowIdx++) {
    const row = rawRows[rowIdx];
    if (!row || row.length === 0) {
      if (started) break;
      continue;
    }

    const collapsedPair = extractCollapsedNumericPair(row);
    const twoTheta = parseFlexibleNumber(row[columnMap.TwoTheta]) ?? collapsedPair?.twoTheta ?? null;
    const intensity = parseFlexibleNumber(row[columnMap.Intensity]) ?? collapsedPair?.intensity ?? null;
    if (twoTheta === null || intensity === null) {
      if (started) break;
      continue;
    }

    started = true;
    data.push({
      Sample: seriesLabel,
      TwoTheta: String(twoTheta),
      Intensity: String(intensity),
    });
  }

  return data;
}

function extractPeakRows(
  rawRows: any[][],
  headerRowIdx: number,
  columnMap: Record<string, number>,
  seriesLabel: string,
): ParsedRow[] {
  const data: ParsedRow[] = [];

  for (let rowIdx = headerRowIdx + 1; rowIdx < rawRows.length; rowIdx++) {
    const row = rawRows[rowIdx];
    if (!row || row.length === 0) continue;

    const twoTheta = parseFlexibleNumber(row[columnMap.TwoTheta]);
    if (twoTheta === null) continue;

    const peakRow: ParsedRow = {
      Sample: seriesLabel,
      TwoTheta: String(twoTheta),
    };

    if (columnMap.DSpacing !== undefined) {
      const dSpacing = parseFlexibleNumber(row[columnMap.DSpacing]);
      if (dSpacing !== null) peakRow.DSpacing = String(dSpacing);
    }
    if (columnMap.Background !== undefined) {
      const background = parseFlexibleNumber(row[columnMap.Background]);
      if (background !== null) peakRow.Background = String(background);
    }
    if (columnMap.Height !== undefined) {
      const height = parseFlexibleNumber(row[columnMap.Height]);
      if (height !== null) peakRow.Height = String(height);
    }
    if (columnMap.Intensity !== undefined) {
      const intensity = parseFlexibleNumber(row[columnMap.Intensity]);
      if (intensity !== null) peakRow.Intensity = String(intensity);
    }
    if (columnMap.Area !== undefined) {
      const area = parseFlexibleNumber(row[columnMap.Area]);
      if (area !== null) peakRow.Area = String(area);
    }
    if (columnMap.AreaPercent !== undefined) {
      const areaPercent = parseFlexibleNumber(row[columnMap.AreaPercent]);
      if (areaPercent !== null) peakRow.AreaPercent = String(areaPercent);
    }
    if (columnMap.FWHM !== undefined) {
      const fwhm = parseFlexibleNumber(row[columnMap.FWHM]);
      if (fwhm !== null) peakRow.FWHM = String(fwhm);
    }

    data.push(peakRow);
  }

  return data;
}

function findNumericPairStart(rawRows: any[][]): number {
  for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
    const row = rawRows[rowIdx];
    if (!row || row.length === 0) continue;

    const collapsedPair = extractCollapsedNumericPair(row);
    const first = parseFlexibleNumber(row[0]) ?? collapsedPair?.twoTheta ?? null;
    const second = parseFlexibleNumber(row[1]) ?? collapsedPair?.intensity ?? null;
    if (first === null || second === null) continue;

    let runLength = 0;
    for (let nextIdx = rowIdx; nextIdx < rawRows.length; nextIdx++) {
      const nextRow = rawRows[nextIdx];
      if (!nextRow || nextRow.length === 0) break;
      const nextPair = extractCollapsedNumericPair(nextRow);
      const nextFirst = parseFlexibleNumber(nextRow[0]) ?? nextPair?.twoTheta ?? null;
      const nextSecond = parseFlexibleNumber(nextRow[1]) ?? nextPair?.intensity ?? null;
      if (nextFirst === null || nextSecond === null) break;
      runLength += 1;
    }

    if (runLength >= 20) return rowIdx;
  }

  return -1;
}

function extractCollapsedNumericPair(row: any[]): { twoTheta: number; intensity: number } | null {
  if (row.length !== 1) return null;

  const match = String(row[0] ?? '').trim().match(/^([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const twoTheta = parseFlexibleNumber(match[1]);
  const intensity = parseFlexibleNumber(match[2]);
  if (twoTheta === null || intensity === null) return null;

  return { twoTheta, intensity };
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
