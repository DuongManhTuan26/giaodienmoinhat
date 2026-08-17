import { useLocation } from 'react-router-dom';
import type { User } from '../lib/api';

export default function TopNavBar({ user }: { user?: User | null }) {
  const location = useLocation();
  
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
        <button className="text-primary hover:bg-surface-container-highest/80 rounded-full p-2 transition-all duration-200 flex items-center justify-center">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>notifications</span>
        </button>
        <button className="text-primary hover:bg-surface-container-highest/80 rounded-full p-2 transition-all duration-200 flex items-center justify-center">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>bolt</span>
        </button>
        <div
          className="h-8 w-8 rounded-full ml-sm border-2 border-primary overflow-hidden relative group cursor-pointer bg-surface-container-high flex items-center justify-center"
          title={user?.email ?? ''}
        >
          {/* Chữ cái đầu của tên shop, thay cho ảnh đại diện dựng sẵn */}
          <span className="font-label-sm font-bold text-primary text-sm">
            {(user?.name || user?.email || '?').trim().charAt(0).toUpperCase()}
          </span>
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#72a664] rounded-full border-2 border-background"></div>
        </div>
      </div>
    </nav>
  );
}
