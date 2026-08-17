import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { PRICING_PLANS, PLATFORM_RULES, type PricingPlan } from '../lib/pricing';

export default function Pricing() {
  const navigate = useNavigate();

  const [plan, setPlan] = useState('trial');
  const [usage, setUsage] = useState({
    connected_accounts: 0, ai_messages_month: 0, tokens_month: 0,
    orders_month: 0, posts_month: 0,
  });
  const [safety, setSafety] = useState<{
    status: 'safe' | 'warning' | 'danger';
    sendRatePerMinute: number;
    sendRateLimit: number;
    messagesSent30d: number;
    messagesFailed30d: number;
    failRate: number;
    handoffRate: number;
    avgAiResponseSeconds: number | null;
    blockRateNote: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    Promise.all([api.settings.usage(), api.settings.safety()])
      .then(([u, s]) => {
        setPlan(u.data.plan);
        setUsage(u.data.usage);
        setSafety(s.data);
      })
      .catch((error) => {
        setErrorMessage(error instanceof ApiError ? error.message : 'Không tải được thông tin gói');
      });
  }, []);

  /** Gói đang dùng, đối chiếu với gói lưu trong database. */
  const plans: PricingPlan[] = PRICING_PLANS.map((p) => ({
    ...p,
    isCurrent: p.id === plan,
    buttonText: p.id === plan ? 'Gói hiện tại' : p.buttonText,
  }));

  const currentPlan = plans.find((p) => p.isCurrent) ?? plans[0];
  const maxChannels = currentPlan.maxChannels;
  const usedChannels = usage.connected_accounts;
  const channelPercent = maxChannels > 0
    ? Math.min(100, Math.round((usedChannels / maxChannels) * 100))
    : 0;

  const safetyStatus = safety?.status ?? 'safe';
  const facebookRules = PLATFORM_RULES;

  /**
   * Nâng cấp gói và xem hoá đơn đều cần cổng thanh toán, chưa nối vào hệ thống.
   * Báo rõ thay vì để nút bấm không phản ứng gì.
   */
  const handleUpgrade = (planId?: string) => {
    setErrorMessage(
      planId && planId !== plan
        ? `Đổi sang gói "${plans.find((p) => p.id === planId)?.name}" cần cổng thanh toán, phần này chưa được nối. Hãy liên hệ để được đổi gói thủ công.`
        : 'Cổng thanh toán chưa được nối vào hệ thống.'
    );
  };

  return (
    <div className="flex-1   p-gutter  bg-background relative">
      {errorMessage && (
        <div className="mb-md text-sm text-error bg-error/10 border border-error/30 rounded-xl px-4 py-3 max-w-5xl mx-auto">
          {errorMessage}
        </div>
      )}

      {/* Header */}
      <div className="mb-lg">
        <span className="font-mono text-xs font-bold tracking-wider text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full uppercase mb-3 inline-block">{currentPlan.name.toUpperCase()}</span>
        <p className="font-body-lg text-on-surface-variant max-w-2xl mt-1">Quản lý gói dịch vụ và theo dõi an toàn tài khoản</p>
      </div>

      <div className="max-w-5xl mx-auto pb-xl">
        {/* HÀNG 1 — thẻ ngang rộng hết chiều ngang, viền phát sáng */}
        <div className="glass-card ai-border rounded-xl p-md grid grid-cols-1 md:grid-cols-10 gap-md items-start mb-md shadow-[0_0_20px_rgba(0,229,255,0.1)]">
          {/* Left */}
          <div className="flex flex-col md:col-span-4">
            <span className="font-label-sm text-primary tracking-widest uppercase mb-1">GÓI ĐANG DÙNG</span>
            <h3 className="font-display-lg text-on-surface">{currentPlan.name}</h3>
            <p className="font-body-lg text-primary font-bold">{currentPlan.price.replace('/tháng', ' mỗi tháng')}</p>
            <p className="font-body-md text-on-surface-variant mt-2">{plan === 'trial' ? 'Đang dùng thử' : 'Gia hạn tự động hằng tháng'}</p>
          </div>
          {/* Middle */}
          <div className="flex flex-col min-w-[220px] md:col-span-3">
            <span className="font-label-sm text-on-surface-variant tracking-widest uppercase mb-2 whitespace-nowrap">SỐ KÊNH ĐÃ KẾT NỐI</span>
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="font-display-lg text-primary">{usedChannels}</span>
              <span className="font-display-lg text-on-surface-variant">/</span>
              <span className="font-display-lg text-on-surface-variant">{maxChannels}</span>
            </div>
            <div className="w-full h-2 bg-surface-container rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-primary shadow-[0_0_10px_rgba(0,229,255,0.8)]" style={{ width: `${channelPercent}%` }}></div>
            </div>
            <p className="font-body-md text-on-surface-variant mt-2 whitespace-nowrap">Còn 1 lượt kết nối</p>
          </div>
          {/* Right */}
          <div className="flex flex-col gap-sm md:col-span-3 w-full">
            <button className="w-full py-3 bg-gradient-to-r from-primary to-primary-container text-on-primary font-label-sm rounded-lg shadow-[0_0_15px_rgba(0,229,255,0.4)] hover:shadow-[0_0_25px_rgba(0,229,255,0.6)] hover:brightness-110 transition-all font-bold" onClick={() => handleUpgrade()}>Nâng cấp gói</button>
            <button className="w-full py-3 bg-surface-container text-on-surface font-label-sm rounded-lg border border-outline hover:border-primary transition-colors font-bold" onClick={() => handleUpgrade()}>Xem hóa đơn</button>
          </div>
        </div>

        {/* HÀNG 2 — dải giải thích cách tính tiền, nền sáng hơn nền chung, có biểu tượng thông tin */}
        <div className="bg-surface-container-high rounded-xl p-4 flex items-start gap-3 mb-lg">
          <span className="material-symbols-outlined text-primary mt-0.5">info</span>
          <div>
            <p className="font-body-md text-on-surface font-bold">Bạn chỉ trả tiền theo số kênh kết nối</p>
            <p className="font-body-md text-on-surface-variant">Tin nhắn, bình luận và bài đăng không giới hạn. Một bài viral thu về nghìn bình luận cũng không tốn thêm đồng nào.</p>
          </div>
        </div>

        {/* HÀNG 3 — ba thẻ gói nằm ngang, thẻ giữa có viền sáng nổi bật và nhãn góc "ĐANG DÙNG" */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-md mb-md">
          {plans.map((plan, idx) => (
            <div 
              key={plan.id} 
              className={`rounded-xl p-md flex flex-col relative overflow-hidden border ${
                plan.isCurrent 
                  ? 'border-primary shadow-[0_0_20px_rgba(0,229,255,0.15)] bg-surface-container/50 z-10' 
                  : 'bg-surface-container border-outline-variant transition-transform hover:-translate-y-1 duration-300'
              }`}
            >
              {plan.isCurrent && (
                <div className="absolute top-0 right-0 bg-primary text-on-primary font-label-sm text-[10px] px-3 py-1 rounded-bl-lg font-bold">ĐANG DÙNG</div>
              )}
              <h4 className="font-headline-lg text-on-surface">{plan.name}</h4>
              <p className="font-body-lg text-primary font-bold mt-1">{plan.price}</p>
              <div className="flex flex-col gap-3 mt-md mb-lg flex-1">
                {plan.features.map((feature, fidx) => (
                  <div key={fidx} className={`flex items-start gap-2 ${!feature.included ? 'opacity-40' : ''}`}>
                    <span className={`material-symbols-outlined ${feature.included ? 'text-primary' : 'text-on-surface-variant'} text-[20px]`}>
                      {feature.included ? 'check' : 'close'}
                    </span>
                    <span className={`font-body-md ${feature.included ? 'text-on-surface' : 'text-on-surface-variant line-through'}`}>
                      {feature.name}
                    </span>
                  </div>
                ))}
              </div>
              <button 
                className={`w-full py-3 font-label-sm rounded-lg font-bold mt-auto transition-all ${
                  plan.isCurrent 
                    ? 'bg-surface-container-highest text-on-surface-variant cursor-not-allowed border border-outline-variant'
                    : plan.id === 'enterprise'
                      ? 'bg-gradient-to-r from-primary to-primary-container text-on-primary shadow-[0_0_15px_rgba(0,229,255,0.4)] hover:shadow-[0_0_25px_rgba(0,229,255,0.6)] hover:brightness-110'
                      : 'bg-surface-container-high text-on-surface border border-outline hover:border-primary'
                }`}
                disabled={plan.isCurrent}
                onClick={() => handleUpgrade(plan.id)}
              >
                {plan.buttonText}
              </button>
            </div>
          ))}
        </div>
        <p className="text-center font-body-md text-on-surface-variant mb-xl">Cần nhiều hơn 10 kênh? <a href="#" className="text-primary hover:underline">Liên hệ để có báo giá riêng.</a></p>

        {/* HÀNG 4 — thẻ lớn "An toàn tài khoản" */}
        <div className="bg-surface-container rounded-xl border border-outline-variant p-md mb-lg">
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-md justify-between">
            <h3 className="font-headline-lg text-on-surface">An toàn tài khoản</h3>
            <span className="bg-surface-container-high px-3 py-1.5 rounded-md font-label-sm text-primary tracking-widest uppercase border border-outline-variant">KIỂM TRA TỰ ĐỘNG HÀNG NGÀY</span>
          </div>

          {/* Status Banners (Showing all 3 for demo as requested) */}
          <div className="flex flex-col gap-3 mb-md">
            {safetyStatus === 'safe' && (
              <div className="bg-[#022c22] border border-[#10b981] rounded-lg p-4 flex items-start md:items-center gap-3">
                <span className="material-symbols-outlined text-[#10b981] text-[24px]">gpp_good</span>
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 flex-1">
                  <p className="font-body-md text-[#10b981] font-bold">Tài khoản của bạn đang an toàn</p>
                  <span className="hidden md:inline text-[#10b981]/50">•</span>
                  <p className="font-body-md text-[#10b981]/80">Không phát hiện rủi ro nào trong 30 ngày qua</p>
                </div>
              </div>
            )}

            {safetyStatus === 'warning' && (
              <div className="bg-[#422006] border border-[#f59e0b] rounded-lg p-4 flex items-start md:items-center gap-3">
                <span className="material-symbols-outlined text-[#f59e0b] text-[24px]">warning</span>
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 flex-1">
                  <p className="font-body-md text-[#f59e0b] font-bold">Cần chú ý — tỷ lệ khách chặn đang tăng</p>
                </div>
              </div>
            )}
            {safetyStatus === 'danger' && (
              <div className="bg-[#450a0a] border border-[#ef4444] rounded-lg p-4 flex items-start md:items-center gap-3">
                <span className="material-symbols-outlined text-[#ef4444] text-[24px]">gpp_bad</span>
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 flex-1">
                  <p className="font-body-md text-[#ef4444] font-bold">AI đã tự tạm dừng để bảo vệ tài khoản của bạn</p>
                </div>
              </div>
            )}
          </div>

          {safety?.blockRateNote && (
            <p className="text-xs text-on-surface-variant/70 mb-4 flex items-start gap-1.5">
              <span className="material-symbols-outlined text-[14px] mt-0.5">info</span>
              <span>{safety.blockRateNote}</span>
            </p>
          )}

          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Tỷ lệ khách chặn */}
            <div className="bg-surface-container-high rounded-xl border border-outline-variant p-4 flex items-center gap-4">
               <div className="relative w-[80px] h-[80px] flex items-center justify-center shrink-0">
                  <svg className="w-[80px] h-[80px] transform -rotate-90">
                    <circle cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-surface-container-highest" />
                    <circle cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray="213.6" strokeDashoffset={213.6 * (1 - (safety ? Math.min(1, safety.handoffRate / 100) : 0))} className="text-[#10b981]" strokeLinecap="round" />
                  </svg>
                  <span className="absolute font-label-sm text-on-surface font-bold text-[13px] whitespace-nowrap">{safety ? `${safety.handoffRate}%` : '—'}</span>
               </div>
               <div>
                 <p className="font-body-md text-on-surface font-bold">Tỷ lệ nhường quyền</p>
                 <p className="font-body-md text-on-surface-variant text-sm mt-0.5">Phần hội thoại AI phải chuyển cho người</p>
               </div>
            </div>

            {/* Tốc độ gửi tin */}
            <div className="bg-surface-container-high rounded-xl border border-outline-variant p-4 flex items-center gap-4">
               <div className="relative w-[80px] h-[80px] flex items-center justify-center shrink-0">
                  <svg className="w-[80px] h-[80px] transform -rotate-90">
                    <circle cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-surface-container-highest" />
                    <circle cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray="213.6" strokeDashoffset={213.6 * (1 - (safety ? Math.min(1, safety.sendRatePerMinute / safety.sendRateLimit) : 0))} className="text-[#f59e0b]" strokeLinecap="round" />
                  </svg>
                  <span className="absolute font-label-sm text-on-surface font-bold text-[13px] whitespace-nowrap">{safety ? `${safety.sendRatePerMinute}/phút` : '—'}</span>
               </div>
               <div>
                 <p className="font-body-md text-on-surface font-bold">Tốc độ gửi tin</p>
                 <p className="font-body-md text-on-surface-variant text-sm mt-0.5">Giới hạn {safety?.sendRateLimit ?? 20} tin mỗi phút</p>
               </div>
            </div>

            {/* Tin bị từ chối */}
            <div className="bg-surface-container-high rounded-xl border border-outline-variant p-4 flex items-center gap-4">
               <div className="relative w-[80px] h-[80px] flex items-center justify-center shrink-0">
                  <svg className="w-[80px] h-[80px] transform -rotate-90">
                    <circle cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-surface-container-highest" />
                    <circle cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray="213.6" strokeDashoffset={213.6 * (1 - (safety ? Math.min(1, safety.failRate / 10) : 0))} className={safety && safety.failRate >= 3 ? "text-[#f59e0b]" : "text-[#10b981]"} strokeLinecap="round" />
                  </svg>
                  <span className="absolute font-label-sm text-on-surface font-bold text-[13px] whitespace-nowrap">{safety ? `${safety.messagesFailed30d} tin` : '—'}</span>
               </div>
               <div>
                 <p className="font-body-md text-on-surface font-bold">Tin bị từ chối</p>
                 <p className="font-body-md text-on-surface-variant text-sm mt-0.5">
                   {safety ? `${safety.failRate}% trong 30 ngày qua` : 'Trong 30 ngày qua'}
                 </p>
               </div>
            </div>
          </div>

        </div>

        {/* HÀNG 5 — thẻ "Quy định bắt buộc của Facebook" */}
        <div className="bg-surface-container rounded-xl border border-outline-variant p-md mb-xl">
          <div className="mb-md">
            <h3 className="font-headline-lg text-on-surface mb-2">Quy định bắt buộc của Facebook</h3>
            <p className="font-body-md text-on-surface-variant">Những giới hạn này do Facebook đặt ra, không phải do phần mềm. Chúng tôi khóa cứng để bảo vệ tài khoản của bạn.</p>
          </div>

          <div className="flex flex-col gap-4">
            {facebookRules.map((rule, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 rounded-lg hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-[#f97316] mt-0.5 text-[24px]">lock</span>
                <div>
                  <p className="font-body-md text-on-surface font-bold">{idx + 1}. {rule.title}</p>
                  <p className="font-body-md text-on-surface-variant mt-1">{rule.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
