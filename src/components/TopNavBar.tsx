import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, type User } from '../lib/api';

/**
 * Hộp đổi mật khẩu.
 *
 * Bắt nhập lại mật khẩu hiện tại — không có bước đó thì bất kỳ ai ngồi vào máy
 * đang mở sẵn đều chiếm được tài khoản.
 */
function DoiMatKhau({ onClose }: { onClose: () => void }) {
  const [hienTai, setHienTai] = useState('');
  const [moi, setMoi] = useState('');
  const [nhapLai, setNhapLai] = useState('');
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState('');
  const [dangLuu, setDangLuu] = useState(false);

  const luu = async () => {
    setLoi('');
    if (moi.length < 8) { setLoi('Mật khẩu mới phải có ít nhất 8 ký tự.'); return; }
    if (moi !== nhapLai) { setLoi('Hai ô mật khẩu mới không khớp nhau.'); return; }

    setDangLuu(true);
    try {
      const r = await api.auth.changePassword(hienTai, moi);
      setXong(r.message);
      setHienTai(''); setMoi(''); setNhapLai('');
    } catch (error) {
      setLoi(error instanceof ApiError ? error.message : 'Không đổi được mật khẩu');
    } finally {
      setDangLuu(false);
    }
  };

  const oNhap = "w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[420px] bg-surface-container-high border border-primary/30 rounded-2xl shadow-[0_0_40px_rgba(0,229,255,0.1)] overflow-hidden">
        <div className="px-6 py-5 border-b border-outline-variant flex items-center justify-between">
          <h2 className="text-lg font-bold text-on-surface">Đổi mật khẩu</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant text-on-surface-variant">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {loi && (
            <div className="text-sm text-error bg-error/10 border border-error/30 rounded-xl px-4 py-3">{loi}</div>
          )}
          {xong ? (
            <div className="text-sm text-green-400 bg-green-400/10 border border-green-400/30 rounded-xl px-4 py-3">
              {xong}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-bold text-on-surface mb-2">Mật khẩu hiện tại</label>
                <input type="password" value={hienTai} onChange={(e) => setHienTai(e.target.value)} className={oNhap} />
              </div>
              <div>
                <label className="block text-sm font-bold text-on-surface mb-2">Mật khẩu mới</label>
                <input type="password" value={moi} onChange={(e) => setMoi(e.target.value)} className={oNhap} placeholder="Ít nhất 8 ký tự" />
              </div>
              <div>
                <label className="block text-sm font-bold text-on-surface mb-2">Nhập lại mật khẩu mới</label>
                <input type="password" value={nhapLai} onChange={(e) => setNhapLai(e.target.value)} className={oNhap} />
              </div>
              <p className="text-xs text-on-surface-variant/70 leading-relaxed">
                Đổi xong, mọi thiết bị khác đang đăng nhập sẽ bị đăng xuất.
              </p>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-outline-variant/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 rounded-full text-sm font-bold text-on-surface hover:bg-surface-variant transition-colors">
            {xong ? 'Đóng' : 'Hủy'}
          </button>
          {!xong && (
            <button onClick={luu} disabled={dangLuu} className="px-5 py-2.5 rounded-full bg-primary text-on-primary font-bold text-sm hover:brightness-110 transition-all disabled:opacity-60">
              {dangLuu ? 'Đang đổi…' : 'Đổi mật khẩu'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TopNavBar({ user, avatarUrl }: {
  user?: User | null;
  /** Ảnh đại diện của Fanpage đang hoạt động, lấy từ kênh đã kết nối. */
  avatarUrl?: string | null;
}) {
  const location = useLocation();
  const [menuMo, setMenuMo] = useState(false);
  const [doiMatKhauMo, setDoiMatKhauMo] = useState(false);
  const navigate = useNavigate();
  const [waitingCount, setWaitingCount] = useState(0);

  // Số hội thoại AI đã nhường quyền, hiện trên chuông thông báo.
  // Nạp lại mỗi khi đổi trang và định kỳ, để nhân viên không bỏ sót khách.
  useEffect(() => {
    let cancelled = false;

    const load = () => {
      api.inbox
        .counts()
        .then(({ data }) => {
          if (!cancelled) setWaitingCount(Number(data.waiting_human) || 0);
        })
        .catch(() => {
          /* Không lấy được số thì để nguyên, không cần báo lỗi ở thanh trên. */
        });
    };

    load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [location.pathname]);

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/': return 'Bảng điều khiển';
      case '/inbox': return 'Hộp thoại bán hàng';
      case '/orders': return 'Đơn hàng';
      case '/content': return 'Bài đăng';
      case '/auto-scripts': return 'Kịch bản tự động';
      case '/ads': return 'Quảng cáo';
      case '/telegram': return 'Cảnh báo Telegram';
      case '/connections': return 'Kết nối';
      case '/pricing': return 'Gói dịch vụ';
      case '/settings': return 'Cài đặt';
      default: return 'Bảng điều khiển';
    }
  };

  return (
    <nav className="fixed top-0 right-0 w-[calc(100%-288px)] z-40 bg-surface shadow-[0_4px_30px_rgba(0,229,255,0.1)] border-b border-primary/20 transition-all duration-200 hidden md:flex justify-between items-center px-margin py-base h-16">
      <div className="flex items-center gap-md">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-primary">{getPageTitle()}</h1>
        <div className="hidden lg:flex items-center gap-base ml-lg">
          <span className="font-mono text-label-sm px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/30 font-bold tracking-wide">
            TỰ ĐỘNG HÓA THỜI GIAN THỰC
          </span>
        </div>
      </div>
      <div className="flex items-center gap-base">
        <button
          onClick={() => navigate('/inbox')}
          title={waitingCount > 0 ? `${waitingCount} hội thoại đang chờ bạn xử lý` : 'Không có việc nào đang chờ'}
          className="text-primary hover:bg-surface-container-highest/80 rounded-full p-2 transition-all duration-200 flex items-center justify-center relative"
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>notifications</span>
          {waitingCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-error text-on-error text-[10px] font-bold flex items-center justify-center border-2 border-surface">
              {waitingCount > 99 ? '99+' : waitingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => navigate('/auto-scripts')}
          title="Cấu hình AI bán hàng"
          className="text-primary hover:bg-surface-container-highest/80 rounded-full p-2 transition-all duration-200 flex items-center justify-center"
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>bolt</span>
        </button>
        <div className="relative ml-sm">
        <div
          onClick={() => setMenuMo((v) => !v)}
          className="h-8 w-8 rounded-full border-2 border-primary overflow-hidden relative group cursor-pointer"
          title={user?.email ?? ''}
        >
          {avatarUrl ? (
            <img alt="Active Fanpage Avatar" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" src={avatarUrl}/>
          ) : (
            /* Chỉ dùng khi Fanpage chưa có ảnh đại diện — giữ nguyên khung tròn và viền */
            <div className="w-full h-full bg-surface-container-high flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <span className="font-label-sm font-bold text-primary text-sm">
                {(user?.name || user?.email || '?').trim().charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#72a664] rounded-full border-2 border-background"></div>
        </div>

        {/*
          Menu tài khoản.

          Trước đây ảnh đại diện có con trỏ bàn tay nhưng bấm KHÔNG làm gì, và
          hệ thống không có chỗ nào đổi mật khẩu — khách đổi máy hay nghi lộ mật
          khẩu là bó tay hoàn toàn.
        */}
        {menuMo && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuMo(false)} />
            <div className="absolute right-0 mt-2 w-64 bg-surface-container-high border border-outline-variant rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-outline-variant/50">
                <p className="text-sm font-bold text-on-surface truncate">{user?.name || 'Gian hàng'}</p>
                <p className="text-xs text-on-surface-variant truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => { setMenuMo(false); setDoiMatKhauMo(true); }}
                className="w-full text-left px-4 py-3 text-sm text-on-surface hover:bg-surface-variant transition-colors flex items-center gap-3"
              >
                <span className="material-symbols-outlined text-[18px]">key</span>
                Đổi mật khẩu
              </button>
            </div>
          </>
        )}
        </div>
      </div>

      {doiMatKhauMo && <DoiMatKhau onClose={() => setDoiMatKhauMo(false)} />}
    </nav>
  );
}
