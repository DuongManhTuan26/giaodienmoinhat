import React from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { clsx } from 'clsx';
import { 
  metricCards, 
  miniCharts, 
  recentOrders, 
  aiInsights, 
  actionRequired, 
  aiActivity 
} from '../data/mockApi';

export default function Dashboard() {
  return (
    <main className="flex-1 w-full relative     bg-background text-on-surface">
      <div className="pt-8 pb-8 px-margin max-w-[1600px] mx-auto w-full">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-lg">
          <div>
            <h2 className="text-on-surface-variant font-body-lg">Tổng quan hoạt động tự động hôm nay</h2>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-surface-container rounded-lg border border-outline-variant hover:border-primary transition-colors text-sm font-medium">
              <span className="material-symbols-outlined text-[18px]">calendar_today</span>
              Hôm nay
              <span className="material-symbols-outlined text-[18px]">arrow_drop_down</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-gutter">
          {/* Main Content Column */}
          <div className="flex-1 flex flex-col gap-gutter">
            
            {/* ROW 1: Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
              {metricCards.map((card) => (
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
                      <button className="w-full py-1.5 bg-primary/10 text-primary border border-primary/30 rounded text-xs font-bold hover:bg-primary/20 transition-colors truncate">
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
                <a href="/orders" className="text-primary text-sm font-bold hover:underline flex items-center gap-1">
                  XEM TẤT CẢ <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </a>
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
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="border-b border-outline-variant hover:bg-surface-container-highest transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container font-bold flex items-center justify-center shrink-0">
                              {order.customerInitial}
                            </div>
                            <span className="font-medium text-on-surface whitespace-nowrap">{order.customerName}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-on-surface whitespace-nowrap">{order.productName}</div>
                          <div className="text-xs text-on-surface-variant mt-0.5">{order.productDesc}</div>
                        </td>
                        <td className="py-3 px-4 font-medium whitespace-nowrap">{order.price}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-bold border ${order.source === 'AI chốt' ? 'bg-primary/20 text-primary border-primary/30' : 'bg-tertiary/20 text-tertiary border-tertiary/30'} whitespace-nowrap`}>
                            {order.source}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${order.statusColor} whitespace-nowrap`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${order.dotColor}`}></span>
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* Right Column */}
          <div className="w-full xl:w-80 flex flex-col gap-gutter shrink-0">
            
            {/* Block 1: AI Insights */}
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
                <p className="text-sm text-on-surface/90 leading-relaxed bg-surface-container-highest/50 p-2 rounded border border-outline-variant">{aiInsights.raw}</p>
              </div>
              
              <div className="mb-5 relative z-10">
                <p className="text-xs font-bold text-on-surface-variant mb-1 uppercase">Khuyến nghị:</p>
                <p className="text-sm text-primary font-medium leading-relaxed bg-primary/5 p-2 rounded border border-primary/20">{aiInsights.recommendation}</p>
              </div>
              
              <div className="flex items-center gap-2 relative z-10">
                <button className="flex-1 py-2 bg-primary text-on-primary font-bold text-sm rounded shadow-[0_0_10px_rgba(0,229,255,0.3)] hover:brightness-110 transition-all">
                  Áp dụng đề xuất
                </button>
                <button className="px-4 py-2 bg-transparent border border-outline-variant text-on-surface hover:text-primary hover:border-primary text-sm font-medium rounded transition-colors">
                  Bỏ qua
                </button>
              </div>
            </div>

            {/* Block 2: Urgent Tasks */}
            <div className="bg-surface-container rounded-xl border border-error/30 p-4 shadow-lg">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-headline-sm text-base font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-error">warning</span>
                  Cần xử lý ngay
                </h3>
                <span className="w-6 h-6 rounded-full bg-error text-on-error flex items-center justify-center text-xs font-bold">{actionRequired.length}</span>
              </div>
              
              <div className="flex flex-col gap-3">
                {actionRequired.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 p-2 rounded hover:bg-surface-container-highest transition-colors cursor-pointer group">
                    <div className="w-8 h-8 rounded-full bg-error/20 text-error font-bold flex items-center justify-center shrink-0 border border-error/30">
                      {task.initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <p className="font-medium text-sm text-on-surface truncate">{task.name}</p>
                        <p className="text-xs text-error font-medium">{task.waitTime}</p>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate">{task.reason}</p>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors text-[16px]">arrow_forward_ios</span>
                  </div>
                ))}
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
