import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import {
  BookOpen, Compass, Microscope, Thermometer, BarChart2,
  ChevronDown, ChevronUp, Flame, ArrowRight, Send, Bot, User, Sparkles, Loader2
} from 'lucide-react';

// ==================== AI Chat ====================

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED_QUESTIONS = [
  '什么是绿泥石温度计？原理是什么？',
  '电子探针数据中各氧化物代表什么含义？',
  '如何通过矿物组合判断岩石变质程度？',
  '野外地质调查需要注意哪些安全事项？',
  '斜长石和钾长石在薄片下如何区分？',
  '什么是IQR异常值检测方法？',
];

const DISPLAY_FONT = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif';

const HERO_METRICS = [
  { label: '知识问答', value: 'AI 在线', detail: '首页可直接提问地质问题' },
  { label: '温度解译', value: '4+2', detail: '覆盖绿泥石与黑云母多公式' },
  { label: '展示输出', value: '图件+报告', detail: '可视化和 AI 解读联动' },
];

const DEFENSE_HIGHLIGHTS = [
  '首页直接展示 AI 地质知识问答，答辩时不再是空首页。',
  '上传 Excel / CSV 后可自动识别矿物类型并切换对应分析流程。',
  '绿泥石结果已按高温组与低温组分色，并增加组间差值提示。',
  '可视化页支持自动判别数据来源，减少现场切页解释成本。',
];

function AiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    const userMsg = text.trim();
    if (!userMsg || loading) return;

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    // Build conversation history for API
    const apiMessages = [
      {
        role: 'system',
        content: '你是一个专业的地质学助手，精通岩石学、矿物学、地球化学、构造地质学等领域。你的回答应准确、专业但通俗易懂，适合地质专业的本科生和研究生。回答时可以结合实际案例和野外经验。请用中文回答。'
      },
      ...newMessages.map(m => ({ role: m.role, content: m.content }))
    ];

    try {
      abortRef.current = new AbortController();
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          max_tokens: 2048,
          temperature: 0.7,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        throw new Error(`API 请求失败 (${res.status})`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                return updated;
              });
            }
          } catch {
            // skip malformed SSE chunks
          }
        }
      }

      // If no content was streamed, show fallback
      if (!assistantContent) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: '抱歉，暂时无法获取回答，请稍后再试。' };
          return updated;
        });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => {
          // Remove empty assistant message if exists, add error
          const updated = prev[prev.length - 1]?.content === '' ? prev.slice(0, -1) : [...prev];
          return [...updated, { role: 'assistant', content: '网络连接出现问题，请检查网络后重试。' }];
        });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div id="ai-chat" className="scroll-mt-24 overflow-hidden rounded-[30px] border border-emerald-100 bg-white/95 shadow-[0_30px_80px_-40px_rgba(5,150,105,0.45)] backdrop-blur mb-20">
      {/* Chat header */}
      <div className="bg-[linear-gradient(135deg,#0f766e_0%,#065f46_45%,#0f172a_100%)] px-6 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-white/15 rounded-2xl flex items-center justify-center ring-1 ring-white/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium tracking-[0.2em] text-emerald-50/90">
                GEO AI DESK
              </div>
              <h2 className="mt-2 text-lg font-bold text-white">AI 地质知识问答</h2>
              <p className="text-sm text-emerald-100/90">把矿物学、岩石学、地球化学问题集中到一个演示窗口</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-emerald-50/85 sm:w-[320px]">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">适合答辩现场追问</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">支持连续多轮上下文</div>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="h-[440px] overflow-y-auto px-6 py-5 space-y-4 bg-[linear-gradient(180deg,rgba(236,253,245,0.6),rgba(248,250,252,0.9))]">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Bot className="w-14 h-14 text-slate-300 mb-4" />
            <p className="text-slate-700 mb-1 font-medium">你好，我是你的地质学 AI 助手</p>
            <p className="text-sm text-slate-500 mb-6">可以直接提问矿物温度计、探针氧化物含义、野外地质与薄片鉴定问题</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="text-left text-sm px-4 py-3 bg-white border border-slate-200 rounded-2xl hover:border-emerald-300 hover:bg-emerald-50 transition-colors text-slate-600 shadow-sm"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-emerald-600" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-[linear-gradient(135deg,#059669,#0f766e)] text-white rounded-br-md shadow-lg'
                  : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md shadow-sm'
              }`}>
                {msg.content || (loading && i === messages.length - 1 ? (
                  <span className="flex items-center gap-2 text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> 思考中...
                  </span>
                ) : null)}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center shrink-0 mt-1">
                  <User className="w-4 h-4 text-slate-600" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-6 py-4 border-t border-slate-200 bg-white">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的地质学问题..."
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-slate-300 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-2xl transition-colors flex items-center gap-2 text-sm font-medium shadow-sm"
          >
            <Send className="w-4 h-4" />
            发送
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">按 Enter 发送 | AI 回答仅供参考，请以教材和文献为准</p>
      </div>
    </div>
  );
}

// ==================== Knowledge Data ====================

interface KnowledgeSection {
  title: string;
  content: string[];
}

const geologyKnowledge: KnowledgeSection[] = [
  {
    title: '地球内部结构',
    content: [
      '地球由外向内可分为地壳、地幔和地核三个圈层。',
      '地壳平均厚度约17km，大陆地壳较厚（30-70km），大洋地壳较薄（5-10km）。地壳主要由硅铝质岩石和硅镁质岩石组成。',
      '地幔厚约2865km，分为上地幔和下地幔。上地幔顶部存在软流层（约100-350km深度），是岩浆的主要发源地。',
      '地核由铁镍合金组成，外核为液态（产生地磁场），内核为固态，温度可达5000°C以上。',
    ],
  },
  {
    title: '三大岩石分类',
    content: [
      '岩浆岩（火成岩）：由岩浆冷凝结晶形成。侵入岩如花岗岩（深成）、闪长岩（中深成）；喷出岩如玄武岩、安山岩。按SiO₂含量分为超基性岩（<45%）、基性岩（45-52%）、中性岩（52-65%）、酸性岩（>65%）。',
      '沉积岩：由风化、搬运、沉积、成岩作用形成。包括碎屑岩（砂岩、泥岩）、化学岩（石灰岩、白云岩）、生物岩（煤、硅藻土）。沉积岩覆盖地表约75%面积，但仅占地壳体积的5%。',
      '变质岩：原有岩石在高温高压下发生矿物成分和结构变化形成。区域变质如片麻岩、片岩；接触变质如大理岩、石英岩；动力变质如糜棱岩。变质作用的主要因素为温度、压力和化学活动性流体。',
    ],
  },
  {
    title: '地质年代简史',
    content: [
      '地球形成于约46亿年前。地质年代按从老到新分为：太古宙（>25亿年）、元古宙（25-5.41亿年）、显生宙（5.41亿年至今）。',
      '显生宙分为古生代（寒武纪-二叠纪）、中生代（三叠纪-白垩纪）和新生代（古近纪-第四纪）。',
      '寒武纪（5.41亿年前）发生"生命大爆发"；二叠纪末（2.52亿年前）发生地球史上最大规模生物灭绝；白垩纪末（6600万年前）恐龙灭绝。',
      '第四纪（260万年至今）以冰期-间冰期交替和人类演化为特征。',
    ],
  },
];

const fieldSurvival: KnowledgeSection[] = [
  {
    title: '野外装备清单',
    content: [
      '基本工具：地质锤（尖头/平头）、罗盘、放大镜（10x）、稀盐酸（5% HCl）、GPS定位仪。',
      '记录用品：野外记录本、彩色铅笔、比例尺、样品袋（编号标签）、相机。',
      '安全装备：头盔、防滑登山鞋、急救包、防晒霜、雨衣、饮用水（每人每天≥2L）。',
      '数字工具：手机地质APP（如GeoCompass）、移动电源、对讲机（山区信号差时使用）。',
    ],
  },
  {
    title: '方向辨别与定位',
    content: [
      '罗盘使用：水平放置，对准目标读取方位角。测量岩层产状时记录走向、倾向和倾角。',
      '自然判断法：北半球太阳正午在正南方；独立树木南侧枝叶茂盛；蚂蚁窝口多朝南；积雪北坡融化慢。',
      '地图与GPS：出发前下载离线地质图和地形图。每到一个观测点用GPS记录坐标，标注在图上。',
      '紧急定位：如遇迷路，沿水流方向下行通常能到达居民点。保持手机电量用于紧急呼叫。',
    ],
  },
  {
    title: '常见岩矿野外识别',
    content: [
      '花岗岩：肉红色/灰白色，粗粒结构，可见石英（玻璃光泽）、长石（解理面）和云母（片状闪光）。',
      '玄武岩：深灰色/黑色，常见气孔构造，质地致密，密度大于花岗岩。新鲜面呈暗色。',
      '石灰岩：灰色/灰白色，滴稀盐酸剧烈起泡。常含化石。硬度较低（摩氏3）。',
      '石英：无色透明至乳白色，贝壳状断口，硬度7（可划玻璃）。脉石英常呈白色不规则脉体。',
      '方解石：菱面体解理完全，滴盐酸起泡，硬度3，常见于石灰岩和大理岩中。',
    ],
  },
];

const thinSectionGuide: KnowledgeSection[] = [
  {
    title: '偏光显微镜基本操作',
    content: [
      '薄片标准厚度为0.03mm（30μm），此时石英干涉色为一级灰白。',
      '单偏光镜下观察：颜色、多色性、形态、解理、突起、糙面。',
      '正交偏光镜下观察：干涉色级序、消光类型（平行/斜/对称）、消光角、双晶。',
      '锥光镜下观察：高倍物镜 + 聚光镜，观察干涉图判断一轴晶/二轴晶及光性正负。',
    ],
  },
  {
    title: '常见造岩矿物镜下特征',
    content: [
      '石英：无色透明，无解理，低正突起，一级灰白干涉色，波状消光常见。',
      '斜长石：无色，聚片双晶（正交偏光下黑白相间条带），突起随成分变化。',
      '钾长石：无色，卡氏双晶，格子双晶（微斜长石特征），低负突起。',
      '角闪石：绿色-褐色，多色性强，两组解理（56°/124°），斜消光。',
      '辉石：浅绿色/无色，两组近直角解理（87°/93°），高突起，二至三级干涉色。',
      '橄榄石：无色至淡黄绿色，高正突起，裂纹发育（无解理），二至三级鲜艳干涉色。',
    ],
  },
];

// ==================== Page Component ====================

const Home: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12"
    >
      {/* Hero */}
      <div className="relative mb-16 overflow-hidden rounded-[32px] border border-emerald-200/70 bg-[linear-gradient(135deg,#ecfdf5_0%,#f8fafc_45%,#eff6ff_100%)] p-8 sm:p-10">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_60%)] lg:block" />
        <div className="absolute -left-16 top-12 h-40 w-40 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute bottom-0 right-10 h-48 w-48 rounded-full bg-sky-200/40 blur-3xl" />

        <div className="relative grid gap-10 lg:grid-cols-[1.2fr,0.8fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-xs font-medium tracking-[0.22em] text-emerald-700 shadow-sm">
              AI Q&A + 矿物温度解译 + 图件展示
            </div>
            <h1
              className="mt-6 max-w-4xl text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl lg:text-6xl"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              地质知识问答与矿物分析，一页进入答辩展示状态
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">
              平台把地质知识问答、电子探针数据上传、绿泥石与黑云母温度计、矿物识别和结果可视化整合到同一工作流中，适合课程展示、毕业答辩和基础教学演示。
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#ai-chat"
                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-emerald-500/20 transition-transform hover:-translate-y-0.5 hover:bg-emerald-700"
              >
                <Sparkles className="w-4 h-4" />
                直接发起 AI 问答
              </a>
              <Link
                to="/visualization"
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/80 px-5 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-white"
              >
                <BarChart2 className="w-4 h-4" />
                查看可视化图件
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {HERO_METRICS.map((metric) => (
                <div key={metric.label} className="rounded-3xl border border-white/80 bg-white/85 p-4 shadow-sm backdrop-blur">
                  <p className="text-xs font-medium tracking-[0.16em] text-slate-400">{metric.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{metric.value}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{metric.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="rounded-[28px] border border-slate-900/5 bg-slate-950 p-6 text-white shadow-[0_35px_90px_-40px_rgba(15,23,42,0.85)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium tracking-[0.22em] text-emerald-300/80">DEFENSE READY</p>
                  <h2 className="mt-2 text-2xl font-semibold">答辩展示重点</h2>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-400/20">
                  <Compass className="h-5 w-5 text-emerald-300" />
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {DEFENSE_HIGHLIGHTS.map((highlight) => (
                  <div key={highlight} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-slate-200">
                    {highlight}
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <ToolCard
                  to="/thermometer"
                  icon={<Thermometer className="w-5 h-5 text-indigo-200" />}
                  bg="bg-indigo-500/15"
                  title="绿泥石温度计"
                  desc="高温组/低温组分开展示"
                  compact
                />
                <ToolCard
                  to="/identification"
                  icon={<Microscope className="w-5 h-5 text-emerald-200" />}
                  bg="bg-emerald-500/15"
                  title="矿物识别"
                  desc="自动判别白云母/绿泥石/黑云母"
                  compact
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Chat - 首页核心区域 */}
      <AiChat />

      {/* Quick tools */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-16">
        <ToolCard
          to="/thermometer"
          icon={<Thermometer className="w-6 h-6 text-indigo-600" />}
          bg="bg-indigo-100"
          title="绿泥石温度计"
          desc="上传探针数据，计算矿物形成温度"
        />
        <ToolCard
          to="/biotite-thermometer"
          icon={<Flame className="w-6 h-6 text-amber-600" />}
          bg="bg-amber-100"
          title="黑云母温度计"
          desc="Ti-in-Biotite 温度计算与分类"
        />
        <ToolCard
          to="/identification"
          icon={<Microscope className="w-6 h-6 text-emerald-600" />}
          bg="bg-emerald-100"
          title="矿物识别"
          desc="自动判别白云母/绿泥石/黑云母"
        />
        <ToolCard
          to="/visualization"
          icon={<BarChart2 className="w-6 h-6 text-rose-600" />}
          bg="bg-rose-100"
          title="数据可视化"
          desc="散点图、直方图、饼图自动生成"
        />
      </div>

      {/* Knowledge sections */}
      <SectionBlock
        icon={<BookOpen className="w-6 h-6 text-emerald-600" />}
        bg="bg-emerald-100"
        title="地质科普模块"
        sections={geologyKnowledge}
      />

      <SectionBlock
        icon={<Compass className="w-6 h-6 text-amber-600" />}
        bg="bg-amber-100"
        title="野外生存手册"
        sections={fieldSurvival}
      />

      <SectionBlock
        icon={<Microscope className="w-6 h-6 text-indigo-600" />}
        bg="bg-indigo-100"
        title="镜下薄片鉴定指南"
        sections={thinSectionGuide}
      />
    </motion.div>
  );
};

function ToolCard({
  to,
  icon,
  bg,
  title,
  desc,
  compact,
}: {
  to: string;
  icon: React.ReactNode;
  bg: string;
  title: string;
  desc: string;
  compact?: boolean;
}) {
  return (
    <Link
      to={to}
      className={
        compact
          ? 'group rounded-[26px] border border-slate-200/80 bg-white/90 p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-emerald-200 hover:shadow-[0_24px_70px_-45px_rgba(16,185,129,0.55)]'
          : 'group rounded-[26px] border border-slate-200/80 bg-white/90 p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-emerald-200 hover:shadow-[0_24px_70px_-45px_rgba(16,185,129,0.55)]'
      }
    >
      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${bg} ring-1 ring-black/5`}>
        {icon}
      </div>
      <h3 className={`${compact ? 'text-base' : 'text-lg'} font-bold text-slate-900 mb-2`}>{title}</h3>
      <p className="text-sm text-slate-500 mb-3 leading-6">{desc}</p>
      <span className="text-sm text-emerald-600 font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
        进入工具 <ArrowRight className="w-4 h-4" />
      </span>
    </Link>
  );
}

function SectionBlock({ icon, bg, title, sections }: { icon: React.ReactNode; bg: string; title: string; sections: KnowledgeSection[] }) {
  return (
      <div className="mb-12">
      <div className="flex items-center gap-3 mb-6">
        <div className={`w-11 h-11 ${bg} rounded-2xl flex items-center justify-center ring-1 ring-black/5`}>
          {icon}
        </div>
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
      </div>
      <div className="space-y-3">
        {sections.map((section, i) => (
          <AccordionItem key={i} title={section.title} content={section.content} />
        ))}
      </div>
    </div>
  );
}

function AccordionItem({ title, content }: { title: string; content: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white/90 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="font-semibold text-slate-800">{title}</span>
        {open ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
      </button>
      {open && (
        <div className="px-6 pb-5 space-y-3">
          {content.map((para, i) => (
            <p key={i} className="text-sm text-slate-600 leading-relaxed">{para}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default Home;
