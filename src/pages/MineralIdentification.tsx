import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, FileSpreadsheet, Calculator, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useData } from '../context/DataContext';
import { parseFile } from '../utils/parseFile';

const MineralIdentification: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const { setMineralResults } = useData();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsedData = await parseFile(file);
      if (parsedData.length === 0) {
        setData([]);
        setResults([]);
        setError('未识别到可用的氧化物分析数据，请上传包含 SiO2、Al2O3、FeO、MgO 等列的 Excel/CSV 文档');
        return;
      }
      setData(parsedData);
      setResults([]);
      setError('');
    } catch {
      setError('文件解析失败，请检查格式');
    }
  };

  const handleIdentify = async () => {
    if (data.length === 0) { setError('请先上传数据'); return; }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/mineral/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
      });
      const result = await response.json();
      if (response.ok) {
        setResults(result.results);
        setMineralResults(result.results);
      } else {
        setError(result.error || '识别失败');
      }
    } catch {
      setError('网络错误，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  const typeColorMap: Record<string, string> = {
    Muscovite: 'bg-violet-100 text-violet-700',
    Chlorite: 'bg-emerald-100 text-emerald-700',
    Biotite: 'bg-amber-100 text-amber-700',
    Unknown: 'bg-slate-100 text-slate-500',
  };

  const typeLabels: Record<string, string> = {
    Muscovite: '白云母', Chlorite: '绿泥石', Biotite: '黑云母', Unknown: '未知',
  };

  const typeCounts = results.reduce((acc, r) => {
    const t = r.Type || 'Unknown';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
    >
      {/* Header row: title + upload + button */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">矿物识别与分类</h1>
          <p className="mt-1 text-sm text-slate-500">上传电子探针CSV数据，自动判别矿物类型并计算结构式</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors">
            <FileSpreadsheet className="w-4 h-4" />
            {data.length > 0 ? `已加载 ${data.length} 条` : '上传CSV'}
            <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
          </label>
          <button
            onClick={handleIdentify}
            disabled={loading || data.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Search className="w-4 h-4" />
            {loading ? '识别中...' : '开始识别'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary + Table in one compact view */}
      {results.length > 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Summary bar */}
          <div className="flex items-center gap-6 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <div className="text-sm text-slate-500">
              共 <span className="font-bold text-slate-800 text-lg">{results.length}</span> 条
            </div>
            {Object.entries(typeCounts).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColorMap[type] || typeColorMap.Unknown}`}>
                  {typeLabels[type] || type}
                </span>
                <span className="text-sm font-semibold text-slate-700">{count as number}</span>
              </div>
            ))}
          </div>

          {/* Scrollable table */}
          <div className="overflow-auto max-h-[calc(100vh-280px)]">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase w-10">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">样本</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">矿物类型</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">亚类分类</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Si</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Al(IV)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Fe</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Mg</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">温度</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((row, i) => (
                  <React.Fragment key={i}>
                    <tr
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                    >
                      <td className="px-4 py-2.5 text-xs text-slate-400">{i + 1}</td>
                      <td className="px-4 py-2.5 text-sm font-medium text-slate-900">
                        {row['Sample'] || row['Point'] || `点位${i + 1}`}
                      </td>
                      <td className="px-4 py-2.5 text-sm">
                        {row.error ? (
                          <span className="text-red-500 text-xs">无效</span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColorMap[row.Type] || typeColorMap.Unknown}`}>
                            {typeLabels[row.Type] || row.Type}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-slate-600 max-w-[200px] truncate">{row.Classification || '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-700 tabular-nums">{row.Formula?.Si ?? '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-700 tabular-nums">{row.Formula?.Al_IV ?? '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-700 tabular-nums">{row.Formula?.Fe ?? '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-700 tabular-nums">{row.Formula?.Mg ?? '-'}</td>
                      <td className="px-4 py-2.5 text-sm font-medium text-indigo-600 tabular-nums">
                        {row.Temps
                          ? row.Temps.type === 'chlorite'
                            ? `${row.Temps.values.Cathelineau}°C`
                            : row.Temps.type === 'biotite'
                            ? `${row.Temps.values.Henry}°C`
                            : '-'
                          : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">
                        {expandedRow === i ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </td>
                    </tr>
                    {expandedRow === i && row.Formula && (
                      <tr>
                        <td colSpan={10} className="px-4 py-3 bg-slate-50">
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs">
                            {['Si', 'Ti', 'Al', 'Al_IV', 'Al_VI', 'Cr', 'Fe', 'Mn', 'Mg', 'Ca', 'Na', 'K'].map(k => (
                              <div key={k} className="bg-white rounded-lg px-3 py-2 border border-slate-100">
                                <span className="text-slate-400">{k}</span>
                                <span className="block font-medium text-slate-800 tabular-nums">{row.Formula[k] ?? '-'}</span>
                              </div>
                            ))}
                          </div>
                          {row.Temps && (
                            <div className="mt-2 flex gap-3 text-xs">
                              {row.Temps.type === 'chlorite' && Object.entries(row.Temps.values as Record<string, number>).map(([k, v]) => (
                                <span key={k} className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded">
                                  {k}: {v}°C
                                </span>
                              ))}
                              {row.Temps.type === 'biotite' && Object.entries(row.Temps.values as Record<string, number>).map(([k, v]) => (
                                <span key={k} className="bg-amber-50 text-amber-700 px-2 py-1 rounded">
                                  {k}: {v}°C
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center py-24 text-slate-400">
          <Calculator className="w-14 h-14 mb-3 opacity-20" />
          <p className="text-sm">上传电子探针CSV数据，点击"开始识别"自动判别矿物</p>
        </div>
      )}
    </motion.div>
  );
};

export default MineralIdentification;
