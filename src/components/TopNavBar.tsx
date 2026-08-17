import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, type User } from '../lib/api';

export default function TopNavBar({ user, avatarUrl }: {
  user?: User | null;
  /** Ảnh đại diện của Fanpage đang hoạt động, lấy từ kênh đã kết nối. */
  avatarUrl?: string | null;
}) {
  const location = useLocation();
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
        <div className="h-8 w-8 rounded-full ml-sm border-2 border-primary overflow-hidden relative group cursor-pointer" title={user?.email ?? ''}>
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
      </div>
    </nav>
  );
}
