import React, { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { clsx } from 'clsx';
import AITrainingModal from '../components/AITrainingModal';
import { api, ApiError, formatCurrency } from '../lib/api';

const COLORS = ['#00e5ff', '#d946ef', '#f59e0b', '#3b82f6', '#10b981', '#ef4444'];

export default function Analytics() {
  const [timeRange, setTimeRange] = useState('7days');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [aiActions, setAiActions] = useState<string[]>([]);
  const [isTrainingOpen, setIsTrainingOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    revenue: 0, ordersCount: 0, conversationsCount: 0, closeRate: 0,
    aiMessages: 0, aiClosed: 0, handoffs: 0, newCustomers: 0, leadsWithPhone: 0,
  });
  const [trends, setTrends] = useState<Record<string, number | null>>({});
  const [performanceData, setPerformanceData] = useState<
    Array<{ name: string; revenue: number; orders: number; aiInteractions: number }>
  >([]);
  const [trafficSourceData, setTrafficSourceData] = useState<
    Array<{ name: string; value: number; count: number }>
  >([]);

  const load = useCallback(async (range: string) => {
    setLoading(true);
    try {
      const data = await api.analytics.overview(range);
      setStats(data.stats);
      setTrends(data.trends);
      setPerformanceData(data.series);
      setTrafficSourceData(data.sources);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không tải được số liệu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(timeRange); }, [load, timeRange]);

  // Báo cáo AI đã lưu trước đó, hiện lại luôn thay vì bắt bấm phân tích lại.
  useEffect(() => {
    api.analytics.reports()
      .then(({ data }) => {
        if (data.length > 0) setAiReport(data[0].findings + '\n\n' + data[0].recommendation);
      })
      .catch(() => { /* chưa có báo cáo nào */ });
  }, []);

  /**
   * Gọi AI phân tích thật.
   * Bản cũ chỉ chờ 2 giây rồi hiện một đoạn văn viết sẵn nhắc tới Meta Ads và
   * TikTok, kể cả khi shop chưa kết nối hai kênh đó.
   */
  const runAiAnalysis = async () => {
    setIsAnalyzing(true);
    setAiReport(null);
    setAiActions([]);
    setErrorMessage('');
    try {
      const { data } = await api.analytics.analyze(timeRange);
      setAiReport(
        data.recommendation ? `${data.findings}\n\n${data.recommendation}` : data.findings
      );
      setAiActions(data.actions);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'AI chưa phân tích được');
    } finally {
      setIsAnalyzing(false);
    }
  };

  /** Định dạng phần trăm thay đổi; kỳ trước bằng 0 thì không hiện gì. */
  const trendText = (key: string): { text: string; isUp: boolean } | null => {
    const value = trends[key];
    if (value === null || value === undefined) return null;
    return { text: `${value > 0 ? '+' : ''}${value}%`, isUp: value >= 0 };
  };

  const metricCards = [
    {
      label: 'Tổng doanh thu',
      value: formatCurrency(stats.revenue),
      trend: trendText('revenue'),
      icon: 'payments',
    },
    {
      label: 'Số đơn hàng',
      value: String(stats.ordersCount),
      trend: trendText('ordersCount'),
      icon: 'receipt_long',
    },
    {
      label: 'Tỷ lệ chốt đơn',
      value: `${stats.closeRate}%`,
      trend: null,
      icon: 'done_all',
      hint: `${stats.ordersCount} đơn / ${stats.conversationsCount} hội thoại`,
    },
    {
      label: 'AI Tương tác',
      value: stats.aiMessages.toLocaleString('vi-VN'),
      trend: trendText('aiMessages'),
      icon: 'forum',
    },
  ];

  const hasAnyData = stats.conversationsCount > 0 || stats.ordersCount > 0;

  return (
    <main className="flex-1 w-full relative bg-background text-on-surface">
      <div className="pt-8 pb-8 px-margin max-w-[1600px] mx-auto w-full">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-lg">
          <div>
            <h2 className="text-on-surface-variant font-body-lg">AI Thống Kê - Phân Tích</h2>
            <p className="text-sm font-medium text-on-surface-variant/80 mt-1">Đánh giá hiệu suất tổng thể và nhận đề xuất từ AI</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsTrainingOpen(true)}
              className="px-4 py-2 bg-surface-container text-primary border border-primary/30 font-bold rounded-lg hover:bg-primary/10 transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">model_training</span>
              Huấn luyện AI
            </button>
            <select 
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-4 py-2 bg-surface-container rounded-lg border border-outline-variant hover:border-primary transition-colors text-sm font-medium outline-none text-on-surface appearance-none"
            >
              <option value="today">Hôm nay</option>
              <option value="7days">7 ngày qua</option>
              <option value="30days">30 ngày qua</option>
              <option value="thisMonth">Tháng này</option>
            </select>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-gutter text-sm text-error bg-error/10 border border-error/30 rounded-xl px-4 py-3">
            {errorMessage}
          </div>
        )}

        {/* AI Analysis Panel */}
        <div className="mb-gutter bg-gradient-to-r from-primary/10 via-surface-container-high to-surface-container rounded-2xl border border-primary/30 p-6 shadow-[0_0_30px_rgba(0,229,255,0.05)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none translate-x-1/2 -translate-y-1/2"></div>
          
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary shadow-[0_0_15px_rgba(0,229,255,0.2)]">
                  <span className="material-symbols-outlined text-[24px]">auto_awesome</span>
                </div>
                <h3 className="text-lg font-bold text-on-surface tracking-wide">AI Phân Tích Hiệu Suất</h3>
              </div>
              
              {!aiReport && !isAnalyzing && (
                <p className="text-sm text-on-surface-variant font-medium">
                  {hasAnyData
                    ? `Đã có ${stats.conversationsCount} hội thoại và ${stats.ordersCount} đơn trong kỳ này. Bấm "Bắt đầu phân tích" để AI đánh giá và đề xuất hướng tối ưu.`
                    : 'Chưa có hội thoại hay đơn hàng nào trong kỳ này. AI cần dữ liệu thật để phân tích — hãy kết nối kênh bán hàng trước.'}
                </p>
              )}

              {isAnalyzing && (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary animate-spin">sync</span>
                    <span className="text-sm text-primary font-medium">Đang xử lý dữ liệu và tạo báo cáo...</span>
                  </div>
                  <div className="w-full max-w-md h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-2/3 animate-pulse"></div>
                  </div>
                </div>
              )}

              {aiReport && (
                <div className="mt-3 p-4 bg-surface-container-lowest/50 border border-outline-variant rounded-xl">
                  <p className="text-sm text-on-surface leading-relaxed whitespace-pre-line">{aiReport}</p>
                  {aiActions.length > 0 && (
                    <ul className="mt-3 pt-3 border-t border-outline-variant/50 space-y-1.5">
                      {aiActions.map((action, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-primary">
                          <span className="material-symbols-outlined text-[16px] mt-0.5">arrow_right</span>
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <button 
              onClick={runAiAnalysis}
              disabled={isAnalyzing || !hasAnyData}
              className={clsx(
                "shrink-0 px-6 py-3 rounded-xl font-bold text-sm tracking-wide transition-all shadow-lg flex items-center gap-2",
                (isAnalyzing || !hasAnyData) ? "bg-surface-variant text-on-surface-variant cursor-not-allowed" : "bg-primary text-on-primary hover:brightness-110 shadow-[0_0_20px_rgba(0,229,255,0.3)]"
              )}
            >
              {isAnalyzing ? (
                <>Đang phân tích...</>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">insights</span>
                  Bắt đầu phân tích
                </>
              )}
            </button>
          </div>
        </div>

        {/* Overview Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter mb-gutter">
          {metricCards.map((card, i) => (
            <div key={i} className="bg-surface-container-high rounded-xl p-5 border border-outline-variant shadow-lg flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-surface-variant flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined text-[24px]">{card.icon}</span>
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">{card.label}</p>
                <div className="flex items-end gap-2">
                  <h4 className="text-xl font-black text-on-surface">{card.value}</h4>
                  {card.trend && (
                    <span className={clsx("text-xs font-bold mb-0.5", card.trend.isUp ? "text-green-400" : "text-error")}>
                      {card.trend.text}
                    </span>
                  )}
                </div>
                {card.hint && (
                  <p className="text-[11px] text-on-surface-variant/70 mt-0.5">{card.hint}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
          {/* Main Chart: Revenue & Orders */}
          <div className="bg-surface-container rounded-xl border border-outline-variant p-6 shadow-lg lg:col-span-2">
            <h3 className="font-headline-sm text-lg font-bold text-on-surface mb-6">Biểu đồ doanh thu</h3>
            <div className="h-[300px] w-full">
              {stats.revenue === 0 && stats.ordersCount === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-2">
                  <span className="material-symbols-outlined text-[40px] text-on-surface-variant/40">show_chart</span>
                  <p className="text-sm text-on-surface-variant">Chưa có doanh thu trong kỳ này</p>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00e5ff" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#00e5ff" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" stroke="#8b95a1" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#8b95a1" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value / 1000000}M`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px' }}
                    itemStyle={{ color: '#00e5ff', fontWeight: 'bold' }}
                    labelStyle={{ color: '#9ca3af', marginBottom: '4px' }}
                    formatter={(value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#00e5ff" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Traffic Source Pie Chart */}
          <div className="bg-surface-container rounded-xl border border-outline-variant p-6 shadow-lg flex flex-col">
            <h3 className="font-headline-sm text-lg font-bold text-on-surface mb-6">Nguồn khách hàng</h3>
            <div className="h-[300px] w-full flex-1">
              {trafficSourceData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-2">
                  <span className="material-symbols-outlined text-[40px] text-on-surface-variant/40">pie_chart</span>
                  <p className="text-sm text-on-surface-variant">Chưa có khách hàng nào</p>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={trafficSourceData}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {trafficSourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px' }}
                    itemStyle={{ fontWeight: 'bold' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

      </div>
      
      <AITrainingModal isOpen={isTrainingOpen} onClose={() => setIsTrainingOpen(false)} aiName="AI Thống Kê - Phân Tích" />
    </main>
  );
}
