"""
地质计算核心模块
包含结构式计算、温度计、矿物识别与分类
"""
from __future__ import annotations
import math
import numpy as np

# 分子量
MOLECULAR_WEIGHTS = {
    'SiO2': 60.08, 'TiO2': 79.866, 'Al2O3': 101.96, 'Cr2O3': 151.99,
    'FeO': 71.844, 'MnO': 70.937, 'MgO': 40.304, 'CaO': 56.077,
    'Na2O': 61.979, 'K2O': 94.2, 'BaO': 153.326,
}

# 每个氧化物中的阳离子数
CATIONS_PER_OXIDE = {
    'SiO2': 1, 'TiO2': 1, 'Al2O3': 2, 'Cr2O3': 2,
    'FeO': 1, 'MnO': 1, 'MgO': 1, 'CaO': 1, 'Na2O': 2, 'K2O': 2, 'BaO': 1,
}

# 每个氧化物中的氧原子数
OXYGEN_PER_OXIDE = {
    'SiO2': 2, 'TiO2': 2, 'Al2O3': 3, 'Cr2O3': 3,
    'FeO': 1, 'MnO': 1, 'MgO': 1, 'CaO': 1, 'Na2O': 1, 'K2O': 1, 'BaO': 1,
}


def calculate_structural_formula(data: dict, target_oxygen: int) -> dict | None:
    """
    根据电子探针氧化物数据计算结构式
    data: 氧化物 wt% 数据字典
    target_oxygen: 归一化氧原子数 (绿泥石28, 云母22)
    """
    mol_props = {}
    total_oxide = 0.0

    for oxide, mw in MOLECULAR_WEIGHTS.items():
        wt = _to_float(data.get(oxide, 0))
        total_oxide += wt
        if wt > 0:
            mol_props[oxide] = wt / mw

    # 总量过滤
    if total_oxide < 80 or total_oxide > 115:
        return None

    total_oxygen_props = sum(
        mol_props.get(ox, 0) * OXYGEN_PER_OXIDE[ox]
        for ox in MOLECULAR_WEIGHTS
    )
    if total_oxygen_props == 0:
        return None

    normalize = target_oxygen / total_oxygen_props

    def get_cation(oxide):
        if oxide not in mol_props:
            return 0.0
        return round(mol_props[oxide] * CATIONS_PER_OXIDE[oxide] * normalize, 4)

    Si = get_cation('SiO2')
    Ti = get_cation('TiO2')
    Al = get_cation('Al2O3')
    Cr = get_cation('Cr2O3')
    Fe = get_cation('FeO')
    Mn = get_cation('MnO')
    Mg = get_cation('MgO')
    Ca = get_cation('CaO')
    Na = get_cation('Na2O')
    K = get_cation('K2O')

    # 四面体位最大数
    max_tetra = 8 if target_oxygen in (28, 22) else 4
    Al_IV = max(0, min(max_tetra - Si, Al))
    Al_VI = Al - Al_IV

    return {
        'Si': round(Si, 4), 'Ti': round(Ti, 4), 'Al': round(Al, 4),
        'Al_IV': round(Al_IV, 4), 'Al_VI': round(Al_VI, 4),
        'Cr': round(Cr, 4), 'Fe': round(Fe, 4), 'Mn': round(Mn, 4),
        'Mg': round(Mg, 4), 'Ca': round(Ca, 4), 'Na': round(Na, 4), 'K': round(K, 4),
        'Total': round(total_oxide, 2),
    }


def calculate_chlorite_temperature(formula: dict) -> dict:
    """绿泥石经验温度计 (4种公式)"""
    Al_IV = formula['Al_IV']
    Fe = formula['Fe']
    Mg = formula['Mg']
    fe_ratio = Fe / (Fe + Mg) if (Fe + Mg) > 0 else 0

    Al_c_jowett = Al_IV + 0.1 * fe_ratio
    Al_c_km = Al_IV + 0.7 * fe_ratio

    return {
        'Cathelineau': round(-61.92 + 321.98 * Al_IV, 1),
        'Jowett': round(319 * Al_c_jowett - 69, 1),
        'Kranidiotis': round(106 * Al_c_km + 18, 1),
        'Zang': round(106.2 * Al_c_km + 17.5, 1),
    }


