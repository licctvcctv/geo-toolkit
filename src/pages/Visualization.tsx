import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import Plot from 'react-plotly.js';
import { useData } from '../context/DataContext';
import { BarChart3, PieChart, ScatterChart, Upload, Calculator, AlertCircle } from 'lucide-react';
import { parseFile } from '../utils/parseFile';
import { detectAnalysisMode, type AnalysisDetectionResult, type AnalysisSource } from '../utils/analysisDetection';
import { shouldRenderVisualization } from './visualizationState';

type ChartType = 'scatter2d' | 'scatter3d' | 'histogram' | 'pie';
type DataSource = 'chlorite' | 'biotite' | 'mineral';

const Visualization: React.FC = () => {
  const { setThermometerResults, setThermometerSummary, setMineralResults, setBiotiteResults, setBiotiteSummary } = useData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [chartType, setChartType] = useState<ChartType>('scatter2d');
  const [localData, setLocalData] = useState<any[]>([]);
  const [visualizedResults, setVisualizedResults] = useState<any[]>([]);
  const [visualizedSource, setVisualizedSource] = useState<DataSource | null>(null);
  const [detection, setDetection] = useState<AnalysisDetectionResult | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>('chlorite');
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasCurrentVisualization = shouldRenderVisualization({
    uploadedRows: localData.length,
    calculatedRows: visualizedResults.length,
  });

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const processUploadedFile = async (file: File) => {
    try {
      const parsedData = await parseFile(file);
      if (parsedData.length === 0) {
        setLocalData([]);
        setVisualizedResults([]);
        setVisualizedSource(null);
        setDetection(null);
        setError('未识别到可用的氧化物分析数据，请上传包含 SiO2、Al2O3、FeO、MgO 等列的 Excel/CSV 文档');
        return;
      }
      const detected = detectAnalysisMode(parsedData);
      setLocalData(parsedData);
      setVisualizedResults([]);
      setVisualizedSource(null);
      setDetection(detected);
      setDataSource(detected.source);
      setError('');
      setChartType(detected.source === 'mineral' ? 'pie' : 'scatter2d');

      if (detected.validRows === 0) {
        setError(detected.detail);
        return;
      }

      await runAnalysis(detected.source, parsedData);
    } catch {
      setError('文件解析失败，请检查格式');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processUploadedFile(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    await processUploadedFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const runAnalysis = async (source: AnalysisSource, rows: any[]) => {
    if (rows.length === 0) {
      setError('请先上传数据');
      return;
    }
    setLoading(true);
    setError('');

    try {
      if (source === 'chlorite') {
        const res = await fetch('/api/thermometer/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: rows, method: 'All', removeOutliersFlag: true }),
        });
        const result = await res.json();
        if (res.ok) {
          setVisualizedResults(result.results);
          setVisualizedSource('chlorite');
          setThermometerResults(result.results);
          setThermometerSummary(result.summary);
          setChartType('scatter2d');
        } else { setError(result.error || '计算失败'); }
      } else if (source === 'biotite') {
        const res = await fetch('/api/thermometer/biotite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: rows, removeOutliersFlag: true }),
        });
        const result = await res.json();
        if (res.ok) {
          setVisualizedResults(result.results);
          setVisualizedSource('biotite');
          setBiotiteResults(result.results);
          setBiotiteSummary(result.summary);
          setChartType('scatter2d');
        } else { setError(result.error || '计算失败'); }
      } else {
        const res = await fetch('/api/mineral/identify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: rows }),
        });
        const result = await res.json();
        if (res.ok) {
          setVisualizedResults(result.results);
          setVisualizedSource('mineral');
          setMineralResults(result.results);
          setChartType('pie');
        } else { setError(result.error || '识别失败'); }
      }
    } catch {
      setError('网络错误，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  const handleCalculateAndVisualize = async () => {
    await runAnalysis(dataSource, localData);
  };

  // Chart data builders
  const scatter2dData = () => {
    if (visualizedSource === 'chlorite' && visualizedResults.length > 0) {
      return [{
        x: visualizedResults.map(r => r.Al_IV),
        y: visualizedResults.map(r => r.Temps?.Cathelineau ?? r.Temperature),
        mode: 'markers' as const, type: 'scatter' as const, name: '绿泥石温度',
        marker: { color: visualizedResults.map(r => r.Temps?.Cathelineau ?? r.Temperature), colorscale: 'YlOrRd', size: 10, showscale: true, colorbar: { title: { text: 'T (°C)' } } },
      }];
    }
    if (visualizedSource === 'biotite' && visualizedResults.length > 0) {
      return [{
        x: visualizedResults.map(r => r.Ti),
        y: visualizedResults.map(r => r.Temps?.Henry),
        mode: 'markers' as const, type: 'scatter' as const, name: '黑云母温度',
        marker: { color: visualizedResults.map(r => r.Temps?.Henry), colorscale: 'Hot', size: 10, showscale: true, colorbar: { title: { text: 'T (°C)' } } },
      }];
    }
    return [];
  };

  const scatter2dLayout = () => visualizedSource === 'chlorite'
    ? { title: { text: '绿泥石 Al(IV) vs 温度' }, xaxis: { title: { text: 'Al(IV) (apfu)' } }, yaxis: { title: { text: 'Temperature (°C)' } } }
    : { title: { text: '黑云母 Ti vs 温度' }, xaxis: { title: { text: 'Ti (apfu)' } }, yaxis: { title: { text: 'Temperature (°C)' } } };

  const scatter3dData = () => {
    const src = visualizedResults;
    if (src.length === 0) return [];
    return [{
      x: src.map(r => r.Si), y: src.map(r => r.Fe), z: src.map(r => r.Mg),
      mode: 'markers' as const, type: 'scatter3d' as const, name: '矿物成分',
      marker: { color: src.map(r => r.Temps?.Cathelineau ?? r.Temps?.Henry ?? 0), colorscale: 'Viridis', size: 6, showscale: true, colorbar: { title: { text: 'T (°C)' } }, opacity: 0.85 },
    }];
  };

  const histogramData = () => {
    const temps: number[] = [];
    if (visualizedSource === 'chlorite') visualizedResults.forEach(r => { if (r.Temps?.Cathelineau) temps.push(r.Temps.Cathelineau); });
    if (visualizedSource === 'biotite') visualizedResults.forEach(r => { if (r.Temps?.Henry) temps.push(r.Temps.Henry); });
    if (temps.length === 0) return [];
    return [{ x: temps, type: 'histogram' as const, name: '温度分布', marker: { color: 'rgba(99, 102, 241, 0.7)', line: { color: 'rgba(99, 102, 241, 1)', width: 1 } }, nbinsx: 15 }];
  };

  const pieData = () => {
    if (visualizedSource !== 'mineral' || visualizedResults.length === 0) return [];
    const counts: Record<string, number> = {};
    visualizedResults.forEach(r => { const t = r.Type || 'Unknown'; counts[t] = (counts[t] || 0) + 1; });
    return [{
      labels: Object.keys(counts), values: Object.values(counts), type: 'pie' as const, hole: 0.35, textinfo: 'label+percent' as const,
      marker: { colors: Object.keys(counts).map(k => k === 'Muscovite' ? '#8b5cf6' : k === 'Chlorite' ? '#10b981' : k === 'Biotite' ? '#f59e0b' : '#94a3b8') },
    }];
  };

  const renderResultTable = () => {
    if (!hasCurrentVisualization) return null;

    const rows = visualizedResults.slice(0, 50);

    if (visualizedSource === 'chlorite') {
      return (
        <div className="mt-6 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h4 className="text-sm font-semibold text-slate-800">计算表格 - 绿泥石温度计</h4>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">样本</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Si</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Al(IV)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Fe/(Fe+Mg)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-indigo-600 uppercase">T_Cath</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-indigo-600 uppercase">T_Jow</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-indigo-600 uppercase">T_Kran</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-indigo-600 uppercase">T_Zang</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, i) => {
                  const feRatio = (row.Fe / (row.Fe + row.Mg || 1)).toFixed(2);
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{row.Sample || `点位${i + 1}`}</td>
                      <td className="px-4 py-2.5 text-slate-700">{row.Si}</td>
                      <td className="px-4 py-2.5 text-slate-700">{row.Al_IV}</td>
                      <td className="px-4 py-2.5 text-slate-700">{feRatio}</td>
                      <td className="px-4 py-2.5 text-indigo-700">{row.Temps?.Cathelineau}</td>
                      <td className="px-4 py-2.5 text-indigo-700">{row.Temps?.Jowett}</td>
                      <td className="px-4 py-2.5 text-indigo-700">{row.Temps?.Kranidiotis}</td>
                      <td className="px-4 py-2.5 text-indigo-700">{row.Temps?.Zang}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (visualizedSource === 'biotite') {
      return (
        <div className="mt-6 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h4 className="text-sm font-semibold text-slate-800">计算表格 - 黑云母温度计</h4>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">样本</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Si</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Ti</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">XMg</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">分类</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-amber-600 uppercase">T_Henry</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-amber-600 uppercase">T_Luhr</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, i) => {
                  const xMg = (row.Mg / ((row.Fe + row.Mg) || 1)).toFixed(3);
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{row.Sample || `点位${i + 1}`}</td>
                      <td className="px-4 py-2.5 text-slate-700">{row.Si}</td>
                      <td className="px-4 py-2.5 text-slate-700">{row.Ti}</td>
                      <td className="px-4 py-2.5 text-slate-700">{xMg}</td>
                      <td className="px-4 py-2.5 text-slate-700">{row.Classification}</td>
                      <td className="px-4 py-2.5 text-amber-700">{row.Temps?.Henry}</td>
                      <td className="px-4 py-2.5 text-amber-700">{row.Temps?.Luhr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-6 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h4 className="text-sm font-semibold text-slate-800">计算表格 - 矿物识别</h4>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">样本</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">类型</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">分类</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Si</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Al(IV)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Fe</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Mg</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">温度/提示</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{row.Sample || `点位${i + 1}`}</td>
                  <td className="px-4 py-2.5 text-slate-700">{row.Type || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-700">{row.Classification || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-700">{row.Formula?.Si ?? '-'}</td>
                  <td className="px-4 py-2.5 text-slate-700">{row.Formula?.Al_IV ?? '-'}</td>
                  <td className="px-4 py-2.5 text-slate-700">{row.Formula?.Fe ?? '-'}</td>
                  <td className="px-4 py-2.5 text-slate-700">{row.Formula?.Mg ?? '-'}</td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {row.Temps
                      ? row.Temps.type === 'chlorite'
                        ? `${row.Temps.values.Cathelineau}°C`
                        : `${row.Temps.values.Henry}°C`
                      : '无温度公式'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const chartTabs: { key: ChartType; label: string; icon: React.ReactNode; need: string }[] = [
    { key: 'scatter2d', label: '散点图', icon: <ScatterChart className="w-4 h-4" />, need: 'thermo' },
    { key: 'scatter3d', label: '3D散点', icon: <BarChart3 className="w-4 h-4" />, need: 'thermo' },
    { key: 'histogram', label: '温度直方图', icon: <BarChart3 className="w-4 h-4" />, need: 'thermo' },
    { key: 'pie', label: '矿物分类饼图', icon: <PieChart className="w-4 h-4" />, need: 'mineral' },
  ];
  const visibleChartTabs = dataSource === 'mineral'
    ? chartTabs.filter(tab => tab.key === 'pie')
    : chartTabs.filter(tab => tab.key !== 'pie');

  const renderChart = () => {
    const plotStyle = { width: '100%', height: '100%' };
    const baseMargin = { l: 60, r: 30, b: 60, t: 50 };

    switch (chartType) {
      case 'scatter2d': {
        const d = scatter2dData();
        if (d.length === 0) return <NoData />;
        return <Plot data={d} layout={{ ...scatter2dLayout(), autosize: true, margin: baseMargin }} useResizeHandler style={plotStyle} />;
      }
      case 'scatter3d': {
        const d = scatter3dData();
        if (d.length === 0) return <NoData />;
        return <Plot data={d} layout={{ title: { text: '矿物成分三维散点 (Si-Fe-Mg)' }, autosize: true, scene: { xaxis: { title: { text: 'Si' } }, yaxis: { title: { text: 'Fe' } }, zaxis: { title: { text: 'Mg' } } }, margin: { l: 0, r: 0, b: 0, t: 40 } }} useResizeHandler style={plotStyle} />;
      }
      case 'histogram': {
        const d = histogramData();
        if (d.length === 0) return <NoData />;
        return <Plot data={d} layout={{ title: { text: '温度分布直方图' }, autosize: true, xaxis: { title: { text: 'Temperature (°C)' } }, yaxis: { title: { text: '频次' } }, margin: baseMargin }} useResizeHandler style={plotStyle} />;
      }
      case 'pie': {
        const d = pieData();
        if (d.length === 0) return <NoData />;
        return <Plot data={d} layout={{ title: { text: '矿物类型分布' }, autosize: true, margin: { l: 30, r: 30, b: 30, t: 50 } }} useResizeHandler style={plotStyle} />;
      }
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col lg:flex-row gap-6" style={{ height: 'calc(100vh - 140px)' }}>
        {/* Left panel: upload + controls */}
        <div className="w-full lg:w-72 shrink-0 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">数据可视化</h1>
            <p className="mt-1 text-sm text-slate-500">上传数据后自动判别矿物类型，并生成对应结果表和图表</p>
          </div>

          {/* Upload */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div
              className={`rounded-2xl border-2 border-dashed p-4 transition-colors cursor-pointer ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-slate-300 bg-white hover:bg-slate-50'
              }`}
              role="button"
              tabIndex={0}
              onClick={openFilePicker}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openFilePicker();
                }
              }}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <Upload className="w-6 h-6 text-indigo-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">
                    点击选择文件，或把 CSV / Excel 直接拖到这里
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    系统会自动判断矿物类型，并在识别后直接计算结果
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openFilePicker();
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      选择文件
                    </button>
                    <span className="text-[11px] text-slate-400">支持 .csv / .xlsx / .xls</span>
                  </div>
                  {localData.length > 0 && (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700 border border-emerald-100">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      已加载 {localData.length} 条
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">自动识别结果（可手动调整）</label>
              <select
                value={dataSource}
                onChange={(e) => {
                  const nextSource = e.target.value as DataSource;
                  setDataSource(nextSource);
                  setChartType(nextSource === 'mineral' ? 'pie' : 'scatter2d');
                }}
                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="chlorite">绿泥石温度计</option>
                <option value="biotite">黑云母温度计</option>
                <option value="mineral">矿物识别</option>
              </select>
              <p className="mt-1 text-[11px] text-slate-400">系统会先自动判断；如果判断不对，再手动切换。</p>
            </div>

            <button
              onClick={handleCalculateAndVisualize}
              disabled={loading || localData.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Calculator className="w-4 h-4" />
              {loading ? '计算中...' : visualizedResults.length > 0 ? '重新计算' : '计算并可视化'}
            </button>

            {error && (
              <div className="p-2 bg-red-50 text-red-600 rounded text-xs flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" /> {error}
              </div>
            )}

            {detection && detection.validRows > 0 && (
              <div className={`rounded-lg border p-3 text-xs space-y-2 ${
                detection.source === 'chlorite'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : detection.source === 'biotite'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <div className="font-semibold text-sm">
                  自动判别：{detection.label}
                </div>
                <div>{detection.detail}</div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="px-2 py-0.5 rounded-full bg-white/70 border border-current/10">
                    有效样本 {detection.validRows}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/70 border border-current/10">
                    置信度 {(detection.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-white/70 border border-current/10">绿泥石 {detection.counts.Chlorite}</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/70 border border-current/10">黑云母 {detection.counts.Biotite}</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/70 border border-current/10">白云母 {detection.counts.Muscovite}</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/70 border border-current/10">未知 {detection.counts.Unknown}</span>
                </div>
              </div>
            )}
          </div>

          {/* Chart type selector */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
            <span className="text-xs font-medium text-slate-500">图表类型</span>
            {visibleChartTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setChartType(tab.key)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  chartType === tab.key
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Data status */}
          {hasCurrentVisualization && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <span className="text-xs font-medium text-slate-500">本次计算结果</span>
              <div className="flex items-center gap-2 text-xs text-indigo-600">
                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                {visualizedSource === 'chlorite' && '绿泥石'}
                {visualizedSource === 'biotite' && '黑云母'}
                {visualizedSource === 'mineral' && '矿物识别'}
                ：{visualizedResults.length} 条
              </div>
            </div>
          )}
        </div>

        {/* Right panel: chart */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 min-h-0 flex flex-col">
          <div className="w-full flex-1 min-h-[320px] bg-slate-50 rounded-xl border border-slate-100">
            {hasCurrentVisualization ? renderChart() : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <BarChart3 className="w-14 h-14 mb-3 opacity-20" />
                <p className="text-sm font-medium mb-1">暂无本页数据</p>
                <p className="text-xs opacity-70">先上传当前文件，再点击“计算并可视化”</p>
              </div>
            )}
          </div>
          {renderResultTable()}
        </div>
      </div>
    </motion.div>
  );
};

function NoData() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-400">
      <BarChart3 className="w-12 h-12 mb-3 opacity-20" />
      <p className="text-sm">当前图表类型无匹配数据，请切换图表或上传对应数据</p>
    </div>
  );
}

export default Visualization;
