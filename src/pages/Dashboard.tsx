import React, { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { api, formatCurrency, timeAgo, ORDER_STATUS_LABELS } from '../lib/api';

type Range = '1d' | '7d' | '30d';

const RANGE_LABELS: Record<Range, string> = {
  '1d': 'Hôm nay',
  '7d': '7 ngày qua',
  '30d': '30 ngày qua',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [miniCharts, setMiniCharts] = useState<Array<{ id: number; label: string; value: string; data: number[] }>>([]);
  const [aiActivity, setAiActivity] = useState<Array<{ id: number; time: string; content: string; color: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [range, setRange] = useState<Range>('1d');
  const [rangeOpen, setRangeOpen] = useState(false);
  const [insightDismissed, setInsightDismissed] = useState(false);

  const load = useCallback(async (selected: Range) => {
    setIsLoading(true);
    try {
      const [stats, sparklines, activity] = await Promise.all([
        api.dashboard.stats(selected),
        api.dashboard.sparklines(),
        api.dashboard.activity(),
      ]);
      setDashboardData(stats);
      setMiniCharts(sparklines.data);
      setAiActivity(activity.data);
    } catch (error) {
      console.error('Không tải được dữ liệu bảng điều khiển', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [load, range]);

  const handleApplyRecommendation = async () => {
    setIsApplying(true);
    try {
      // Đưa thẳng sang màn hình huấn luyện AI bán hàng để chỉnh kịch bản,
      // vì đề xuất chỉ có giá trị khi được người duyệt và sửa vào kịch bản thật.
      navigate('/auto-scripts');
    } finally {
      setIsApplying(false);
    }
  };

  const stats = dashboardData?.stats || {
    orders_count: 0, revenue: 0, new_customers: 0, open_conversations: 0,
    waiting_human: 0, connected_accounts: 0, ai_messages: 0, ai_closed_orders: 0,
  };
  const realRecentOrders = dashboardData?.recentOrders || [];
  const urgentTasks = dashboardData?.urgentTasks || [];
  const aiInsight = dashboardData?.aiReport
    ? { rawData: dashboardData.aiReport.findings, recommendation: dashboardData.aiReport.recommendation }
    : {
        rawData: 'Hệ thống đang thu thập dữ liệu hội thoại và đơn hàng.',
        recommendation: 'Báo cáo phân tích sẽ xuất hiện sau khi có đủ dữ liệu trong ngày.',
      };

  const dynamicMetricCards = [
    {
      id: 1,
      label: 'Tổng Đơn Hàng',
      value: String(stats.orders_count),
      subtext: formatCurrency(stats.revenue),
      trend: stats.orders_count > 0 ? 'Tăng' : undefined,
    },
    {
      id: 2,
      label: 'Khách Hàng',
      value: String(stats.new_customers),
      subtext: 'Khách hàng đã tương tác',
      trend: stats.new_customers > 0 ? 'Tăng' : undefined,
    },
    {
      id: 3,
      label: 'Kênh Kết Nối',
      value: String(stats.connected_accounts),
      subtext: 'Fanpage đang hoạt động',
      isStatus: true,
      hasBlinkingDot: stats.connected_accounts === 0,
    },
    {
      id: 4,
      label: 'AI Đã Phản Hồi',
      value: String(stats.ai_messages),
      subtext: `${stats.ai_closed_orders} đơn do AI chốt`,
      action: 'Cấu hình kịch bản',
    }
  ];

  return (
    <main className="flex-1 w-full relative     bg-background text-on-surface">
      <div className="pt-8 pb-8 px-margin max-w-[1600px] mx-auto w-full">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-lg relative">
          <div>
            <h2 className="text-on-surface-variant font-body-lg">Tổng quan hoạt động tự động hôm nay</h2>
          </div>
          <div className="flex items-center gap-3 relative">
            <button
              onClick={() => setRangeOpen((open) => !open)}
              className="flex items-center gap-2 px-4 py-2 bg-surface-container rounded-lg border border-outline-variant hover:border-primary transition-colors text-sm font-medium"
            >
              <span className="material-symbols-outlined text-[18px]">calendar_today</span>
              {RANGE_LABELS[range]}
              <span className="material-symbols-outlined text-[18px]">arrow_drop_down</span>
            </button>
            {rangeOpen && (
              <div className="absolute right-0 top-full mt-2 z-20 w-44 bg-surface-container-high border border-outline-variant rounded-lg shadow-lg overflow-hidden">
                {(Object.keys(RANGE_LABELS) as Range[]).map((option) => (
                  <button
                    key={option}
                    onClick={() => { setRange(option); setRangeOpen(false); }}
                    className={clsx(
                      'w-full text-left px-4 py-2.5 text-sm font-medium transition-colors hover:bg-surface-container-highest',
                      option === range ? 'text-primary bg-primary/10' : 'text-on-surface'
                    )}
                  >
                    {RANGE_LABELS[option]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-gutter">
          {/* Main Content Column */}
          <div className="flex-1 flex flex-col gap-gutter">
            
            {/* ROW 1: Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
              {dynamicMetricCards.map((card) => (
                <div key={card.id} className="bg-surface-container-high rounded-xl p-5 border border-outline-variant shadow-lg relative overflow-hidden group hover:border-primary/50 transition-colors flex flex-col justify-between min-h-[140px]">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110 pointer-events-none z-0"></div>
                  
                  <div className="flex items-center gap-2 mb-2 relative z-10">
                    <p className="font-label-sm text-xs font-bold text-on-surface-variant tracking-wider uppercase">{card.label}</p>
                    {card.hasBlinkingDot && (
                      <span className="w-2 h-2 shrink-0 rounded-full bg-error animate-pulse"></span>
                    )}
                  </div>
                  
                  <div className="flex flex-col relative z-10 flex-1">
                    <div className={clsx("font-headline-lg font-bold text-primary flex items-center gap-2 mb-1", card.isStatus ? "text-base sm:text-lg whitespace-nowrap" : "text-4xl leading-none")}>
                      {card.isStatus && (
                        <span className="w-3 h-3 shrink-0 rounded-full bg-secondary shadow-[0_0_8px_rgba(217,70,239,0.8)] animate-pulse"></span>
                      )}
                      <span className="truncate">{card.value}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-body-sm text-sm text-on-surface-variant/80 truncate">{card.subtext}</p>
                      {card.trend && (
                        <span className="text-secondary font-bold text-xs flex items-center bg-secondary/20 px-2 py-0.5 rounded border border-secondary/30 shrink-0">
                          <span className="material-symbols-outlined text-[14px]">arrow_upward</span> 
                          {card.trend.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {card.action && (
                    <div className="mt-auto pt-3 relative z-10 shrink-0">
                      <button 
                        onClick={() => {
                          if (card.action === 'Cấu hình kịch bản') navigate('/auto-scripts');
                        }}
                        className="w-full py-1.5 bg-primary/10 text-primary border border-primary/30 rounded text-xs font-bold hover:bg-primary/20 transition-colors truncate"
                      >
                        {card.action}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ROW 2: Mini Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
              {miniCharts.map((chart) => (
                <div key={chart.id} className="bg-surface-container rounded-xl p-4 border border-outline-variant shadow flex flex-col h-32 relative overflow-hidden group hover:border-primary/50 transition-colors">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110 pointer-events-none z-0"></div>
                  <div className="z-10 flex flex-col relative">
                    <p className="font-mono text-xs font-bold text-on-surface-variant/80 tracking-wide mb-1">{chart.label}</p>
                    <p className="font-headline-md text-2xl font-bold text-on-surface">{chart.value}</p>
                  </div>
                  {/* Recharts AreaChart at bottom */}
                  <div className="absolute bottom-0 left-0 right-0 h-16 z-0 px-2 pb-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chart.data.map((val, i) => ({ val, i }))} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`colorGrad-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3}/>
                            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="val" stroke="var(--color-primary)" strokeWidth={2} fill={`url(#colorGrad-${chart.id})`} isAnimationActive={false} dot={false} activeDot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>

            {/* ROW 3: Recent Orders Table */}
            <div className="bg-surface-container rounded-xl border border-outline-variant shadow-lg flex flex-col overflow-hidden">
              <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-high/50">
                <h3 className="font-headline-sm text-lg font-bold text-on-surface">Đơn hàng mới nhất</h3>
                <button onClick={() => navigate('/orders')} className="text-primary text-sm font-bold hover:underline flex items-center gap-1">
                  XEM TẤT CẢ <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant text-on-surface-variant font-label-sm text-xs uppercase tracking-wider bg-surface-container-lowest/50">
                      <th className="py-3 px-4 font-medium">KHÁCH HÀNG</th>
                      <th className="py-3 px-4 font-medium">SẢN PHẨM</th>
                      <th className="py-3 px-4 font-medium">GIÁ TRỊ</th>
                      <th className="py-3 px-4 font-medium">NGUỒN</th>
                      <th className="py-3 px-4 font-medium">TRẠNG THÁI</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-md text-sm text-on-surface">
                    {realRecentOrders.length > 0 ? realRecentOrders.map((order: any) => (
                      <tr key={order.id} className="border-b border-outline-variant hover:bg-surface-container-highest transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container font-bold flex items-center justify-center shrink-0">
                              {order.customer_name ? order.customer_name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <span className="font-medium text-on-surface whitespace-nowrap">{order.customer_name || 'Khách vãng lai'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-on-surface whitespace-nowrap">{order.product}</div>
                          <div className="text-xs text-on-surface-variant mt-0.5">SL: {order.quantity}</div>
                        </td>
                        <td className="py-3 px-4 font-medium whitespace-nowrap">{formatCurrency(order.total)}</td>
                        <td className="py-3 px-4">
                          <span className={clsx(
                            'inline-block px-2 py-1 rounded text-xs font-bold border whitespace-nowrap',
                            order.closed_by === 'ai'
                              ? 'bg-primary/20 text-primary border-primary/30'
                              : 'bg-secondary/20 text-secondary border-secondary/30'
                          )}>
                            {order.closed_by === 'ai' ? 'AI chốt' : 'Nhân viên chốt'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={clsx(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap',
                            order.status === 'completed' ? 'bg-secondary/20 text-secondary'
                              : order.status === 'cancelled' ? 'bg-on-surface-variant/20 text-on-surface-variant'
                              : 'bg-error/20 text-error'
                          )}>
                            <span className={clsx(
                              'w-1.5 h-1.5 rounded-full',
                              order.status === 'completed' ? 'bg-secondary'
                                : order.status === 'cancelled' ? 'bg-on-surface-variant'
                                : 'bg-error'
                            )}></span>
                            {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ?? order.status}
                          </span>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-on-surface-variant text-sm">
                          {isLoading ? 'Đang tải dữ liệu...' : 'Chưa có đơn hàng nào'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* Right Column */}
          <div className="w-full xl:w-80 flex flex-col gap-gutter shrink-0">
            
            {/* Block 1: AI Insights */}
            {!insightDismissed && (
            <div className="bg-gradient-to-br from-primary/10 to-surface-container rounded-xl border border-primary/30 p-5 shadow-[0_0_20px_rgba(0,229,255,0.1)] relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/20 rounded-full blur-2xl"></div>
              
              <div className="flex flex-col mb-4 relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>tips_and_updates</span>
                  <h3 className="font-headline-sm text-lg font-bold text-on-surface">Phân tích của Trợ lý AI</h3>
                </div>
                <span className="font-mono text-xs font-bold text-primary tracking-wider uppercase text-left">Phát hiện cơ hội chốt đơn</span>
              </div>
              
              <div className="mb-4 relative z-10">
                <p className="text-xs font-bold text-on-surface-variant mb-1 uppercase">Dữ liệu thô:</p>
                <p className="text-sm text-on-surface/90 leading-relaxed bg-surface-container-highest/50 p-2 rounded border border-outline-variant">{aiInsight.rawData}</p>
              </div>
              
              <div className="mb-5 relative z-10">
                <p className="text-xs font-bold text-on-surface-variant mb-1 uppercase">Khuyến nghị:</p>
                <p className="text-sm text-primary font-medium leading-relaxed bg-primary/5 p-2 rounded border border-primary/20">{aiInsight.recommendation}</p>
              </div>
              
              <div className="flex items-center gap-2 relative z-10">
                <button 
                  onClick={handleApplyRecommendation}
                  disabled={isApplying}
                  className="flex-1 py-2 bg-primary text-on-primary font-bold text-sm rounded shadow-[0_0_10px_rgba(0,229,255,0.3)] hover:brightness-110 transition-all disabled:opacity-70 flex justify-center items-center gap-2"
                >
                  {isApplying ? (
                    <span className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></span>
                  ) : null}
                  {isApplying ? 'Đang áp dụng...' : 'Áp dụng đề xuất'}
                </button>
                <button
                  onClick={() => setInsightDismissed(true)}
                  className="px-4 py-2 bg-transparent border border-outline-variant text-on-surface hover:text-primary hover:border-primary text-sm font-medium rounded transition-colors"
                >
                  Bỏ qua
                </button>
              </div>
            </div>
            )}

            {/* Block 2: Urgent Tasks */}
            <div className="bg-surface-container rounded-xl border border-error/30 p-4 shadow-lg">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-headline-sm text-base font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-error">warning</span>
                  Cần xử lý ngay
                </h3>
                <span className="w-6 h-6 rounded-full bg-error text-on-error flex items-center justify-center text-xs font-bold">{urgentTasks.length}</span>
              </div>
              
              <div className="flex flex-col gap-3">
                {urgentTasks.length > 0 ? urgentTasks.map((task: any, index: number) => {
                  const waitTimeStr = timeAgo(task.last_message_at);

                  return (
                  <div
                    key={task.id ?? index}
                    onClick={() => navigate('/inbox')}
                    className="flex items-center gap-3 p-2 rounded hover:bg-surface-container-highest transition-colors cursor-pointer group"
                  >
                    <div className="w-8 h-8 rounded-full bg-error/20 text-error font-bold flex items-center justify-center shrink-0 border border-error/30">
                      {task.customer_name ? task.customer_name.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <p className="font-medium text-sm text-on-surface truncate">{task.customer_name || 'Khách vãng lai'}</p>
                        <p className="text-xs text-error font-medium">{waitTimeStr}</p>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate">{task.handoff_reason || 'Cần hỗ trợ'}</p>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors text-[16px]">arrow_forward_ios</span>
                  </div>
                )}) : (
                  <p className="text-sm text-on-surface-variant text-center py-4">Chưa có yêu cầu nào cần xử lý ngay.</p>
                )}
              </div>
            </div>

            {/* Block 3: AI Activity Log */}
            <div className="bg-surface-container rounded-xl border border-outline-variant p-4 shadow-lg flex-1">
              <h3 className="font-mono text-xs font-bold text-on-surface-variant tracking-wider uppercase mb-5">Dòng hoạt động AI</h3>
              
              <div className="flex flex-col relative before:content-[''] before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[2px] before:bg-outline-variant">
                {aiActivity.map((log) => (
                  <div key={log.id} className="relative pl-6 mb-4 last:mb-0">
                    <div className={`absolute left-0 top-1.5 w-4 h-4 rounded-full ${log.color} border-4 border-surface-container`}></div>
                    <p className="text-xs text-on-surface-variant font-medium mb-0.5">{log.time}</p>
                    <p className="text-sm text-on-surface leading-snug">{log.content}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}
