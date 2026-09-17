/**
 * Trang quản trị: quản lý mọi tài khoản shop.
 *
 * Trang này chỉ hiện với tài khoản quản trị, nhưng đó CHỈ là lớp che mắt —
 * mọi lời gọi đều bị máy chủ kiểm lại vai trò từ database. Giấu trên giao diện
 * không bao giờ là bảo vệ.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type TaiKhoanQuanTri, type NhatKyQuanTri } from '../lib/api';
import BangLoi from '../components/BangLoi';

const TEN_VIEC: Record<string, string> = {
  tao_tai_khoan: 'Tạo tài khoản',
  sua_tai_khoan: 'Sửa tài khoản',
  khoa_tai_khoan: 'Khoá tài khoản',
  mo_khoa_tai_khoan: 'Mở khoá tài khoản',
  cap_lai_mat_khau: 'Cấp lại mật khẩu',
  xoa_tai_khoan: 'Xoá tài khoản',
};

function gioVN(luc: string | null): string {
  if (!luc) return '—';
  return new Date(luc).toLocaleString('vi-VN');
}

export default function Admin() {
  const [danhSach, setDanhSach] = useState<TaiKhoanQuanTri[]>([]);
  const [nhatKy, setNhatKy] = useState<NhatKyQuanTri[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [dangLam, setDangLam] = useState<number | null>(null);

  const [moTao, setMoTao] = useState(false);
  const [emailMoi, setEmailMoi] = useState('');
  const [tenMoi, setTenMoi] = useState('');
  const [dangTao, setDangTao] = useState(false);
  /* Mật khẩu tạm chỉ hiện ĐÚNG MỘT LẦN, không lưu lại ở đâu cả. */
  const [matKhauTam, setMatKhauTam] = useState<{ email: string; mk: string } | null>(null);

  const [dangSua, setDangSua] = useState<TaiKhoanQuanTri | null>(null);
  const [suaTen, setSuaTen] = useState('');
  const [suaEmail, setSuaEmail] = useState('');

  const nap = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([api.admin.accounts(), api.admin.audit()]);
      setDanhSach(a.data);
      setNhatKy(b.data);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không tải được danh sách tài khoản');
    }
  }, []);

  useEffect(() => { nap(); }, [nap]);

  const taoTaiKhoan = async () => {
    if (dangTao) return;
    setErrorMessage('');
    setDangTao(true);
    try {
      const { data } = await api.admin.create({ email: emailMoi.trim(), name: tenMoi.trim() });
      setMatKhauTam({ email: data.email, mk: data.matKhauTam });
      setMoTao(false);
      setEmailMoi('');
      setTenMoi('');
      await nap();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không tạo được tài khoản');
    } finally {
      setDangTao(false);
    }
  };

  const doiKhoa = async (tk: TaiKhoanQuanTri) => {
    const khoa = tk.is_active;
    if (khoa && !confirm(
      `Khoá tài khoản ${tk.email}?\n\n` +
      'Họ sẽ bị đẩy ra khỏi ứng dụng ngay lập tức và không đăng nhập lại được. ' +
      'Dữ liệu vẫn giữ nguyên, mở khoá lúc nào cũng được.'
    )) return;
    setDangLam(tk.id);
    setErrorMessage('');
    try {
      await api.admin.setLocked(tk.id, khoa);
      await nap();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không đổi được trạng thái khoá');
    } finally {
      setDangLam(null);
    }
  };

  const capLaiMatKhau = async (tk: TaiKhoanQuanTri) => {
    if (!confirm(
      `Cấp lại mật khẩu cho ${tk.email}?\n\n` +
      'Mật khẩu cũ mất hiệu lực ngay, mọi phiên đang mở của họ bị cắt.'
    )) return;
    setDangLam(tk.id);
    setErrorMessage('');
    try {
      const { data } = await api.admin.resetPassword(tk.id);
      setMatKhauTam({ email: tk.email, mk: data.matKhauTam });
      await nap();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không cấp lại được mật khẩu');
    } finally {
      setDangLam(null);
    }
  };

  const xoaTaiKhoan = async (tk: TaiKhoanQuanTri) => {
    const go = prompt(
      `XOÁ HẲN tài khoản ${tk.email}?\n\n` +
      'Mất sạch khách hàng, hội thoại, đơn hàng và bài đăng của shop này. Không lấy lại được.\n\n' +
      'Gõ đúng email của họ để xác nhận:'
    );
    if (go === null) return;
    setDangLam(tk.id);
    setErrorMessage('');
    try {
      await api.admin.remove(tk.id, go);
      await nap();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không xoá được tài khoản');
    } finally {
      setDangLam(null);
    }
  };

  const luuSua = async () => {
    if (!dangSua) return;
    setErrorMessage('');
    try {
      await api.admin.update(dangSua.id, { name: suaTen.trim(), email: suaEmail.trim() });
      setDangSua(null);
      await nap();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không lưu được thay đổi');
    }
  };

  const soKhoa = danhSach.filter((t) => !t.is_active).length;

  return (
    <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full bg-background">
      <BangLoi noiDung={errorMessage} onDong={() => setErrorMessage('')} className="mb-6" />

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="font-headline-sm text-3xl font-bold text-on-surface tracking-tight mb-2">
            Quản trị hệ thống
          </h1>
          <p className="font-body-lg text-on-surface-variant">
            {danhSach.length} tài khoản{soKhoa > 0 ? `, ${soKhoa} đang bị khoá` : ''}
          </p>
        </div>
        <button
          onClick={() => setMoTao(true)}
          className="shrink-0 px-4 py-2 bg-primary text-on-primary font-bold rounded-lg shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:brightness-110 transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          Tạo tài khoản
        </button>
      </div>

      {matKhauTam && (
        <div className="mb-6 bg-surface-container rounded-xl border-2 border-primary/50 p-4">
          <p className="text-sm font-bold text-on-surface mb-1">
            Mật khẩu tạm cho {matKhauTam.email}
          </p>
          <p className="text-xs text-on-surface-variant mb-3 leading-relaxed">
            Chỉ hiện đúng một lần, hệ thống không lưu lại. Chép gửi cho chủ shop và dặn họ đổi
            ngay sau lần đăng nhập đầu tiên.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm font-mono bg-surface px-3 py-2 rounded-lg border border-outline-variant text-on-surface select-all">
              {matKhauTam.mk}
            </code>
            <button
              onClick={() => setMatKhauTam(null)}
              className="px-3 py-2 rounded-lg border border-outline text-on-surface text-xs font-bold hover:border-primary transition-colors"
            >
              Đã chép, đóng
            </button>
          </div>
        </div>
      )}

      <div className="bg-surface-container/30 border border-outline-variant rounded-2xl overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant text-on-surface-variant">
                <th className="text-left font-mono text-[10px] uppercase tracking-wider px-4 py-3">Tài khoản</th>
                <th className="text-left font-mono text-[10px] uppercase tracking-wider px-4 py-3">Gói</th>
                <th className="text-right font-mono text-[10px] uppercase tracking-wider px-4 py-3">Kênh</th>
                <th className="text-right font-mono text-[10px] uppercase tracking-wider px-4 py-3">Hội thoại</th>
                <th className="text-right font-mono text-[10px] uppercase tracking-wider px-4 py-3">Đơn</th>
                <th className="text-right font-mono text-[10px] uppercase tracking-wider px-4 py-3">Bài</th>
                <th className="text-right font-mono text-[10px] uppercase tracking-wider px-4 py-3">Tài liệu</th>
                <th className="text-left font-mono text-[10px] uppercase tracking-wider px-4 py-3">Hoạt động cuối</th>
                <th className="text-left font-mono text-[10px] uppercase tracking-wider px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {danhSach.map((t) => (
                <tr key={t.id} className="border-b border-outline-variant/40 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-bold text-on-surface flex items-center gap-2">
                      {t.name || '(chưa đặt tên)'}
                      {t.role === 'admin' && (
                        <span className="font-mono text-[10px] uppercase text-primary bg-primary/10 border border-primary/30 px-1.5 py-0.5 rounded">
                          quản trị
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-on-surface-variant">{t.email}</div>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{t.plan}</td>
                  <td className="px-4 py-3 text-right text-on-surface">{t.kenh}</td>
                  <td className="px-4 py-3 text-right text-on-surface">
                    {t.hoi_thoai}
                    {t.cho_nguoi > 0 && (
                      <span className="text-error font-bold"> ({t.cho_nguoi} chờ)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-on-surface">{t.don}</td>
                  <td className="px-4 py-3 text-right text-on-surface">{t.bai}</td>
                  <td className={`px-4 py-3 text-right ${t.tai_lieu === 0 ? 'text-error font-bold' : 'text-on-surface'}`}>
                    {t.tai_lieu}
                  </td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">
                    {gioVN(t.hoat_dong_cuoi)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={`font-mono text-[10px] uppercase px-1.5 py-0.5 rounded w-fit border ${
                        t.is_active
                          ? 'text-green-400 bg-green-500/10 border-green-500/30'
                          : 'text-error bg-error/10 border-error/30'
                      }`}>
                        {t.is_active ? 'đang chạy' : 'đã khoá'}
                      </span>
                      <span className="text-[10px] text-on-surface-variant">
                        {t.tu_chu === 'true' ? 'tự chủ bật' : 'tự chủ tắt'}
                        {t.telegram ? ' · telegram' : ''}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => { setDangSua(t); setSuaTen(t.name); setSuaEmail(t.email); }}
                        className="px-2.5 py-1.5 rounded-lg border border-outline-variant text-on-surface text-xs font-bold hover:border-primary transition-colors"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => capLaiMatKhau(t)}
                        disabled={dangLam === t.id}
                        className="px-2.5 py-1.5 rounded-lg border border-outline-variant text-on-surface text-xs font-bold hover:border-primary transition-colors disabled:opacity-50"
                      >
                        Mật khẩu
                      </button>
                      {t.role !== 'admin' && (
                        <>
                          <button
                            onClick={() => doiKhoa(t)}
                            disabled={dangLam === t.id}
                            className="px-2.5 py-1.5 rounded-lg border border-outline-variant text-on-surface text-xs font-bold hover:border-primary transition-colors disabled:opacity-50"
                          >
                            {t.is_active ? 'Khoá' : 'Mở khoá'}
                          </button>
                          <button
                            onClick={() => xoaTaiKhoan(t)}
                            disabled={dangLam === t.id}
                            className="px-2.5 py-1.5 rounded-lg border border-error/30 bg-error/10 text-error text-xs font-bold hover:bg-error/20 transition-colors disabled:opacity-50"
                          >
                            Xoá
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-3">
          Nhật ký quản trị
        </h2>
        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-4 space-y-2">
          {nhatKy.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Chưa có thao tác nào.</p>
          ) : (
            nhatKy.map((n) => (
              <div key={n.id} className="flex items-baseline gap-3 text-sm">
                <span className="text-xs text-on-surface-variant whitespace-nowrap shrink-0">
                  {gioVN(n.created_at)}
                </span>
                <span className="font-bold text-on-surface shrink-0">
                  {TEN_VIEC[n.action] ?? n.action}
                </span>
                <span className="text-on-surface-variant truncate">
                  {n.target_email} {n.admin_email ? `· bởi ${n.admin_email}` : ''}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {moTao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-surface-container-high rounded-2xl border border-outline-variant w-full max-w-[520px] p-6 space-y-4">
            <h2 className="font-headline-sm text-xl font-bold text-on-surface">Tạo tài khoản mới</h2>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Tài khoản tạo ra hoàn toàn độc lập, ở trạng thái mặc định để chủ shop tự cài theo
              mục đích của họ. Hệ thống sinh một mật khẩu tạm, hiện đúng một lần cho bạn chép lại.
            </p>
            <div>
              <label className="block text-xs font-bold text-on-surface mb-1.5">Email đăng nhập</label>
              <input
                type="email"
                value={emailMoi}
                onChange={(e) => setEmailMoi(e.target.value)}
                placeholder="chushop@email.com"
                className="w-full bg-surface rounded-lg border border-outline-variant px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-on-surface mb-1.5">Tên shop</label>
              <input
                type="text"
                value={tenMoi}
                onChange={(e) => setTenMoi(e.target.value)}
                placeholder="Ví dụ: Chạm Tay Vạn Điều Hay"
                className="w-full bg-surface rounded-lg border border-outline-variant px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setMoTao(false)}
                className="flex-1 py-2.5 rounded-xl border border-outline-variant text-on-surface font-bold text-sm hover:bg-surface-variant transition-colors"
              >
                Huỷ
              </button>
              <button
                onClick={taoTaiKhoan}
                disabled={dangTao || !emailMoi.trim()}
                className="flex-[2] py-2.5 rounded-xl bg-primary text-on-primary font-bold text-sm hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {dangTao ? 'Đang tạo…' : 'Tạo tài khoản'}
              </button>
            </div>
          </div>
        </div>
      )}

      {dangSua && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-surface-container-high rounded-2xl border border-outline-variant w-full max-w-[520px] p-6 space-y-4">
            <h2 className="font-headline-sm text-xl font-bold text-on-surface">Sửa tài khoản</h2>
            <div>
              <label className="block text-xs font-bold text-on-surface mb-1.5">Tên shop</label>
              <input
                type="text"
                value={suaTen}
                onChange={(e) => setSuaTen(e.target.value)}
                className="w-full bg-surface rounded-lg border border-outline-variant px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-on-surface mb-1.5">Email đăng nhập</label>
              <input
                type="email"
                value={suaEmail}
                onChange={(e) => setSuaEmail(e.target.value)}
                className="w-full bg-surface rounded-lg border border-outline-variant px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setDangSua(null)}
                className="flex-1 py-2.5 rounded-xl border border-outline-variant text-on-surface font-bold text-sm hover:bg-surface-variant transition-colors"
              >
                Huỷ
              </button>
              <button
                onClick={luuSua}
                className="flex-[2] py-2.5 rounded-xl bg-primary text-on-primary font-bold text-sm hover:brightness-110 transition-all"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
