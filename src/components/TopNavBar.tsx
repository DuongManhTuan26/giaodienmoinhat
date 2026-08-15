import { useLocation } from 'react-router-dom';

export default function TopNavBar() {
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
        <div className="h-8 w-8 rounded-full ml-sm border-2 border-primary overflow-hidden relative group cursor-pointer">
          <img alt="Active Fanpage Avatar" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCzd3mukJunEyF_SZapXl6q1MKg9g8D3_pj0I5hjXPhDSwrQQYna-a9egAaXIThNRDdVxk5vGKhUXWeqK1kOz4V6xkbhh_bonKMCdMmHDimO6n_Fq4hkLd9zjGFCYeHsKgd1O4JKO4GiiWA7Brqhr6lJbuQgKCWfdM6ilamyFyf4LufGE3dd4SiuoVb5lkMVkw_llHdVOYXnowmYhn113Ti8hHvdsunKr1vxsP5QwPTAwR7P5OmXPvaNA"/>
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#72a664] rounded-full border-2 border-background"></div>
        </div>
      </div>
    </nav>
  );
}