def calculate_biotite_temperature(formula: dict) -> dict:
    """黑云母温度计 (Ti-in-Biotite)"""
    Ti = formula['Ti']
    Fe = formula['Fe']
    Mg = formula['Mg']
    XMg = Mg / (Fe + Mg) if (Fe + Mg) > 0 else 0

    # Henry et al. (2005)
    a, b, c = -2.3594, 4.6482e-9, -1.7283
    ln_ti = math.log(Ti) if Ti > 0 else -5
    try:
        base = (ln_ti - a - c * XMg ** 3) / b
        henry_t = math.copysign(abs(base) ** (1 / 3), base)
        henry_t = max(0, min(henry_t, 900))
    except (ValueError, ZeroDivisionError):
        henry_t = 0

    # Luhr et al. (1984) 简化
    luhr_t = max(0, min(839.4 * Ti + 405, 1000))

    return {
        'Henry': round(henry_t, 1),
        'Luhr': round(luhr_t, 1),
    }


def identify_mineral(formula_22o: dict) -> str:
    """基于22氧结构式判别矿物类型"""
    Fe = formula_22o['Fe']
    Mg = formula_22o['Mg']
    Al_VI = formula_22o['Al_VI']
    K = formula_22o['K']
    Na = formula_22o['Na']
    Ca = formula_22o['Ca']

    FeMg = Fe + Mg
    alkalis = K + Na + Ca

    if alkalis < 0.5 and FeMg > 4.0:
        return 'Chlorite'

    if alkalis > 1.0:
        if Al_VI > 2.0 and FeMg < 2.5:
            return 'Muscovite'
        if FeMg > 3.0:
            return 'Biotite'

    return 'Unknown'


def classify_chlorite(formula_28o: dict) -> str:
    """Hey (1954) 绿泥石分类"""
    Si = formula_28o['Si']
    Fe = formula_28o['Fe']
    Mg = formula_28o['Mg']
    fe_ratio = Fe / (Fe + Mg) if (Fe + Mg) > 0 else 0

    if Si < 5.6:
        return '铁镁绿泥石 (Corundophilite)' if fe_ratio >= 0.5 else '鲕绿泥石 (Chamosite)'
    elif Si <= 6.2:
        return '铁绿泥石 (Ripidolite)' if fe_ratio >= 0.5 else '叶绿泥石 (Sheridanite)'
    elif Si <= 7.0:
        return '密绿泥石 (Diabantite)' if fe_ratio >= 0.5 else '斜绿泥石 (Clinochlore)'
    elif Si <= 8.0:
        return '褐绿泥石 (Brunsvigite)' if fe_ratio >= 0.5 else '彭钠绿泥石 (Penninite)'
    return '未分类绿泥石'


def classify_biotite(formula_22o: dict) -> str:
    """黑云母分类"""
    Fe = formula_22o['Fe']
    Mg = formula_22o['Mg']
    Ti = formula_22o['Ti']
    fe_ratio = Fe / (Fe + Mg) if (Fe + Mg) > 0 else 0

    if fe_ratio < 0.33:
        return '金云母 (Phlogopite)'
    elif fe_ratio < 0.67:
        return '钛铁云母 (Ti-rich Biotite)' if Ti > 0.3 else '黑云母 (Biotite s.s.)'
    else:
        return '铁叶云母 (Annite)'


def classify_muscovite(formula_22o: dict) -> str:
    """白云母分类"""
    Si = formula_22o['Si']
    Fe = formula_22o['Fe']
    Mg = formula_22o['Mg']
    Na = formula_22o['Na']
    K = formula_22o['K']
    na_ratio = Na / (Na + K) if (Na + K) > 0 else 0

    if na_ratio > 0.5:
        return '钠云母 (Paragonite)'
    if Si > 6.4:
        return '含铁白云母 (Celadonite-rich Muscovite)'
    if Fe + Mg > 0.8:
        return '多硅白云母 (Phengite)'
    return '白云母 (Muscovite s.s.)'


def remove_outliers(data: list, key: str) -> list:
    """IQR 异常值去除"""
    if len(data) < 4:
        return data

    values = sorted([float(d[key]) for d in data if _is_number(d.get(key))])
    if not values:
        return data

    q1 = np.percentile(values, 25)
    q3 = np.percentile(values, 75)
    iqr = q3 - q1
    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr

    return [d for d in data if _is_number(d.get(key)) and lower <= float(d[key]) <= upper]


def _to_float(val) -> float:
    try:
        return float(val) if val else 0.0
    except (ValueError, TypeError):
        return 0.0


def _is_number(val) -> bool:
    try:
        float(val)
        return True
    except (ValueError, TypeError):
        return False
