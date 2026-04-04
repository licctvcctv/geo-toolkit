import { calculateStructuralFormula, identifyMineral } from './geo-calculations';

export type AnalysisSource = 'chlorite' | 'biotite' | 'mineral';
export type MineralType = 'Chlorite' | 'Biotite' | 'Muscovite' | 'Unknown';

export interface AnalysisDetectionResult {
  source: AnalysisSource;
  dominantMineral: MineralType;
  confidence: number;
  validRows: number;
  counts: Record<MineralType, number>;
  label: string;
  detail: string;
}

const DETECTION_THRESHOLD = 0.7;

const SOURCE_LABELS: Record<AnalysisSource, string> = {
  chlorite: '绿泥石温度计',
  biotite: '黑云母温度计',
  mineral: '矿物识别',
};

export function detectAnalysisMode(rows: any[]): AnalysisDetectionResult {
  const counts: Record<MineralType, number> = {
    Chlorite: 0,
    Biotite: 0,
    Muscovite: 0,
    Unknown: 0,
  };

  let validRows = 0;

  for (const row of rows) {
    const formula = calculateStructuralFormula(row, 22);
    if (!formula) continue;

    validRows += 1;
    const type = identifyMineral(formula) as MineralType;
    counts[type] += 1;
  }

  if (validRows === 0) {
    return {
      source: 'mineral',
      dominantMineral: 'Unknown',
      confidence: 0,
      validRows: 0,
      counts,
      label: SOURCE_LABELS.mineral,
      detail: '未找到可识别的氧化物数据，已保持矿物识别模式。',
    };
  }

  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]) as [MineralType, number][];
  const [dominantMineral, dominantCount] = ranked[0];
  const confidence = dominantCount / validRows;

  let source: AnalysisSource = 'mineral';
  if (dominantMineral === 'Chlorite' && confidence >= DETECTION_THRESHOLD) {
    source = 'chlorite';
  } else if (dominantMineral === 'Biotite' && confidence >= DETECTION_THRESHOLD) {
    source = 'biotite';
  }

  let detail = '';
  if (source === 'chlorite') {
    detail = `系统判定为绿泥石数据（${dominantCount}/${validRows}），已自动切换到绿泥石温度计。`;
  } else if (source === 'biotite') {
    detail = `系统判定为黑云母数据（${dominantCount}/${validRows}），已自动切换到黑云母温度计。`;
  } else if (dominantMineral === 'Muscovite') {
    detail = `系统判定为白云母/绢云母数据（${dominantCount}/${validRows}），已自动进入矿物识别。`;
  } else {
    detail = `类型混合或不够明确（${dominantCount}/${validRows}），已自动进入矿物识别。`;
  }

  return {
    source,
    dominantMineral,
    confidence: Number(confidence.toFixed(2)),
    validRows,
    counts,
    label: SOURCE_LABELS[source],
    detail,
  };
}
