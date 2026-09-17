import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { PRICING_PLANS, PLATFORM_RULES, goiHienTai, type PricingPlan } from '../lib/pricing';

/** Mã lý do chặn của hàng rào -> câu chủ shop hiểu được. */
const LY_DO_CHAN: Record<string, string> = {
  ai_outside_24h: 'Quá 24 giờ kể từ tin cuối của khách — chỉ nhân viên được trả lời',
  window_expired_7d: 'Quá 7 ngày — nền tảng không cho gửi nữa, kể cả nhân viên',
  ai_paused: 'AI đang bị tạm dừng để bảo vệ tài khoản',
  rate_limited: 'Chạm hạn mức tốc độ gửi của nền tảng',
  ai_hourly_limit: 'Chạm giới hạn số tin AI gửi mỗi giờ do chủ shop đặt',
  no_account: 'Hội thoại chưa gắn với kênh nào',
  conversation_not_found: 'Không tìm thấy hội thoại',
};

/**
 * Kênh hỗ trợ của mình. Dùng chung một nguồn với nút Trợ giúp ở thanh bên, để
 * đổi một chỗ là đổi cả hệ thống.
 */
const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL || '/pricing';
const IS_EXTERNAL_SUPPORT = /^https?:|^mailto:/.test(SUPPORT_URL);

