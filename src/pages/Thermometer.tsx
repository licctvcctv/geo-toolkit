import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Upload, Calculator, AlertCircle, FileSpreadsheet, Settings2, BarChart3, FileText, Loader2, Bot, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { parseFile } from '../utils/parseFile';

/** 温度公式元数据：分高温组(Cathelineau/Jowett)和低温组(Kranidiotis/Zang) */
const FORMULA_META: Record<string, { label: string; group: 'high' | 'low'; ref: string }> = {
  Cathelineau: { label: 'T_Cath', group: 'high', ref: 'Cathelineau (1988)' },
  Jowett:      { label: 'T_Jow',  group: 'high', ref: 'Jowett (1991)' },
  Kranidiotis: { label: 'T_Kran', group: 'low',  ref: 'Kranidiotis & MacLean (1987)' },
  Zang:        { label: 'T_Zang', group: 'low',  ref: 'Zang & Fyfe (1995)' },
};

const HIGH_TEMP_STYLE = { th: 'text-rose-600 bg-rose-50', td: 'text-rose-700 bg-rose-50/30' };
const LOW_TEMP_STYLE  = { th: 'text-blue-600 bg-blue-50', td: 'text-blue-700 bg-blue-50/30' };

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

const Thermometer: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [removeOutliersFlag, setRemoveOutliersFlag] = useState(true);

  // AI report
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState('');
  const [showReport, setShowReport] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const { setThermometerResults, setThermometerSummary } = useData();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsedData = await parseFile(file);
      if (parsedData.length === 0) {
        setData([]);
        setResults([]);
        setSummary(null);
        setReport('');
        setError('未识别到可用的氧化物分析数据，请上传包含 SiO2、Al2O3、FeO、MgO 等列的 Excel/CSV 文档');
        return;
      }
      setData(parsedData);
      setResults([]);
      setSummary(null);
      setError('');
      setReport('');
    } catch {
      setError('文件解析失败，请检查格式');
    }
  };

  const handleCalculate = async () => {
    if (data.length === 0) {
      setError('请先上传数据');
      return;
    }
    setLoading(true);
    setError('');
    setReport('');

    try {
      // 始终请求 All，前端控制显示
      const response = await fetch('/api/thermometer/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, method: 'All', removeOutliersFlag })
      });

      const result = await response.json();
      if (response.ok) {
        setResults(result.results);
        setSummary(result.summary);
        setThermometerResults(result.results);
        setThermometerSummary(result.summary);
      } else {
        setError(result.error || '计算失败');
      }
    } catch (err) {
      setError('网络错误，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  // Compute stats for the legend
  const tempStats = results.length > 0 ? (() => {
    const stats: Record<string, { avg: number; min: number; max: number }> = {};
    for (const key of Object.keys(FORMULA_META)) {
      const vals = results.map(r => r.Temps?.[key]).filter((v: any) => typeof v === 'number' && !isNaN(v));
      if (vals.length > 0) {
        stats[key] = {
          avg: Math.round(avg(vals)),
          min: Math.round(Math.min(...vals)),
          max: Math.round(Math.max(...vals)),
        };
      }
    }
    return stats;
  })() : null;

  const groupStats = tempStats ? (() => {
    const groups = {
      high: Object.entries(tempStats).filter(([key]) => FORMULA_META[key].group === 'high').map(([, stat]) => stat.avg),
      low: Object.entries(tempStats).filter(([key]) => FORMULA_META[key].group === 'low').map(([, stat]) => stat.avg),
    };
    if (!groups.high.length || !groups.low.length) return null;

    const highAvg = Math.round(avg(groups.high));
    const lowAvg = Math.round(avg(groups.low));
    return {
      highAvg,
      lowAvg,
      gap: Math.abs(highAvg - lowAvg),
    };
  })() : null;

  // AI report generation
  const generateReport = async () => {
    if (!results.length || !tempStats) return;
    setReportLoading(true);
    setShowReport(true);
    setReport('');

    const statsText = Object.entries(tempStats).map(([k, v]) =>
      `${FORMULA_META[k].ref}: 平均 ${v.avg}°C, 范围 ${v.min}-${v.max}°C`
    ).join('\n');

    const prompt = `你是一位专业的岩石学和矿物学专家。请根据以下绿泥石温度计计算结果，撰写一段专业的地质解读分析报告（500-800字）。

数据概况：
- 有效样品数：${summary?.valid || results.length} 个
- 清洗后保留：${summary?.cleaned || results.length} 个
- 去除异常值：${summary?.outliersRemoved || 0} 个

四种经验温度计结果：
${statsText}

请从以下几个方面进行分析：
1. 四种温度计公式的结果差异原因（Cathelineau/Jowett 为高铝校正公式，Kranidiotis/Zang 为铁镁校正公式，解释为什么系统性差异大）
2. 哪些温度计公式更适合本样品数据，推荐使用建议
3. 基于温度范围推断可能的地质环境和热液蚀变期次
4. 温度结果对矿物形成条件和成矿过程的指示意义
5. 数据质量评估和注意事项

请用学术论文的语言风格撰写，但要易于理解。`;

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: '你是一位资深地质学家，擅长矿物学和岩石地球化学分析。请直接输出分析报告内容，不要输出思考过程。' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 2048,
          temperature: 0.7,
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let content = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const d = trimmed.slice(6);
          if (d === '[DONE]') break;
          try {
            const delta = JSON.parse(d).choices?.[0]?.delta?.content;
            if (delta) {
              content += delta;
              setReport(content);
            }
          } catch {}
        }
      }
      if (!content) setReport('报告生成失败，请稍后重试。');
    } catch {
      setReport('网络连接出现问题，请检查网络后重试。');
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    if (showReport && reportRef.current) {
      reportRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [showReport]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">绿泥石经验温度计</h1>
        <p className="mt-2 text-slate-600">
          上传电子探针数据，自动计算结构式并基于多种经验公式计算矿物形成温度。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left panel */}
        <div className="lg:col-span-1 space-y-6">
          {/* Upload */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-indigo-500" /> 数据上传
            </h3>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer relative">
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="text-sm text-slate-600 font-medium">点击或拖拽上传数据文件（CSV / Excel）</p>
              <p className="text-xs text-slate-400 mt-1">需包含 SiO2, Al2O3, FeO, MgO 等元素列</p>
            </div>
            {data.length > 0 && (
              <div className="mt-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                已加载 {data.length} 条原始数据
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-indigo-500" /> 参数设置
            </h3>
            <div className="space-y-4">
              {/* Formula legend */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
                <p className="font-medium text-slate-700 text-sm mb-2">温度计公式说明</p>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0"></span>
                  <span className="text-rose-700 font-medium">高温组</span>
                  <span className="text-slate-500">Cathelineau (1988), Jowett (1991)</span>
                </div>
                <p className="text-slate-400 ml-5">基于 Al(IV) 含量的线性回归，校正系数较大</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0"></span>
                  <span className="text-blue-700 font-medium">低温组</span>
                  <span className="text-slate-500">Kranidiotis (1987), Zang (1995)</span>
                </div>
                <p className="text-slate-400 ml-5">考虑 Fe/(Fe+Mg) 校正，校正系数较小</p>
              </div>

              <div className="flex items-center">
                <input
                  id="removeOutliers"
                  type="checkbox"
                  checked={removeOutliersFlag}
                  onChange={(e) => setRemoveOutliersFlag(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 bg-slate-100 border-slate-300 rounded focus:ring-indigo-500"
                />
                <label htmlFor="removeOutliers" className="ml-2 text-sm font-medium text-slate-700">
                  自动清洗数据 (总量过滤 + IQR异常值去除)
                </label>
              </div>
            </div>

            <button
              onClick={handleCalculate}
              disabled={loading || data.length === 0}
              className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-medium py-2.5 rounded-xl transition-colors flex justify-center items-center gap-2"
            >
              <Calculator className="w-4 h-4" />
              {loading ? '计算中...' : '开始计算'}
            </button>

            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Temperature stats panel */}
          {tempStats && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-500" /> 温度统计
              </h3>
              <div className="space-y-3">
                {Object.entries(tempStats).map(([key, stat]) => {
                  const meta = FORMULA_META[key];
                  const isHigh = meta.group === 'high';
                  return (
                    <div key={key} className={`p-3 rounded-lg border ${isHigh ? 'bg-rose-50 border-rose-200' : 'bg-blue-50 border-blue-200'}`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-sm font-medium ${isHigh ? 'text-rose-700' : 'text-blue-700'}`}>
                          {meta.label}
                        </span>
                        <span className={`text-lg font-bold ${isHigh ? 'text-rose-700' : 'text-blue-700'}`}>
                          {stat.avg}°C
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>最低 {stat.min}°C</span>
                        <span>最高 {stat.max}°C</span>
                      </div>
                      {/* Visual bar */}
                      <div className="mt-2 h-2 bg-white rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isHigh ? 'bg-rose-400' : 'bg-blue-400'}`}
                          style={{ width: `${Math.min(100, (stat.avg / 700) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {groupStats && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                      <p className="text-xs font-medium text-rose-700">高温组均值</p>
                      <p className="mt-1 text-2xl font-bold text-rose-700">{groupStats.highAvg}°C</p>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="text-xs font-medium text-blue-700">低温组均值</p>
                      <p className="mt-1 text-2xl font-bold text-blue-700">{groupStats.lowAvg}°C</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs font-medium text-slate-600">组间差值</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900">{groupStats.gap}°C</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-slate-500">
                    高温组与低温组差异较大时，通常反映不同经验公式的校正思路不同。答辩展示时建议把两组结果分开展示，并结合矿物组合、围岩蚀变与成矿阶段综合解释。
                  </p>
                </div>
              )}

              {/* AI Report button */}
              <button
                onClick={generateReport}
                disabled={reportLoading}
                className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-medium py-2.5 rounded-xl transition-colors flex justify-center items-center gap-2 text-sm"
              >
                {reportLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 生成报告中...</>
                ) : (
                  <><FileText className="w-4 h-4" /> AI 生成地质解读报告</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Right panel - Results */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 min-h-[500px] flex flex-col">
            <h3 className="text-lg font-semibold mb-4 flex items-center justify-between">
              <span>计算结果与结构式 (基于28氧)</span>
            </h3>

            {summary && (
              <div className="mb-6 grid grid-cols-4 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                  <span className="text-slate-500 text-sm">原始数据</span>
                  <span className="text-2xl font-bold text-slate-800">{summary.original}</span>
                </div>
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex flex-col items-center justify-center">
                  <span className="text-emerald-600 text-sm">有效数据</span>
                  <span className="text-2xl font-bold text-emerald-700">{summary.valid}</span>
                </div>
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex flex-col items-center justify-center">
                  <span className="text-amber-600 text-sm">去除异常</span>
                  <span className="text-2xl font-bold text-amber-700">{summary.outliersRemoved}</span>
                </div>
                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex flex-col items-center justify-center">
                  <span className="text-indigo-600 text-sm">保留结果</span>
                  <span className="text-2xl font-bold text-indigo-700">{summary.cleaned}</span>
                </div>
              </div>
            )}

            {results.length > 0 ? (
              <div className="overflow-x-auto flex-1 border border-slate-200 rounded-xl">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-100">样本</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Si</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Al(IV)</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fe/(Fe+Mg)</th>
                      {/* 高温组 - 暖色 */}
                      <th className={`px-3 py-3 text-left text-xs font-medium uppercase tracking-wider ${HIGH_TEMP_STYLE.th}`}>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span> T_Cath
                        </span>
                      </th>
                      <th className={`px-3 py-3 text-left text-xs font-medium uppercase tracking-wider ${HIGH_TEMP_STYLE.th}`}>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span> T_Jow
                        </span>
                      </th>
                      {/* 低温组 - 冷色 */}
                      <th className={`px-3 py-3 text-left text-xs font-medium uppercase tracking-wider ${LOW_TEMP_STYLE.th}`}>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span> T_Kran
                        </span>
                      </th>
                      <th className={`px-3 py-3 text-left text-xs font-medium uppercase tracking-wider ${LOW_TEMP_STYLE.th}`}>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span> T_Zang
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {results.slice(0, 50).map((row, i) => {
                      const fe = Number(row.Fe) || 0;
                      const mg = Number(row.Mg) || 0;
                      const feRatio = fe + mg > 0 ? (fe / (fe + mg)).toFixed(2) : '0.00';
                      const temps = row.Temps || {};
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 whitespace-nowrap text-sm text-slate-900 font-medium bg-slate-50">{row['Sample'] || row['Point'] || `点位${i+1}`}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-sm text-slate-700">{row.Si}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-sm text-slate-700">{row.Al_IV}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-sm text-slate-700">{feRatio}</td>
                          <td className={`px-3 py-2.5 whitespace-nowrap text-sm font-semibold ${HIGH_TEMP_STYLE.td}`}>{temps.Cathelineau}</td>
                          <td className={`px-3 py-2.5 whitespace-nowrap text-sm font-semibold ${HIGH_TEMP_STYLE.td}`}>{temps.Jowett}</td>
                          <td className={`px-3 py-2.5 whitespace-nowrap text-sm font-semibold ${LOW_TEMP_STYLE.td}`}>{temps.Kranidiotis}</td>
                          <td className={`px-3 py-2.5 whitespace-nowrap text-sm font-semibold ${LOW_TEMP_STYLE.td}`}>{temps.Zang}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <BarChart3 className="w-16 h-16 mb-4 opacity-20" />
                <p>暂无计算结果，请先上传探针数据并点击计算</p>
                <p className="text-sm mt-2 opacity-60">支持包含 SiO2, TiO2, Al2O3, FeO, MnO, MgO, CaO, Na2O, K2O 的数据表</p>
              </div>
            )}

            {results.length > 50 && (
              <p className="text-center text-sm text-slate-500 mt-4 py-2 border-t border-slate-100">
                表格显示前 50 条数据，共 {results.length} 条有效结果
              </p>
            )}
          </div>

          {/* AI Report */}
          {showReport && (
            <div ref={reportRef} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Bot className="w-5 h-5 text-emerald-500" /> AI 地质解读报告
                </h3>
                <button onClick={() => setShowReport(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {report ? (
                <div className="prose prose-sm prose-slate max-w-none">
                  <div className="bg-slate-50 rounded-xl p-5 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                    {report}
                  </div>
                  <p className="text-xs text-slate-400 mt-3">
                    * AI 生成内容仅供参考，请结合实际地质背景和文献进行综合分析。
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> 正在生成地质解读报告...
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default Thermometer;
