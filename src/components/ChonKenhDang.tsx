/**
 * Bộ chọn kênh đăng, dùng chung cho CẢ hộp soạn bài tay lẫn lịch AI tự đăng.
 *
 * Vì sao là component chung: hai nơi này phải hành xử y hệt nhau. Chép mã ra
 * hai chỗ thì sớm muộn cũng lệch, rồi chủ shop gặp hai kiểu hành vi khác nhau
 * cho cùng một việc.
 *
 * Quy tắc giới hạn: hệ thống gửi MỘT lệnh đăng cho mọi kênh đã chọn, nên một
 * kênh từ chối là cả lệnh hỏng. Vì thế độ dài bài phải vừa với kênh khó tính
 * nhất trong số đang chọn, và luôn nói rõ đó là kênh nào, vì sao.
 */
import { laKenhChinh, type CheDoKenh, type GioiHanKenh } from '../lib/gioi-han-kenh';

export interface KenhDang {
  id: string;
  platform: string;
  display_name: string;
}

export default function ChonKenhDang({
  kenhKetNoi,
  cheDo,
  onDoiCheDo,
  kenhTuChon,
  onDoiKenh,
  kenhSeDang,
  gioiHan,
  nhan,
}: {
  kenhKetNoi: KenhDang[];
  cheDo: CheDoKenh;
  onDoiCheDo: (c: CheDoKenh) => void;
  kenhTuChon: string[];
  onDoiKenh: (id: string) => void;
  kenhSeDang: KenhDang[];
  gioiHan: GioiHanKenh | null;
  nhan: string;
}) {
  const chinh = kenhKetNoi.filter((k) => laKenhChinh(k.platform));
  const them = kenhKetNoi.filter((k) => !laKenhChinh(k.platform));

  const veMotKenh = (a: KenhDang) => {
    const dangChon = kenhSeDang.some((k) => k.id === a.id);
    const khoa = cheDo === 'tat-ca';
    return (
      <button
        key={a.id}
        type="button"
        disabled={khoa}
        onClick={() => onDoiKenh(a.id)}
        className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 border text-left transition-colors ${
          dangChon ? 'border-primary/60 bg-primary/5' : 'border-outline-variant bg-surface'
        } ${khoa ? 'cursor-default opacity-90' : 'hover:border-primary'}`}
      >
        <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
          {dangChon ? 'check_box' : 'check_box_outline_blank'}
        </span>
        <span className="font-bold text-sm text-on-surface flex-1">{a.display_name}</span>
        <span className="font-mono text-[10px] uppercase text-on-surface-variant shrink-0">
          {a.platform}
        </span>
      </button>
    );
  };

  return (
    <div>
      <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-3">
        {nhan}
      </h3>
      <div className="bg-surface-container rounded-xl p-4 border-2 border-primary/50 shadow-[0_0_18px_rgba(0,229,255,0.12)] space-y-4">
        {kenhKetNoi.length === 0 ? (
          <p className="text-sm text-error">
            Chưa có kênh nào được kết nối. Vui lòng kết nối kênh tại mục Kết Nối Đa Nền Tảng.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onDoiCheDo('tu-chon')}
                className={`text-left rounded-xl p-3 border transition-colors ${
                  cheDo === 'tu-chon'
                    ? 'border-primary bg-primary/10'
                    : 'border-outline-variant bg-surface hover:border-primary/50'
                }`}
              >
                <span className="flex items-center gap-2 font-bold text-sm text-on-surface">
                  <span className="material-symbols-outlined text-[18px] text-primary">
                    {cheDo === 'tu-chon' ? 'radio_button_checked' : 'radio_button_unchecked'}
                  </span>
                  Chọn kênh cụ thể
                </span>
                <span className="block text-xs text-on-surface-variant mt-1 ml-7">
                  Chỉ đăng lên những kênh bạn chọn
                </span>
              </button>

              <button
                type="button"
                onClick={() => onDoiCheDo('tat-ca')}
                className={`text-left rounded-xl p-3 border transition-colors ${
                  cheDo === 'tat-ca'
                    ? 'border-primary bg-primary/10'
                    : 'border-outline-variant bg-surface hover:border-primary/50'
                }`}
              >
                <span className="flex items-center gap-2 font-bold text-sm text-on-surface">
                  <span className="material-symbols-outlined text-[18px] text-primary">
                    {cheDo === 'tat-ca' ? 'radio_button_checked' : 'radio_button_unchecked'}
                  </span>
                  Đăng lên tất cả kênh
                </span>
                <span className="block text-xs text-on-surface-variant mt-1 ml-7">
                  Tất cả {kenhKetNoi.length} kênh đang kết nối
                </span>
              </button>
            </div>

            {chinh.length > 0 && (
              <div className="space-y-2">
                <p className="font-mono text-[10px] font-bold tracking-wider uppercase text-on-surface-variant">
                  Kênh chính · Fanpage và Instagram
                </p>
                {chinh.map(veMotKenh)}
              </div>
            )}

            {them.length > 0 && (
              <div className="space-y-2">
                <p className="font-mono text-[10px] font-bold tracking-wider uppercase text-on-surface-variant">
                  Kênh bổ sung · chọn thêm nếu cần
                </p>
                {them.map(veMotKenh)}
              </div>
            )}

            {kenhSeDang.length === 0 && (
              <p className="text-sm text-error">
                Vui lòng chọn ít nhất một kênh.
              </p>
            )}

            {kenhSeDang.length > 0 && gioiHan && (
              <div className="bg-surface rounded-lg border border-outline-variant p-3">
                <p className="text-sm font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary">rule</span>
                  Giới hạn bài viết: {gioiHan.soKyTu.toLocaleString('vi-VN')} ký tự
                </p>
                <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
                  Áp dụng theo <b className="text-on-surface">{gioiHan.ten}</b>, kênh có giới hạn
                  thấp nhất trong các kênh bạn đã chọn. {gioiHan.lyDo}
                </p>
                <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
                  Bài được gửi đồng thời tới tất cả kênh đã chọn. Nếu một kênh không nhận bài,
                  các kênh còn lại cũng không đăng được.
                </p>
                {!gioiHan.daKiemChung && (
                  <p className="text-xs text-on-surface-variant/70 mt-1.5">
                    Số liệu tham khảo từ tài liệu của nền tảng, có thể thay đổi.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
