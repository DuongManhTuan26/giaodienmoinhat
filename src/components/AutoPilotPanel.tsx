import React, { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { api, ApiError, type AutoPilotConfig, type AutoPilotRun } from '../lib/api';
import ChonKenhDang from './ChonKenhDang';
import { useActivePage } from '../lib/ActivePage';
import { gioiHanChatNhat, kenhMacDinh, tinhKenhSeDang, type CheDoKenh } from '../lib/gioi-han-kenh';

/**
 * Bảng cài đặt lịch AI tự viết và tự đăng bài.
 *
 * Mọi con số ở đây do chủ shop điền, không có mặc định nào được bật sẵn thay
 * họ: đây là con bot đăng lên Fanpage thật, nên chọn tần suất và chốt chặn
 * phải là quyết định có ý thức của người chủ.
 */

const THU = [
  { so: 1, ten: 'T2' },
  { so: 2, ten: 'T3' },
  { so: 3, ten: 'T4' },
  { so: 4, ten: 'T5' },
  { so: 5, ten: 'T6' },
  { so: 6, ten: 'T7' },
  { so: 0, ten: 'CN' },
];

const MUC_TIEU = [
  { id: 'sales', ten: 'Bán hàng', mo: 'Nêu lợi ích, kêu gọi mua' },
  { id: 'engagement', ten: 'Tương tác', mo: 'Đặt câu hỏi, gợi bình luận' },
  { id: 'announcement', ten: 'Thông báo', mo: 'Ngắn gọn, rõ ràng' },
];

const CHOT_CHAN: Array<{ id: AutoPilotConfig['guard']; ten: string; mo: string }> = [
  {
    id: 'approve',
    ten: 'Chờ tôi duyệt',
    mo: 'AI viết sẵn rồi xếp vào mục Chờ duyệt. Không có gì lên Fanpage tới khi bạn bấm đăng.',
  },
  {
    id: 'notify',
    ten: 'Báo trước rồi tự đăng',
    mo: 'AI nhắn Telegram kèm nguyên văn bài. Bạn không làm gì thì tới giờ nó tự đăng.',
  },
  {
    id: 'publish',
    ten: 'Đăng thẳng',
    mo: 'Lên Fanpage ngay, không hỏi ai. Nhanh nhất, nhưng bài dở lên rồi bạn mới biết.',
  },
];

const TRANG_THAI: Record<string, { chu: string; mau: string }> = {
  ok: { chu: 'Xong', mau: 'text-green-500 bg-green-500/15 border-green-500/30' },
  failed: { chu: 'Lỗi', mau: 'text-error bg-error/15 border-error/30' },
  skipped: { chu: 'Bỏ lượt', mau: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30' },
  running: { chu: 'Đang chạy', mau: 'text-primary bg-primary/15 border-primary/30' },
};

interface AutoPilotPanelProps {
  /** Gọi sau khi lưu, để màn hình cha nạp lại danh sách bài. */
  onSaved?: () => void;
}

export default function AutoPilotPanel({ onSaved }: AutoPilotPanelProps) {
  const [cau, setCau] = useState<AutoPilotConfig | null>(null);
  const [runs, setRuns] = useState<AutoPilotRun[]>([]);
  const [chuDeText, setChuDeText] = useState('');
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState('');
  const [daLuu, setDaLuu] = useState(false);
  const [moRong, setMoRong] = useState(false);

  /*
   * Chọn kênh cho lịch AI tự đăng — dùng CHUNG bộ chọn với hộp soạn bài tay.
   *
   * Trước đây panel này không cho chọn kênh gì cả: cấu hình có sẵn accountIds
   * nhưng giao diện bỏ trống, nên AI mặc định đăng lên MỌI kênh đang kết nối.
   * Chỉ cần một kênh khó tính như TikTok là cả lệnh đăng hỏng, mà chủ shop
   * không có cách nào bỏ nó ra.
   */
  const { accounts } = useActivePage();
  const kenhKetNoi = accounts.filter((a) => a.connected);

  const nap = useCallback(async () => {
    try {
      const { data } = await api.ai.autoPilot();
      setCau(data.config);
      setRuns(data.runs);
      setChuDeText(data.config.topics.join('\n'));
      if (data.config.enabled) setMoRong(true);
    } catch (error) {
      setLoi(error instanceof ApiError ? error.message : 'Không tải được lịch tự động');
    }
  }, []);

  useEffect(() => { nap(); }, [nap]);

  if (!cau) return null;

  const sua = (phan: Partial<AutoPilotConfig>) => {
    setCau({ ...cau, ...phan });
    setDaLuu(false);
  };

  /*
   * accountIds rỗng = đăng lên mọi kênh (giữ đúng nghĩa cũ trong database).
   * Có danh sách = chỉ đăng đúng những kênh đó.
   */
  const cheDoKenh: CheDoKenh = cau.accountIds.length === 0 ? 'tat-ca' : 'tu-chon';
  const kenhSeDang = tinhKenhSeDang(kenhKetNoi, cheDoKenh, cau.accountIds);
  const gioiHan = gioiHanChatNhat(kenhSeDang.map((a) => a.platform));

  const doiCheDoKenh = (c: CheDoKenh) => {
    if (c === 'tat-ca') {
      sua({ accountIds: [] });
      return;
    }
    // Sang chế độ tự chọn thì gợi sẵn kênh chính, đừng bắt chủ shop tick lại từ đầu.
    sua({ accountIds: cau.accountIds.length ? cau.accountIds : kenhMacDinh(kenhKetNoi) });
  };

  const doiKenh = (id: string) => {
    sua({
      accountIds: cau.accountIds.includes(id)
        ? cau.accountIds.filter((x) => x !== id)
        : [...cau.accountIds, id],
    });
  };

  /*
   * Bấm vào ngày nào cũng phải có phản ứng.
   *
   * Bản trước chặn im lặng không cho bỏ ngày cuối cùng: chủ shop bỏ lần lượt thì
   * sáu ngày tắt bình thường, tới ngày thứ bảy bấm mãi không nhúc nhích — nhìn
   * y như nút hỏng, và trông như chỉ chọn được 6 ngày trong tuần. Nay bỏ được
   * hết; trống ngày thì nói thẳng bằng chữ và chặn lúc lưu.
   */
  const doiThu = (so: number) => {
    const co = cau.days.includes(so);
    sua({
      days: co
        ? cau.days.filter((d) => d !== so)
        : [...cau.days, so].sort((a, b) => a - b),
    });
  };

  const doiGio = (i: number, giaTri: string) => {
    const moi = [...cau.times];
    moi[i] = giaTri;
    sua({ times: moi });
  };

  const luu = async () => {
    if (dangLuu) return;
    setLoi('');
    setDangLuu(true);
    try {
      const chuDe = chuDeText
        .split('\n')
        .map((d) => d.trim())
        .filter((d) => d !== '');

      const { data } = await api.ai.saveAutoPilot({ ...cau, topics: chuDe });
      setCau(data.config);
      setChuDeText(data.config.topics.join('\n'));
      setDaLuu(true);
      await nap();
      onSaved?.();
    } catch (error) {
      setLoi(error instanceof ApiError ? error.message : 'Không lưu được lịch tự động');
    } finally {
      setDangLuu(false);
    }
  };

  const soBaiMoiTuan = cau.days.length * cau.times.length;

  return (
    /*
     * Khối này cố ý nổi hơn hẳn những khối xung quanh.
     *
     * Đây là thứ biến app từ "công cụ viết bài" thành "nhân viên tự làm việc",
     * nhưng lại nằm dưới một màn hình đã dày đặc thẻ và số. Để nó cùng tông xám
     * như mọi khối khác thì chủ shop lướt qua mà không biết có tính năng này.
     * Viền sáng, quầng sáng và nhãn ở góc là để mắt dừng lại đúng chỗ.
     */
    <div
      className={clsx(
        'relative rounded-2xl mb-8 overflow-hidden border-2 transition-colors',
        cau.enabled
          ? 'bg-primary/[0.07] border-primary shadow-[0_0_40px_rgba(0,229,255,0.18)]'
          : 'bg-surface-container/40 border-primary/45 shadow-[0_0_30px_rgba(0,229,255,0.08)] hover:border-primary/70'
      )}
    >
      {/* Quầng sáng nền, giống thẻ chọn chế độ ở trên cho đồng bộ */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-primary/10 rounded-bl-full -mr-24 -mt-24 blur-3xl pointer-events-none" />

      {/* Thanh đầu: bật/tắt và tóm tắt, luôn nhìn thấy */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 relative z-10">
        <div className="flex items-start gap-4">
          <div
            className={clsx(
              'w-12 h-12 rounded-full flex items-center justify-center shrink-0 border transition-all',
              cau.enabled
                ? 'bg-primary/20 border-primary shadow-[0_0_20px_rgba(0,229,255,0.45)]'
                : 'bg-primary/10 border-primary/40'
            )}
          >
            <span className="material-symbols-outlined text-[24px] text-primary">schedule</span>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase">
                Tự động hoá
              </span>
              <span
                className={clsx(
                  'text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider border',
                  cau.enabled
                    ? 'text-primary bg-primary/20 border-primary/40'
                    : 'text-on-surface-variant bg-surface-container border-outline-variant'
                )}
              >
                {cau.enabled ? 'Đang chạy' : 'Chưa bật'}
              </span>
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-0.5">
              Lịch AI tự viết và tự đăng
            </h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              {cau.enabled
                ? `Đang bật — ${soBaiMoiTuan} bài mỗi tuần, ${
                    CHOT_CHAN.find((c) => c.id === cau.guard)?.ten.toLowerCase()
                  }`
                : 'AI tự viết và đăng theo lịch bạn đặt, không cần bạn mở app mỗi ngày.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setMoRong(!moRong)}
            className="px-4 py-2 bg-surface-container text-primary border border-primary/40 text-sm font-bold rounded-lg hover:bg-primary/10 transition-colors flex items-center gap-1"
          >
            {moRong ? 'Thu gọn' : 'Cài đặt'}
            <span className="material-symbols-outlined text-[18px]">
              {moRong ? 'expand_less' : 'expand_more'}
            </span>
          </button>
          <button
            onClick={() => { sua({ enabled: !cau.enabled }); setMoRong(true); }}
            className={clsx(
              'relative w-14 h-8 rounded-full transition-colors shrink-0 border',
              cau.enabled
                ? 'bg-primary border-primary shadow-[0_0_16px_rgba(0,229,255,0.5)]'
                : 'bg-surface-container border-primary/40 hover:border-primary/70'
            )}
            title={cau.enabled ? 'Tắt lịch tự động' : 'Bật lịch tự động'}
          >
            <span
              className={clsx(
                'absolute top-1 w-6 h-6 rounded-full transition-all',
                cau.enabled ? 'left-7 bg-white' : 'left-1 bg-on-surface-variant'
              )}
            />
          </button>
        </div>
      </div>

      {moRong && (
        <div className="border-t border-primary/25 p-6 flex flex-col gap-7 relative z-10">
          {loi && (
            <div className="flex items-start gap-3 text-sm text-error bg-error/10 border border-error/30 rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
              <span className="flex-1 leading-relaxed">{loi}</span>
            </div>
          )}

          {/* Kênh đăng — cùng một bộ chọn với hộp soạn bài tay. */}
          <ChonKenhDang
            nhan="ĐĂNG LÊN KÊNH NÀO"
            kenhKetNoi={kenhKetNoi}
            cheDo={cheDoKenh}
            onDoiCheDo={doiCheDoKenh}
            kenhTuChon={cau.accountIds}
            onDoiKenh={doiKenh}
            kenhSeDang={kenhSeDang}
            gioiHan={gioiHan}
          />

          {/* Chủ đề */}
          <div>
            <label className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-2 block">
              Chủ đề để AI viết — mỗi dòng một chủ đề
            </label>
            <textarea
              value={chuDeText}
              onChange={(e) => { setChuDeText(e.target.value); setDaLuu(false); }}
              rows={6}
              placeholder={'Công dụng của kem dưỡng da tay mùa hanh khô\nCách phân biệt hàng chính hãng\nƯu đãi tuần này'}
              className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none resize-y leading-relaxed"
            />
            <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
              AI xoay vòng lần lượt từng chủ đề. Hết danh sách thì quay lại từ đầu, nhưng mỗi
              lần viết đều tránh lặp lại mấy bài gần nhất.
            </p>
          </div>

          {/* Ngày trong tuần */}
          <div>
            <label className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-2 block">
              Đăng vào những ngày nào
            </label>
            <div className="flex flex-wrap gap-2">
              {THU.map((t) => (
                <button
                  key={t.so}
                  onClick={() => doiThu(t.so)}
                  className={clsx(
                    'w-14 h-11 rounded-xl border font-bold text-sm transition-all',
                    cau.days.includes(t.so)
                      ? 'bg-primary/15 border-primary text-primary'
                      : 'bg-surface-container border-outline-variant text-on-surface-variant hover:border-primary/50'
                  )}
                >
                  {t.ten}
                </button>
              ))}
            </div>
            {cau.days.length === 0 && (
              <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">warning</span>
                Chưa chọn ngày nào — lịch sẽ không chạy. Chọn ít nhất một ngày rồi mới lưu được.
              </p>
            )}
          </div>

          {/* Khung giờ */}
          <div>
            <label className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-2 block">
              Khung giờ trong ngày (giờ Việt Nam)
            </label>
            <div className="flex flex-wrap gap-3 items-center">
              {cau.times.map((gio, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input
                    type="time"
                    value={gio}
                    onChange={(e) => doiGio(i, e.target.value)}
                    className="bg-surface-container border border-outline-variant rounded-xl px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none"
                  />
                  {cau.times.length > 1 && (
                    <button
                      onClick={() => sua({ times: cau.times.filter((_, j) => j !== i) })}
                      className="w-8 h-8 rounded-lg text-on-surface-variant hover:text-error transition-colors flex items-center justify-center"
                      title="Bỏ khung giờ này"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  )}
                </div>
              ))}
              {cau.times.length < 4 && (
                <button
                  onClick={() => sua({ times: [...cau.times, '08:00'] })}
                  className="px-4 py-2.5 rounded-xl border border-dashed border-outline-variant text-sm font-bold text-on-surface-variant hover:border-primary/50 hover:text-primary transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  Thêm giờ
                </button>
              )}
            </div>
            <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
              Tổng cộng <span className="text-primary font-bold">{soBaiMoiTuan} bài mỗi tuần</span>.
              Máy chủ tắt lúc tới giờ thì bài đó bỏ qua, không đăng bù vào lúc khác.
            </p>
          </div>

          {/* Mục tiêu */}
          <div>
            <label className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-2 block">
              Giọng bài viết
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {MUC_TIEU.map((m) => (
                <button
                  key={m.id}
                  onClick={() => sua({ goal: m.id })}
                  className={clsx(
                    'p-3 rounded-xl border text-left transition-all',
                    cau.goal === m.id
                      ? 'bg-primary/10 border-primary'
                      : 'bg-surface-container border-outline-variant hover:border-primary/50'
                  )}
                >
                  <span
                    className={clsx(
                      'font-bold text-sm block mb-0.5',
                      cau.goal === m.id ? 'text-primary' : 'text-on-surface'
                    )}
                  >
                    {m.ten}
                  </span>
                  <span className="text-xs text-on-surface-variant">{m.mo}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Chốt chặn */}
          <div>
            <label className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-2 block">
              Trước khi bài lên Fanpage
            </label>
            <div className="flex flex-col gap-3">
              {CHOT_CHAN.map((c) => (
                <button
                  key={c.id}
                  onClick={() => sua({ guard: c.id })}
                  className={clsx(
                    'p-4 rounded-xl border text-left transition-all flex items-start gap-3',
                    cau.guard === c.id
                      ? 'bg-primary/10 border-primary'
                      : 'bg-surface-container border-outline-variant hover:border-primary/50'
                  )}
                >
                  <span
                    className={clsx(
                      'material-symbols-outlined text-[20px] shrink-0 mt-0.5',
                      cau.guard === c.id ? 'text-primary' : 'text-on-surface-variant'
                    )}
                  >
                    {cau.guard === c.id ? 'radio_button_checked' : 'radio_button_unchecked'}
                  </span>
                  <span className="flex-1">
                    <span
                      className={clsx(
                        'font-bold text-sm block mb-0.5',
                        cau.guard === c.id ? 'text-primary' : 'text-on-surface'
                      )}
                    >
                      {c.ten}
                    </span>
                    <span className="text-xs text-on-surface-variant leading-relaxed block">
                      {c.mo}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {cau.guard === 'notify' && (
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <span className="text-sm text-on-surface-variant">Chờ</span>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={cau.notifyMinutes}
                  onChange={(e) => sua({ notifyMinutes: Number(e.target.value) })}
                  className="w-[90px] bg-surface-container border border-outline-variant rounded-xl px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                />
                <span className="text-sm text-on-surface-variant">
                  phút rồi mới đăng. Muốn huỷ thì vào mục Chờ duyệt xoá bài đó đi.
                </span>
              </div>
            )}

            {cau.guard === 'publish' && (
              <div className="mt-3 flex items-start gap-3 text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">warning</span>
                <span className="leading-relaxed">
                  Bài lên thẳng Fanpage, không ai xem trước. Chỉ nên chọn khi bạn đã chạy thử
                  vài ngày ở chế độ chờ duyệt và thấy AI viết đúng ý.
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={luu}
              disabled={dangLuu}
              className="px-5 py-2.5 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform disabled:opacity-60 disabled:hover:scale-100 flex items-center gap-2"
            >
              {dangLuu && (
                <span className="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
              )}
              {dangLuu ? 'Đang lưu…' : 'Lưu lịch'}
            </button>
            {daLuu && (
              <span className="text-sm text-green-500 flex items-center gap-1">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                Đã lưu
              </span>
            )}
          </div>

          {/* Nhật ký: bằng chứng lịch có chạy hay không */}
          {runs.length > 0 && (
            <div>
              <label className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-2 block">
                Những lượt gần đây
              </label>
              <div className="flex flex-col gap-2">
                {runs.slice(0, 8).map((r) => {
                  const tt = TRANG_THAI[r.status] ?? TRANG_THAI.running;
                  return (
                    <div
                      key={r.slot_key}
                      className="flex items-start gap-3 bg-surface-container/60 border border-outline-variant rounded-xl px-4 py-2.5"
                    >
                      <span className="font-mono text-xs text-on-surface-variant shrink-0 mt-0.5 w-[120px]">
                        {r.slot_key}
                      </span>
                      <span
                        className={clsx(
                          'text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider border shrink-0 mt-0.5',
                          tt.mau
                        )}
                      >
                        {tt.chu}
                      </span>
                      <span className="flex-1 text-sm text-on-surface-variant leading-relaxed">
                        {r.topic ? <span className="text-on-surface">{r.topic}</span> : null}
                        {r.note ? <span className="block text-xs mt-0.5">{r.note}</span> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
