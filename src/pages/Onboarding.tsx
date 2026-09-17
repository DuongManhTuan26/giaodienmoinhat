import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import BangLoi from '../components/BangLoi';

/*
 * Trang ba bước đầu tiên sau khi đăng ký.
 *
 * Bản trước chỉ là hình vẽ: nút "Bắt đầu ngay" cộng một biến đếm trong bộ nhớ,
 * bấm ba lần là cả ba bước hiện dấu tích rồi 0,6 giây sau nhảy sang màn hình
 * "Mọi thứ đã sẵn sàng" — trong khi chủ shop chưa kết nối trang nào, chưa nạp
 * tài liệu nào, chưa nối Telegram. Màn hình sau đó còn khẳng định thẳng "Đã
 * kết nối kênh bán hàng", "AI đã được cấu hình và thử nghiệm", "Telegram đã
 * kết nối". Ba câu đều sai.
 *
 * Bản này đọc trạng thái THẬT từ máy chủ, và mỗi bước là một nút dẫn thẳng
 * tới trang làm việc tương ứng.
 */

export interface TrangThaiBaBuoc {
  kenh: boolean;
  taiLieu: boolean;
  telegram: boolean;
}

/** Hỏi máy chủ xem ba bước đã xong bước nào. Bước nào hỏi lỗi thì coi là chưa xong. */
export async function docTrangThaiBaBuoc(): Promise<TrangThaiBaBuoc> {
  const [kenh, taiLieu, telegram] = await Promise.all([
    api.connections.accounts().then((r) => r.data.length > 0).catch(() => false),
    api.ai.config('sales').then((r) => r.data.documents.length > 0).catch(() => false),
    api.settings.telegram().then((r) => r.data.connected).catch(() => false),
  ]);
  return { kenh, taiLieu, telegram };
}

export default function Onboarding({ onComplete, onSkip }: { onComplete: () => void, onSkip: () => void }) {
  const navigate = useNavigate();
  const [trangThai, setTrangThai] = useState<TrangThaiBaBuoc | null>(null);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');

  const tai = useCallback(async () => {
    setDangTai(true);
    setLoi('');
    try {
      setTrangThai(await docTrangThaiBaBuoc());
    } catch (e) {
      setLoi(e instanceof Error ? e.message : 'Không đọc được trạng thái cài đặt');
    } finally {
      setDangTai(false);
    }
  }, []);

  useEffect(() => { void tai(); }, [tai]);

  /*
   * Quay lại tab này thì đọc lại.
   *
   * Chủ shop bấm "Kết nối ngay" là sang trang khác làm việc rồi quay về; nếu
   * không đọc lại thì bước vừa làm xong vẫn hiện là chưa làm.
   */
  useEffect(() => {
    const khiHien = () => { if (document.visibilityState === 'visible') void tai(); };
    document.addEventListener('visibilitychange', khiHien);
    window.addEventListener('focus', khiHien);
    return () => {
      document.removeEventListener('visibilitychange', khiHien);
      window.removeEventListener('focus', khiHien);
    };
  }, [tai]);

  const steps = [
    {
      key: 'kenh' as const,
      title: "Kết nối kênh bán hàng",
      desc: "Để AI đọc được tin nhắn và bình luận của khách",
      duong: '/connections',
      nut: 'Kết nối ngay',
    },
    {
      key: 'taiLieu' as const,
      title: "Dạy AI cách bán hàng",
      desc: "Nhập sản phẩm, giá, và cách bạn muốn AI tư vấn",
      duong: '/auto-scripts',
      nut: 'Nạp tài liệu',
    },
    {
      key: 'telegram' as const,
      title: "Kết nối Telegram",
      desc: "Để nhận thông báo đơn hàng ngay trên điện thoại",
      duong: '/telegram',
      nut: 'Nối Telegram',
    },
  ];

  const xong = trangThai ? steps.filter((s) => trangThai[s.key]).length : 0;
  const duXong = xong === steps.length;
  const buocTiep = steps.find((s) => !trangThai?.[s.key]);

  // Sang trang làm việc: thoát màn hình hướng dẫn rồi mới điều hướng.
  const diToi = (duong: string) => { onSkip(); navigate(duong); };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden p-4">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="glass-card ai-border rounded-xl w-full max-w-[560px] p-lg sm:p-xl relative z-10 shadow-[0_0_30px_rgba(0,229,255,0.05)]">
        <h2 className="font-display-lg text-on-surface text-center mb-2">Chào mừng! Hoàn thành 3 bước để bắt đầu</h2>
        <p className="font-body-lg text-on-surface-variant text-center mb-xl">
          {dangTai
            ? 'Đang xem bạn đã làm tới đâu…'
            : duXong
              ? 'Xong cả ba bước. AI sẵn sàng làm việc cho bạn.'
              : `Đã xong ${xong}/3. Làm nốt bước còn lại rồi AI bắt đầu làm việc cho bạn.`}
        </p>

        <BangLoi noiDung={loi} onDong={() => setLoi('')} />

        <div className="flex flex-col gap-4 mb-xl">
          {steps.map((step) => {
            const isCompleted = Boolean(trangThai?.[step.key]);

            return (
              <div
                key={step.key}
                className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-lg border transition-all duration-300 ${isCompleted ? 'bg-surface-container-high border-[#10b981]/30' : 'bg-surface-container border-outline-variant'}`}
              >
                {/* Number / Status Icon */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-label-sm font-bold transition-colors ${isCompleted ? 'bg-[#10b981] text-background' : 'bg-primary text-on-primary'}`}>
                  {isCompleted ? <span className="material-symbols-outlined text-[18px]">check</span> : steps.indexOf(step) + 1}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`font-body-lg font-bold transition-colors ${isCompleted ? 'text-on-surface' : 'text-primary'}`}>{step.title}</p>
                  <p className="font-body-md text-on-surface-variant text-sm mt-0.5">{step.desc}</p>
                </div>

                {/* Right Status */}
                <div className="flex items-center shrink-0">
                  {isCompleted ? (
                    <span className="flex items-center gap-1.5 text-sm font-bold text-[#10b981]">
                      <span className="material-symbols-outlined text-[20px]">check_circle</span>
                      Đã xong
                    </span>
                  ) : (
                    <button
                      onClick={() => diToi(step.duong)}
                      disabled={dangTai}
                      className="px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-label-sm rounded-lg transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {step.nut}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-8">
          <button
            onClick={onSkip}
            className="font-body-md text-on-surface-variant hover:text-on-surface transition-colors bg-transparent border-none p-0 cursor-pointer text-left"
          >
            Để sau, tôi muốn xem trước
          </button>
          <button
            onClick={() => (duXong ? onComplete() : buocTiep && diToi(buocTiep.duong))}
            disabled={dangTai}
            className="px-lg py-3 bg-gradient-to-r from-primary to-primary-container text-on-primary font-label-sm rounded-lg shadow-[0_0_15px_rgba(0,229,255,0.4)] hover:shadow-[0_0_25px_rgba(0,229,255,0.6)] hover:brightness-110 transition-all font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {duXong ? 'Xem lại và vào bảng điều khiển' : buocTiep ? `Làm bước: ${buocTiep.title}` : 'Bắt đầu ngay'}
          </button>
        </div>
      </div>
    </div>
  );
}