export default function Pricing() {
  const navigate = useNavigate();

  const [plan, setPlan] = useState('trial');
  const [usage, setUsage] = useState({
    connected_accounts: 0, ai_messages_month: 0, tokens_month: 0,
    orders_month: 0, posts_month: 0,
  });
  const [guardrails, setGuardrails] = useState<Awaited<
    ReturnType<typeof api.settings.guardrails>
  >['data'] | null>(null);
  const [dangMo, setDangMo] = useState<string | null>(null);
  const [dangLuuHangRao, setDangLuuHangRao] = useState(false);

  /** Siết chặt hàng rào. Máy chủ kẹp lại theo trần chính sách nên không nới được. */
  const luuHangRao = async (payload: Parameters<typeof api.settings.saveGuardrails>[0]) => {
    setDangLuuHangRao(true);
    try {
      await api.settings.saveGuardrails(payload);
      const { data } = await api.settings.guardrails();
      setGuardrails(data);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không lưu được cài đặt');
    } finally {
      setDangLuuHangRao(false);
    }
  };

  /** Bật lại AI cho một kênh đang bị hệ thống tự tạm dừng. */
  const moLaiAi = async (accountId: string) => {
    setDangMo(accountId);
    try {
      await api.settings.resumeAi(accountId);
      const { data } = await api.settings.guardrails();
      setGuardrails(data);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không bật lại được AI');
    } finally {
      setDangMo(null);
    }
  };

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
    api.settings.guardrails()
      .then(({ data }) => setGuardrails(data))
      .catch(() => { /* không chặn màn hình nếu phần này lỗi */ });

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

  /*
   * Gói đang dùng lấy đúng theo mã gói trong database. Không được mượn tạm gói
   * đầu danh sách: shop đang dùng thử từng bị ghi là đang dùng gói Khởi đầu
   * 390.000 đ/tháng.
   */
  const currentPlan = goiHienTai(plan);
  const maxChannels = currentPlan.maxChannels;
  const usedChannels = usage.connected_accounts;
  const coHanMuc = maxChannels > 0;
  const channelPercent = coHanMuc
    ? Math.min(100, Math.round((usedChannels / maxChannels) * 100))
    : 0;

  /* Số lượt còn lại phải tính ra, trước đây là chữ cứng "Còn 1 lượt kết nối". */
  const conLaiKenh = maxChannels - usedChannels;
  const chuThichKenh = !coHanMuc
    ? 'Chưa đặt hạn mức trong thời gian dùng thử'
    : conLaiKenh > 0
      ? `Còn ${conLaiKenh} lượt kết nối`
      : conLaiKenh === 0
        ? 'Đã dùng hết số kênh của gói'
        : `Đang vượt ${-conLaiKenh} kênh so với gói`;

  const safetyStatus = safety?.status ?? 'safe';
  const facebookRules = PLATFORM_RULES;

  /**
   * Nâng cấp gói và xem hoá đơn đều cần cổng thanh toán, chưa nối vào hệ thống.
   * Báo rõ thay vì để nút bấm không phản ứng gì.
   */
  const handleUpgrade = (planId?: string) => {
    setErrorMessage(
      planId && planId !== plan
        ? `Đổi sang gói "${plans.find((p) => p.id === planId)?.name}" cần cổng thanh toán, phần này chưa được nối. Vui lòng liên hệ để được đổi gói thủ công.`
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
              {coHanMuc && (
                <>
                  <span className="font-display-lg text-on-surface-variant">/</span>
                  <span className="font-display-lg text-on-surface-variant">{maxChannels}</span>
                </>
              )}
            </div>
            {coHanMuc && (
              <div className="w-full h-2 bg-surface-container rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-primary shadow-[0_0_10px_rgba(0,229,255,0.8)]" style={{ width: `${channelPercent}%` }}></div>
              </div>
            )}
            <p className="font-body-md text-on-surface-variant mt-2">{chuThichKenh}</p>
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

        {/*
          HÀNG 2B — mức dùng thật trong tháng.

          Máy chủ vẫn luôn tính mấy con số này nhưng trước đây không hiển thị ở
          đâu cả. Đặt ngay dưới câu "không giới hạn" để chủ shop thấy bằng số
          thật là dùng bao nhiêu cũng không phát sinh thêm tiền.
        */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-md mb-lg">
          {[
            { nhan: 'TIN AI ĐÃ TRẢ LỜI', so: usage.ai_messages_month },
            { nhan: 'ĐƠN CHỐT ĐƯỢC', so: usage.orders_month },
            { nhan: 'BÀI ĐÃ ĐĂNG', so: usage.posts_month },
          ].map((o) => (
            <div key={o.nhan} className="glass-card rounded-xl p-md">
              <span className="font-label-sm text-on-surface-variant tracking-widest uppercase">{o.nhan}</span>
              <p className="font-display-lg text-on-surface mt-1">{o.so.toLocaleString('vi-VN')}</p>
              <p className="font-body-md text-on-surface-variant">trong tháng này, không tính thêm tiền</p>
            </div>
          ))}
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
        <p className="text-center font-body-md text-on-surface-variant mb-xl">Cần nhiều hơn 10 kênh? <a href={SUPPORT_URL} {...(IS_EXTERNAL_SUPPORT ? { target: '_blank', rel: 'noreferrer' } : {})} className="text-primary hover:underline">Liên hệ để có báo giá riêng.</a></p>

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

          {/*
            KÊNH ĐANG BỊ TẠM DỪNG.

            Trước đây hệ thống tự tắt AI khi tỷ lệ bị chặn cao — đúng, nhưng
            giao diện KHÔNG hề hiện kênh nào bị tắt, và cũng không có nút bật
            lại. Chủ shop chỉ thấy một dòng "AI đã tự tạm dừng" rồi bó tay.
          */}
          {guardrails && guardrails.pausedAccounts.length > 0 && (
            <div className="mb-md space-y-2">
              {guardrails.pausedAccounts.map((kenh) => (
                <div key={kenh.id} className="bg-[#450a0a]/60 border border-[#ef4444]/40 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <span className="material-symbols-outlined text-[#ef4444] text-[22px] shrink-0">pause_circle</span>
                  <div className="flex-1">
                    <p className="font-body-md text-on-surface font-bold">{kenh.display_name}</p>
                    <p className="text-sm text-on-surface-variant mt-0.5">{kenh.ai_pause_reason}</p>
                    <p className="text-xs text-on-surface-variant/70 mt-1">
                      Tự mở lại lúc {new Date(kenh.ai_paused_until).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <button
                    onClick={() => moLaiAi(kenh.id)}
                    disabled={dangMo === kenh.id}
                    className="shrink-0 px-4 py-2 bg-primary text-on-primary font-bold text-sm rounded-lg hover:brightness-110 transition-all disabled:opacity-60"
                  >
                    {dangMo === kenh.id ? 'Đang mở…' : 'Bật lại AI ngay'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Vì sao tin bị chặn — để chủ shop biết đường xử lý, không đoán mò. */}
          {guardrails && guardrails.blockedReasons.length > 0 && (
            <div className="mb-md bg-surface-container-high rounded-xl border border-outline-variant p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-body-md font-bold text-on-surface">Tin bị chặn trong 7 ngày qua</h4>
                <span className="font-label-sm text-on-surface-variant">
                  {guardrails.usage.blockedLastDay} tin trong 24 giờ
                </span>
              </div>
              <div className="space-y-2">
                {guardrails.blockedReasons.map((r) => (
                  <div key={r.block_reason} className="flex items-start justify-between gap-4 text-sm">
                    <span className="text-on-surface-variant leading-relaxed">
                      {LY_DO_CHAN[r.block_reason] ?? r.block_reason}
                    </span>
                    <span className="font-bold text-on-surface shrink-0">{r.n}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-on-surface-variant/70 mt-3 pt-3 border-t border-outline-variant/50">
                Bị chặn là hệ thống đang bảo vệ Trang của bạn khỏi vi phạm chính sách,
                không phải lỗi. Hạn mức đang áp dụng: {guardrails.rateLimit.perMinute} tin/phút
                {guardrails.rateLimit.source === 'live' ? ' (đọc trực tiếp từ nền tảng)' : ''}.
              </p>
            </div>
          )}

          {/* Giới hạn đang áp dụng — sửa được phần tuỳ chọn, không sửa được trần chính sách */}
          {guardrails && (
            <div className="mb-md bg-surface-container-high rounded-xl border border-outline-variant p-4">
              <h4 className="font-body-md font-bold text-on-surface mb-1">Giới hạn đang áp dụng</h4>
              <p className="text-xs text-on-surface-variant/70 mb-4 leading-relaxed">
                Trần tốc độ là quy định của nền tảng, hệ thống không cho vượt. Bạn chỉ
                có thể đặt chặt hơn nếu muốn thận trọng.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-surface-container rounded-lg border border-outline-variant p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-on-surface">Trần của nền tảng</span>
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant" title="Không sửa được">lock</span>
                  </div>
                  <p className="font-headline-sm text-xl font-bold text-primary">
                    {guardrails.rateLimit.perMinute} tin/phút
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {guardrails.rateLimit.source === 'live'
                      ? 'Đọc trực tiếp từ nền tảng'
                      : 'Theo bậc tài khoản hiện tại'}
                  </p>
                </div>

                <div className="bg-surface-container rounded-lg border border-outline-variant p-3">
                  <label className="text-sm font-bold text-on-surface block mb-1">
                    Giới hạn tin AI mỗi giờ
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={0}
                      defaultValue={Number(guardrails.config.max_ai_sends_per_hour ?? 0)}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== Number(guardrails.config.max_ai_sends_per_hour ?? 0)) {
                          luuHangRao({ maxAiSendsPerHour: v });
                        }
                      }}
                      disabled={dangLuuHangRao}
                      className="w-24 bg-surface-container-high border border-outline-variant rounded-lg px-2 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-none disabled:opacity-60"
                    />
                    <span className="text-xs text-on-surface-variant">0 = không giới hạn</span>
                  </div>
                  <p className="text-xs text-on-surface-variant/70 mt-2 leading-relaxed">
                    Đây KHÔNG phải quy định nền tảng, chỉ là chốt an toàn của riêng bạn
                    để AI không phát tán hàng loạt khi có sự cố.
                  </p>
                </div>
              </div>
            </div>
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
            <p className="font-body-md text-on-surface-variant">Những giới hạn này do Facebook đặt ra, không phải do phần mềm. Chúng tôi áp dụng cố định để bảo vệ tài khoản của bạn.</p>
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
