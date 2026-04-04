import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Upload, Calculator, AlertCircle, FileSpreadsheet, Settings2, BarChart3, FileText, Loader2, Bot, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { parseFile } from '../utils/parseFile';

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

const BiotiteThermometer: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [removeOutliersFlag, setRemoveOutliersFlag] = useState(true);

  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState('');
  const [showReport, setShowReport] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const { setBiotiteResults, setBiotiteSummary } = useData();

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
        setError('未识别到可用的氧化物分析数据，请上传包含 SiO2、TiO2、Al2O3、FeO、MgO 等列的 Excel/CSV 文档');
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
      const response = await fetch('/api/thermometer/biotite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, removeOutliersFlag })
      });

      const result = await response.json();
      if (response.ok) {
        setResults(result.results);
        setSummary(result.summary);
        setBiotiteResults(result.results);
        setBiotiteSummary(result.summary);
      } else {
        setError(result.error || '计算失败');
      }
    } catch (err) {
      setError('网络错误，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  const tempStats = results.length > 0 ? (() => {
    const stats: Record<string, { avg: number; min: number; max: number }> = {};
    for (const key of ['Henry', 'Luhr']) {
      const vals = results.map(r => r.Temps?.[key]).filter((v: any) => typeof v === 'number' && !isNaN(v));
      if (vals.length > 0) {
        stats[key] = { avg: Math.round(avg(vals)), min: Math.round(Math.min(...vals)), max: Math.round(Math.max(...vals)) };
      }
    }
    return stats;
  })() : null;

  // Classification counts
  const classStats = results.length > 0 ? (() => {
    const counts: Record<string, number> = {};
    for (const r of results) {
      const cls = r.Classification || '未分类';
      counts[cls] = (counts[cls] || 0) + 1;
    }
    return counts;
  })() : null;

  const generateReport = async () => {
    if (!results.length || !tempStats) return;
    setReportLoading(true);
    setShowReport(true);
    setReport('');

    const statsText = Object.entries(tempStats).map(([k, v]) =>
      `${k === 'Henry' ? 'Henry et al. (2005)' : 'Luhr et al. (1984)'}: 平均 ${v.avg}°C, 范围 ${v.min}-${v.max}°C`
    ).join('\n');

    const classText = classStats ? Object.entries(classStats).map(([k, v]) => `${k}: ${v} 个`).join(', ') : '';

    const prompt = `你是一位专业的岩石学和矿物学专家。请根据以下黑云母温度计计算结果，撰写一段专业的地质解读分析报告（500-800字）。

数据概况：
- 有效样品数：${summary?.valid || results.length} 个
- 清洗后保留：${summary?.cleaned || results.length} 个
- 去除异常值：${summary?.outliersRemoved || 0} 个

温度计结果：
${statsText}

黑云母分类统计：${classText}

请从以下几个方面进行分析：
1. Henry (2005) Ti-in-Biotite 温度计的原理和适用条件
2. 两种温度计结果的对比和差异分析
3. 黑云母分类结果的地质意义
4. 基于温度和成分推断可能的岩浆结晶条件和地质环境
5. 温度结果对成矿作用的指示意义
6. 数据质量评估和注意事项

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
          max_tokens: 2048, temperature: 0.7,
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
            if (delta) { content += delta; setReport(content); }
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
    if (showReport && reportRef.current) reportRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [showReport]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">黑云母温度计</h1>
        <p className="mt-2 text-slate-600">
          上传电子探针数据，基于 Ti-in-Biotite (Henry et al., 2005) 等经验公式计算黑云母形成温度，并自动分类。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          {/* Upload */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-amber-500" /> 数据上传
            </h3>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer relative">
              <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="text-sm text-slate-600 font-medium">点击或拖拽上传数据文件（CSV / Excel）</p>
              <p className="text-xs text-slate-400 mt-1">需包含 SiO2, TiO2, Al2O3, FeO, MgO 等元素列</p>
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
              <Settings2 className="w-5 h-5 text-amber-500" /> 参数设置
            </h3>
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <p className="font-medium mb-1">温度计公式说明</p>
                <ul className="space-y-1 text-xs">
                  <li className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0"></span>
                    <span><b>Henry et al. (2005)</b>: Ti-in-Biotite 温度计，基于 Ti 含量与 X<sub>Mg</sub>，适用于石墨饱和条件</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-violet-500 shrink-0"></span>
                    <span><b>Luhr et al. (1984)</b>: 简化线性回归公式</span>
                  </li>
                </ul>
              </div>

              <div className="flex items-center">
                <input id="removeOutliersBt" type="checkbox" checked={removeOutliersFlag}
                  onChange={(e) => setRemoveOutliersFlag(e.target.checked)}
                  className="w-4 h-4 text-amber-600 bg-slate-100 border-slate-300 rounded focus:ring-amber-500" />
                <label htmlFor="removeOutliersBt" className="ml-2 text-sm font-medium text-slate-700">
                  自动清洗数据 (总量过滤 + IQR异常值去除)
                </label>
              </div>
            </div>

            <button onClick={handleCalculate} disabled={loading || data.length === 0}
              className="mt-6 w-full bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white font-medium py-2.5 rounded-xl transition-colors flex justify-center items-center gap-2">
              <Calculator className="w-4 h-4" />
              {loading ? '计算中...' : '开始计算'}
            </button>

            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
              </div>
            )}
          </div>

          {/* Stats */}
          {tempStats && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-amber-500" /> 温度统计
              </h3>
              <div className="space-y-3">
                {Object.entries(tempStats).map(([key, stat]) => {
                  const isHenry = key === 'Henry';
                  return (
                    <div key={key} className={`p-3 rounded-lg border ${isHenry ? 'bg-orange-50 border-orange-200' : 'bg-violet-50 border-violet-200'}`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-sm font-medium ${isHenry ? 'text-orange-700' : 'text-violet-700'}`}>
                          {isHenry ? 'Henry (2005)' : 'Luhr (1984)'}
                        </span>
                        <span className={`text-lg font-bold ${isHenry ? 'text-orange-700' : 'text-violet-700'}`}>
                          {stat.avg}°C
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>最低 {stat.min}°C</span><span>最高 {stat.max}°C</span>
                      </div>
                      <div className="mt-2 h-2 bg-white rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${isHenry ? 'bg-orange-400' : 'bg-violet-400'}`}
                          style={{ width: `${Math.min(100, (stat.avg / 900) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Classification stats */}
              {classStats && (
                <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-sm font-medium text-slate-700 mb-2">黑云母分类统计</p>
                  <div className="space-y-1">
                    {Object.entries(classStats).map(([cls, count]) => (
                      <div key={cls} className="flex justify-between text-sm">
                        <span className="text-slate-600">{cls}</span>
                        <span className="font-medium text-slate-800">{count} 个</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={generateReport} disabled={reportLoading}
                className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-medium py-2.5 rounded-xl transition-colors flex justify-center items-center gap-2 text-sm">
                {reportLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> 生成报告中...</> : <><FileText className="w-4 h-4" /> AI 生成地质解读报告</>}
              </button>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 min-h-[500px] flex flex-col">
            <h3 className="text-lg font-semibold mb-4">计算结果与结构式 (基于22氧)</h3>

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
                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 flex flex-col items-center justify-center">
                  <span className="text-orange-600 text-sm">保留结果</span>
                  <span className="text-2xl font-bold text-orange-700">{summary.cleaned}</span>
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
                      <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Ti</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">X<sub>Mg</sub></th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">分类</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-orange-600 uppercase tracking-wider bg-orange-50">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> T_Henry</span>
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-violet-600 uppercase tracking-wider bg-violet-50">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500"></span> T_Luhr</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {results.slice(0, 50).map((row, i) => {
                      const fe = Number(row.Fe) || 0;
                      const mg = Number(row.Mg) || 0;
                      const xMg = fe + mg > 0 ? (mg / (fe + mg)).toFixed(3) : '0.000';
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 whitespace-nowrap text-sm text-slate-900 font-medium bg-slate-50">{row['Sample'] || row['Point'] || `点位${i+1}`}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-sm text-slate-700">{row.Si}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-sm text-slate-700">{row.Ti}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-sm text-slate-700">{xMg}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-sm text-slate-700">
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                              {row.Classification}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-sm font-semibold text-orange-700 bg-orange-50/30">{row.Temps?.Henry}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-sm font-semibold text-violet-700 bg-violet-50/30">{row.Temps?.Luhr}</td>
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
                <p className="text-sm mt-2 opacity-60">支持包含 SiO2, TiO2, Al2O3, FeO, MnO, MgO 等的数据表</p>
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
                  <div className="bg-slate-50 rounded-xl p-5 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{report}</div>
                  <p className="text-xs text-slate-400 mt-3">* AI 生成内容仅供参考，请结合实际地质背景和文献进行综合分析。</p>
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

export default BiotiteThermometer;
