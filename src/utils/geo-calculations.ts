export interface OxideData {
  SiO2?: number | string;
  TiO2?: number | string;
  Al2O3?: number | string;
  Cr2O3?: number | string;
  FeO?: number | string;
  MnO?: number | string;
  MgO?: number | string;
  CaO?: number | string;
  Na2O?: number | string;
  K2O?: number | string;
  [key: string]: any;
}

export interface StructuralFormula {
  Si: number;
  Ti: number;
  Al: number;
  Al_IV: number;
  Al_VI: number;
  Cr: number;
  Fe: number;
  Mn: number;
  Mg: number;
  Ca: number;
  Na: number;
  K: number;
  Total: number;
  [key: string]: any;
}

// Molecular weights
const MOLECULAR_WEIGHTS: Record<string, number> = {
  SiO2: 60.08,
  TiO2: 79.866,
  Al2O3: 101.96,
  Cr2O3: 151.99,
  FeO: 71.844,
  MnO: 70.937,
  MgO: 40.304,
  CaO: 56.077,
  Na2O: 61.979,
  K2O: 94.2,
};

const CATIONS_PER_OXIDE: Record<string, number> = {
  SiO2: 1, TiO2: 1, Al2O3: 2, Cr2O3: 2,
  FeO: 1, MnO: 1, MgO: 1, CaO: 1, Na2O: 2, K2O: 2,
};

const OXYGEN_PER_OXIDE: Record<string, number> = {
  SiO2: 2, TiO2: 2, Al2O3: 3, Cr2O3: 3,
  FeO: 1, MnO: 1, MgO: 1, CaO: 1, Na2O: 1, K2O: 1,
};

/**
 * Calculates structural formula from electron microprobe oxide data.
 * @param data Oxide wt% data
 * @param targetOxygen Normalization basis (e.g., 28 for chlorite, 22 for micas)
 */
export function calculateStructuralFormula(data: OxideData, targetOxygen: number): StructuralFormula | null {
  let totalOxide = 0;
  const molProps: Record<string, number> = {};
  
  for (const oxide in MOLECULAR_WEIGHTS) {
    const wtPercent = Number(data[oxide] || 0);
    totalOxide += wtPercent;
    if (wtPercent > 0) {
      molProps[oxide] = wtPercent / MOLECULAR_WEIGHTS[oxide];
    }
  }

  // Basic filtering for valid analyses
  if (totalOxide < 80 || totalOxide > 115) {
    return null;
  }

  let totalOxygenProps = 0;
  for (const oxide in molProps) {
    totalOxygenProps += molProps[oxide] * OXYGEN_PER_OXIDE[oxide];
  }

  if (totalOxygenProps === 0) return null;

  const normalize = targetOxygen / totalOxygenProps;

  const getCation = (oxide: string) => {
    if (!molProps[oxide]) return 0;
    return Number((molProps[oxide] * CATIONS_PER_OXIDE[oxide] * normalize).toFixed(3));
  };

  const Si = getCation('SiO2');
  const Ti = getCation('TiO2');
  const Al = getCation('Al2O3');
  const Cr = getCation('Cr2O3');
  const Fe = getCation('FeO');
  const Mn = getCation('MnO');
  const Mg = getCation('MgO');
  const Ca = getCation('CaO');
  const Na = getCation('Na2O');
  const K = getCation('K2O');

  // Max tetrahedral positions are 8 for both 28 O (chlorite) and 22 O (mica) structures 
  // (per full unit cell; often half cell is used: 14 O and 11 O -> 4 tetrahedral positions)
  const maxTetra = (targetOxygen === 28 || targetOxygen === 22) ? 8 : 4;
  
  let Al_IV = Math.max(0, maxTetra - Si);
  if (Al_IV > Al) Al_IV = Al;
  const Al_VI = Al - Al_IV;

  return {
    Si, Ti, Al, 
    Al_IV: Number(Al_IV.toFixed(3)), 
    Al_VI: Number(Al_VI.toFixed(3)), 
    Cr, Fe, Mn, Mg, Ca, Na, K, 
    Total: Number(totalOxide.toFixed(2))
  };
}

/**
 * Calculates chlorite formation temperature based on varying empirical formulas.
 */
export function calculateChloriteTemperature(formula: StructuralFormula) {
  const { Al_IV, Fe, Mg } = formula;
  const Fe_ratio = Fe / ((Fe + Mg) || 1); // Fe/(Fe+Mg)

  const Al_c_jowett = Al_IV + 0.1 * Fe_ratio;
  const Al_c_km = Al_IV + 0.7 * Fe_ratio;

  return {
    Cathelineau: Number((-61.92 + 321.98 * Al_IV).toFixed(1)),
    Jowett: Number((319 * Al_c_jowett - 69).toFixed(1)),
    Kranidiotis: Number((106 * Al_c_km + 18).toFixed(1)),
    Zang: Number((106.2 * Al_c_km + 17.5).toFixed(1))
  };
}

/**
 * Identifies mineral type based on structural formula calculated on 22 Oxygen basis.
 * By normalizing to 22 O, we can distinguish Micas from Chlorite (which fits poorly).
 */
