import React, { useState } from 'react';
import { 
  AreaChart, Area, 
  BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { clsx } from 'clsx';
import AITrainingModal from '../components/AITrainingModal';

const performanceData = [
  { name: '01/08', revenue: 15000000, orders: 45, aiInteractions: 120 },
  { name: '02/08', revenue: 22000000, orders: 60, aiInteractions: 150 },
  { name: '03/08', revenue: 18000000, orders: 55, aiInteractions: 180 },
  { name: '04/08', revenue: 28000000, orders: 85, aiInteractions: 210 },
  { name: '05/08', revenue: 32000000, orders: 95, aiInteractions: 250 },
  { name: '06/08', revenue: 45000000, orders: 120, aiInteractions: 320 },
  { name: '07/08', revenue: 38000000, orders: 110, aiInteractions: 280 },
];

const trafficSourceData = [
  { name: 'Facebook', value: 45 },
  { name: 'Tiktok', value: 30 },
  { name: 'Google Ads', value: 15 },
  { name: 'Direct', value: 10 },
];
const COLORS = ['#00e5ff', '#d946ef', '#f59e0b', '#3b82f6'];

export default function Analytics() {
  const [timeRange, setTimeRange] = useState('7days');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isTrainingOpen, setIsTrainingOpen] = useState(false);

  const runAiAnalysis = () => {
    setIsAnalyzing(true);
    setAiReport(null);
    setTimeout(() => {
      setAiReport("Phân tích dữ liệu 7 ngày qua cho thấy: Doanh thu đang có xu hướng tăng mạnh vào các ngày cuối tuần (05-06/08) nhờ chiến dịch Meta Ads. Tuy nhiên, tỷ lệ phản hồi trên TikTok đang chậm lại. Đề xuất: Tăng ngân sách 15% cho Meta Ads và kích hoạt Kịch bản giảm giá khẩn cấp (Flash Sale) trên TikTok để kéo lại tương tác.");
      setIsAnalyzing(false);
    }, 2000);
  };

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
                  Hệ thống đã thu thập đủ dữ liệu. Bấm "Bắt đầu phân tích" để AI đánh giá các chỉ số và đưa ra chiến lược tối ưu.
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
                  <p className="text-sm text-on-surface leading-relaxed">{aiReport}</p>
                </div>
              )}
            </div>

            <button 
              onClick={runAiAnalysis}
              disabled={isAnalyzing}
              className={clsx(
                "shrink-0 px-6 py-3 rounded-xl font-bold text-sm tracking-wide transition-all shadow-lg flex items-center gap-2",
                isAnalyzing ? "bg-surface-variant text-on-surface-variant cursor-not-allowed" : "bg-primary text-on-primary hover:brightness-110 shadow-[0_0_20px_rgba(0,229,255,0.3)]"
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
          {[
            { label: 'Tổng doanh thu', value: '198.000.000 đ', trend: '+15%', isUp: true, icon: 'payments' },
            { label: 'Số đơn hàng', value: '570', trend: '+8%', isUp: true, icon: 'receipt_long' },
            { label: 'Tỷ lệ chốt đơn', value: '12.5%', trend: '-2%', isUp: false, icon: 'done_all' },
            { label: 'AI Tương tác', value: '1,280', trend: '+24%', isUp: true, icon: 'forum' }
          ].map((card, i) => (
            <div key={i} className="bg-surface-container-high rounded-xl p-5 border border-outline-variant shadow-lg flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-surface-variant flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined text-[24px]">{card.icon}</span>
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">{card.label}</p>
                <div className="flex items-end gap-2">
                  <h4 className="text-xl font-black text-on-surface">{card.value}</h4>
                  <span className={clsx("text-xs font-bold mb-0.5", card.isUp ? "text-green-400" : "text-error")}>
                    {card.trend}
                  </span>
                </div>
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
            </div>
          </div>

          {/* Traffic Source Pie Chart */}
          <div className="bg-surface-container rounded-xl border border-outline-variant p-6 shadow-lg flex flex-col">
            <h3 className="font-headline-sm text-lg font-bold text-on-surface mb-6">Nguồn khách hàng</h3>
            <div className="h-[300px] w-full flex-1">
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
            </div>
          </div>
        </div>

      </div>
      
      <AITrainingModal isOpen={isTrainingOpen} onClose={() => setIsTrainingOpen(false)} aiName="AI Thống Kê - Phân Tích" />
    </main>
  );
}