export function identifyMineral(formula22O: StructuralFormula): 'Muscovite' | 'Chlorite' | 'Biotite' | 'Unknown' {
  const { Si, Al_VI, Fe, Mg, K, Na, Ca } = formula22O;
  const FeMg = Fe + Mg;
  const alkalis = K + Na + Ca;

  // Rule-based identification (approximate boundaries)
  if (alkalis < 0.5 && FeMg > 4.0) {
    return 'Chlorite'; // Low alkalis, high Fe+Mg (Note: ideally chlorite is calculated on 28 O)
  }
  
  if (alkalis > 1.0) {
    if (Al_VI > 2.0 && FeMg < 2.5) {
      return 'Muscovite'; // Dioctahedral mica: high VI Al, low Fe+Mg
    }
    if (FeMg > 3.0) {
      return 'Biotite'; // Trioctahedral mica: high Fe+Mg
    }
  }

  return 'Unknown';
}

/**
 * Hey (1954) Chlorite classification based on Si apfu and Total Fe (Fe/(Fe+Mg)).
 * Assumes 28 Oxygen basis.
 */
export function classifyChlorite(formula: StructuralFormula): string {
  const { Si, Fe, Mg } = formula;
  const fe_ratio = Fe / ((Fe + Mg) || 1);

  if (Si < 5.6) {
    if (fe_ratio < 0.5) return '铁镁绿泥石 (Corundophilite)';
    return '鲕绿泥石 (Chamosite)';
  } else if (Si >= 5.6 && Si <= 6.2) {
    if (fe_ratio < 0.5) return '叶绿泥石 (Sheridanite)';
    return '铁绿泥石 (Ripidolite)';
  } else if (Si > 6.2 && Si <= 7.0) {
    if (fe_ratio < 0.5) return '斜绿泥石 (Clinochlore)';
    return '密绿泥石 (Diabantite)';
  } else if (Si > 7.0 && Si <= 8.0) {
    if (fe_ratio < 0.5) return '彭钠绿泥石 (Penninite)';
    return '褐绿泥石 (Brunsvigite)';
  }
  
  return '未分类绿泥石 (Unclassified Chlorite)';
}

/**
 * Calculates biotite formation temperature based on empirical formulas.
 * Uses Ti-in-biotite thermometer (Henry et al., 2005) and others.
 * Assumes 22 Oxygen basis.
 */
export function calculateBiotiteTemperature(formula: StructuralFormula) {
  const { Ti, Mg, Fe, Al_VI } = formula;
  const XMg = Mg / ((Fe + Mg) || 1);

  // Henry et al. (2005) Ti-in-biotite thermometer
  // T(°C) = (ln(Ti) - a - c*(XMg)^3) / b
  // Where a = -2.3594, b = 4.6482e-9, c = -1.7283 (simplified regression)
  // Simplified version: T = ((ln(Ti/a_factor))^(1/b_exp)) with empirical fit
  // Using the widely-cited approximation:
  const a = -2.3594;
  const b = 4.6482e-9;
  const c = -1.7283;
  // Direct regression form: T(°C) from Henry et al. 2005
  // T = {[ln(Ti) - a - c*(XMg)^3] / b}^(1/3)
  const lnTi = Ti > 0 ? Math.log(Ti) : -5;
  const henryT = Math.pow((lnTi - a - c * Math.pow(XMg, 3)) / b, 1/3);
  const henryTemp = Math.max(0, Math.min(henryT, 900)); // clamp

  // Luhr et al. (1984) simplified: T = 839.4 * Ti + 405 (very rough)
  // For educational/demo purposes
  const luhrTemp = 839.4 * Ti + 405;

  return {
    Henry: Number(henryTemp.toFixed(1)),
    Luhr: Number(Math.max(0, Math.min(luhrTemp, 1000)).toFixed(1)),
  };
}

/**
 * Classify biotite based on Fe/(Fe+Mg) ratio and Al content (22 O basis).
 */
export function classifyBiotite(formula: StructuralFormula): string {
  const { Fe, Mg, Al_VI, Ti } = formula;
  const feRatio = Fe / ((Fe + Mg) || 1);

  if (feRatio < 0.33) {
    return '金云母 (Phlogopite)';
  } else if (feRatio < 0.67) {
    if (Ti > 0.3) {
      return '钛铁云母 (Ti-rich Biotite)';
    }
    return '黑云母 (Biotite s.s.)';
  } else {
    return '铁叶云母 (Annite)';
  }
}

/**
 * Classify muscovite subtypes (22 O basis).
 */
export function classifyMuscovite(formula: StructuralFormula): string {
  const { Si, Fe, Mg, Na, K } = formula;
  const naRatio = Na / ((Na + K) || 1);
  const celadonite = Si > 6.4; // high Si = celadonitic

  if (naRatio > 0.5) {
    return '钠云母 (Paragonite)';
  }
  if (celadonite) {
    return '含铁白云母 (Celadonite-rich Muscovite)';
  }
  if (Fe + Mg > 0.8) {
    return '多硅白云母 (Phengite)';
  }
  return '白云母 (Muscovite s.s.)';
}

/**
 * Removes outliers using IQR method for a specific property.
 */
export function removeOutliers(data: any[], property: string): any[] {
  if (data.length < 4) return data;
  
  const values = data.map(d => parseFloat(d[property])).filter(v => !isNaN(v)).sort((a, b) => a - b);
  if (values.length === 0) return data;

  const q1 = values[Math.floor(values.length * 0.25)];
  const q3 = values[Math.floor(values.length * 0.75)];
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  return data.filter(d => {
    const val = parseFloat(d[property]);
    return !isNaN(val) && val >= lowerBound && val <= upperBound;
  });
}
