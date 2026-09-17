import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useActivePage, PLATFORM_BADGE } from '../lib/ActivePage';

/**
 * Địa chỉ trợ giúp của CHÍNH mình.
 *
 * Trước đây nút này mở docs.zernio.com. Đó là tài liệu của nhà cung cấp hạ
 * tầng: khách trả tiền cho mình lại nhìn thấy tên và trang bán hàng của Zernio,
 * và chỉ cần một cú bấm là họ tự mua thẳng bên đó, bỏ qua mình. Zernio là
 * đường ống chạy phía sau, không phải thứ khách hàng cần biết tới.
 *
 * Đặt VITE_SUPPORT_URL trong .env để trỏ tới kênh hỗ trợ thật (trang trợ giúp,
 * Zalo, hoặc mailto:). Chưa đặt thì đưa về trang Gói dịch vụ trong app, nơi đã
 * có thông tin liên hệ — vẫn nằm trong app, không lộ nhà cung cấp.
 */
const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL || '/pricing';
const IS_EXTERNAL_SUPPORT = /^https?:|^mailto:/.test(SUPPORT_URL);

export default function Sidebar({
  onLogout,
  laQuanTri = false,
  moKhung = false,
  onDong,
}: {
  onLogout?: () => void;
  /*
   * Trên điện thoại thanh menu là NGĂN KÉO, mặc định trượt ra ngoài màn hình.
   *
   * Đã dựng lại trên màn 375px: thanh menu rộng cố định 288px chiếm 77% bề
   * ngang, đẩy toàn bộ nội dung ra khỏi mép phải — tiêu đề trang bị cắt, các ô
   * số bị cắt, không thao tác được gì. Mà chủ shop thì xem hàng trên điện
   * thoại là chính.
   *
   * Từ lg trở lên nó vẫn đứng cố định như cũ, không đổi gì.
   */
  moKhung?: boolean;
  onDong?: () => void;
  /*
   * Chỉ quản trị mới thấy mục Quản Trị Hệ Thống.
   * Giấu trên giao diện không phải là bảo vệ — máy chủ vẫn kiểm lại vai trò từ
   * database ở mọi lời gọi. Đây chỉ để người thường không nhìn thấy cái nút
   * họ không bấm được.
   */
  laQuanTri?: boolean;
}) {
  const navigate = useNavigate();
  const viTri = useLocation();
  const { accounts, activeAccount, activeAccountId, setActiveAccountId } = useActivePage();

  /*
   * Chọn một mục là đóng ngăn kéo.
   *
   * Không đóng thì trên điện thoại chủ shop bấm sang trang mới xong vẫn chỉ
   * nhìn thấy cái menu phủ kín màn hình, tưởng là bấm không ăn.
   */
  useEffect(() => { onDong?.(); }, [viTri.pathname]);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);

  const group1 = [
    { name: 'Bảng Điều Khiển', icon: 'dashboard', path: '/' },
    { name: 'Kết Nối Đa Nền Tảng', icon: 'cable', path: '/connections' },
  ];
  
  const group2 = [
    { name: 'AI Viết - Đăng Bài', icon: 'post_add', path: '/content' },
    { name: 'AI Quảng Cáo', icon: 'campaign', path: '/ads' },
    { name: 'AI Bán Hàng', icon: 'smart_toy', path: '/auto-scripts' },
    { name: 'AI Thống Kê - Phân Tích', icon: 'insights', path: '/analytics' },
  ];
  
  const group3 = [
    { name: 'Hộp Thư', icon: 'forum', path: '/inbox' },
    { name: 'Đơn Hàng', icon: 'receipt_long', path: '/orders' },
    { name: 'Báo Cáo Telegram', icon: 'notifications_active', path: '/telegram' },
    { name: 'Gói Dịch Vụ', icon: 'workspace_premium', path: '/pricing' },
    ...(laQuanTri
      ? [{ name: 'Quản Trị Hệ Thống', icon: 'admin_panel_settings', path: '/admin' }]
      : []),
  ];

  const renderNavGroup = (items: any[]) => (
    <div className="flex flex-col relative" style={{ gap: '8px' }}>
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) => clsx(
            "relative flex items-center gap-3 px-3 rounded-lg transition-all duration-300 group overflow-hidden shrink-0 cursor-pointer"
          )}
          style={({ isActive }) => ({
            height: '40px',
            fontFamily: "'Be Vietnam Pro', sans-serif",
            fontSize: '15px',
            fontWeight: isActive ? 700 : 600,
            letterSpacing: '0.2px',
            color: isActive ? '#FFFFFF' : '#E8EDF2',
            background: isActive ? 'linear-gradient(90deg, rgba(0,229,255,0.15) 0%, rgba(0,229,255,0.01) 100%)' : 'transparent',
            borderTop: isActive ? '1px solid rgba(0,229,255,0.15)' : '1px solid transparent',
            borderRight: isActive ? '1px solid rgba(0,229,255,0.15)' : '1px solid transparent',
            borderBottom: isActive ? '1px solid rgba(0,229,255,0.15)' : '1px solid transparent',
            borderLeft: 'none',
            boxShadow: isActive ? 'inset 20px 0 40px -20px rgba(0,229,255,0.2)' : 'none',
          })}
        >
          {({ isActive }) => (
            <>
              {/* Hover background for inactive items */}
              {!isActive && (
                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              )}

              {/* Laser left border for active item */}
              {isActive && (
                <div className="absolute left-0 top-[15%] bottom-[15%] w-[3px] bg-[#00e5ff] rounded-r-md shadow-[0_0_15px_#00e5ff,0_0_5px_#ffffff] z-20"></div>
              )}

              {/* Icon */}
              <span 
                className="material-symbols-outlined relative z-10 transition-all duration-300 flex items-center justify-center w-6" 
                style={{
                  color: isActive ? '#00e5ff' : 'inherit',
                  strokeWidth: isActive ? 2.5 : 2,
                  fontSize: '24px',
                  ...(isActive ? { 
                    fontVariationSettings: "'FILL' 1",
                    filter: 'drop-shadow(0 0 10px rgba(0,229,255,0.8))'
                  } : {}),
                }}
              >
                {item.icon}
              </span> 
              
              {/* Text */}
              <span className={clsx("relative z-10 whitespace-nowrap transition-colors duration-300", !isActive && "group-hover:text-white")}>
                {item.name}
              </span>

              {/* Active ambient sweep inside the button */}
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#00e5ff]/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out"></div>
              )}
            </>
          )}
        </NavLink>
      ))}
    </div>
  );

  return (
    <>
    {/* Nền mờ sau ngăn kéo: bấm ra ngoài là đóng. Chỉ có trên điện thoại. */}
    {moKhung && (
      <div
        onClick={onDong}
        aria-hidden
        className="fixed inset-0 z-40 bg-black/60 lg:hidden"
      />
    )}
    <aside
      className={`w-72 h-screen fixed left-0 top-0 flex flex-col z-50 overflow-hidden bg-[#030509] transition-transform duration-300 lg:translate-x-0 ${moKhung ? 'translate-x-0' : '-translate-x-full'}`}
    >
      {/* Deep Space / Cyberpunk Ambient Background Effects */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#00e5ff]/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute top-[40%] -left-32 w-80 h-80 bg-[#d946ef]/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-[#00e5ff]/10 rounded-full blur-[100px] pointer-events-none"></div>
      
      {/* Subtle Grid Pattern for Tech Vibe */}
      <div 
        className="absolute inset-0 opacity-[0.02] pointer-events-none" 
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      ></div>

      {/* The Strongest Line: Neon Right Border */}
      <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-transparent via-[#00e5ff] to-transparent shadow-[0_0_20px_#00e5ff,0_0_40px_#00e5ff,0_0_10px_#ffffff] z-20"></div>

      {/* Main Content Wrapper */}
      <div className="relative z-10 px-5 h-full flex flex-col pt-6 pb-6">
        
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-3 shrink-0" style={{ marginBottom: '24px' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 relative overflow-hidden group border border-[#00e5ff]/30 bg-[#00e5ff]/10 shadow-[0_0_15px_rgba(0,229,255,0.2)]">
            <div className="absolute inset-0 bg-gradient-to-tr from-[#00e5ff]/20 to-transparent"></div>
            <span className="material-symbols-outlined text-[#00e5ff] text-[20px] relative z-10 filter drop-shadow-[0_0_5px_rgba(0,229,255,0.8)]">token</span>
          </div>
          <div>
            <h2 className="text-[18px] font-black tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/50 uppercase">LOGO</h2>
          </div>
        </div>

        {/* Fanpage Switcher */}
        <div className="shrink-0 relative" style={{ marginBottom: '24px' }}>
          <button
            onClick={() => setPageMenuOpen((open) => !open)}
            className="w-full flex items-center justify-between py-2.5 px-3 rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-md hover:border-[#00e5ff]/40 hover:bg-[#00e5ff]/5 hover:shadow-[0_0_20px_rgba(0,229,255,0.1)] transition-all duration-300 group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-surface-container to-surface flex items-center justify-center border border-white/10 font-mono text-[10px] text-white font-bold shrink-0 shadow-inner">
                {activeAccount ? (PLATFORM_BADGE[activeAccount.platform] ?? 'FP') : 'FP'}
              </div>
              <span className="font-body-md text-[14px] text-[#E8EDF2] group-hover:text-white transition-colors text-left truncate font-semibold tracking-wide">
                {activeAccount ? activeAccount.display_name : accounts.length ? 'Tất cả trang' : 'Chưa có trang nào'}
              </span>
            </div>
            <div className="flex flex-col -space-y-1 shrink-0">
              <span className="material-symbols-outlined text-[#E8EDF2] group-hover:text-[#00e5ff] transition-colors text-[16px] leading-none">keyboard_arrow_up</span>
              <span className="material-symbols-outlined text-[#E8EDF2] group-hover:text-[#00e5ff] transition-colors text-[16px] leading-none">keyboard_arrow_down</span>
            </div>
          </button>

          {pageMenuOpen && (
            <div className="absolute left-0 right-0 top-full mt-2 z-40 rounded-xl border border-[#00e5ff]/25 bg-[#0a1420] backdrop-blur-xl shadow-[0_0_24px_rgba(0,229,255,0.15)] overflow-hidden">
              <button
                onClick={() => { setActiveAccountId(null); setPageMenuOpen(false); }}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#00e5ff]/10',
                  !activeAccountId && 'bg-[#00e5ff]/10'
                )}
              >
                <div className="w-6 h-6 rounded-lg border border-white/10 flex items-center justify-center font-mono text-[10px] text-white shrink-0">ALL</div>
                <span className={clsx('text-[13px] font-semibold truncate', !activeAccountId ? 'text-[#00e5ff]' : 'text-[#E8EDF2]')}>
                  Tất cả trang
                </span>
              </button>

              {accounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => { setActiveAccountId(account.id); setPageMenuOpen(false); }}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#00e5ff]/10',
                    account.id === activeAccountId && 'bg-[#00e5ff]/10'
                  )}
                >
                  <div className="w-6 h-6 rounded-lg border border-white/10 flex items-center justify-center font-mono text-[10px] text-white shrink-0 overflow-hidden">
                    {account.profile_picture
                      ? <img src={account.profile_picture} alt="" className="w-full h-full object-cover"/>
                      : (PLATFORM_BADGE[account.platform] ?? '?')}
                  </div>
                  <span className={clsx('text-[13px] font-semibold truncate flex-1', account.id === activeAccountId ? 'text-[#00e5ff]' : 'text-[#E8EDF2]')}>
                    {account.display_name || account.username}
                  </span>
                  {!account.connected && (
                    <span className="text-[10px] text-[#ef4444] font-bold shrink-0">MẤT KẾT NỐI</span>
                  )}
                </button>
              ))}

              {accounts.length === 0 && (
                <button
                  onClick={() => { setPageMenuOpen(false); navigate('/connections'); }}
                  className="w-full px-3 py-3 text-left text-[13px] text-[#00e5ff] font-semibold hover:bg-[#00e5ff]/10 transition-colors"
                >
                  + Kết nối trang đầu tiên
                </button>
              )}
            </div>
          )}
        </div>

        {/* Main Nav */}
        <nav className="flex flex-col shrink-0">
          {renderNavGroup(group1)}
          <div style={{ height: '28px', flexShrink: 0 }}></div>
          {renderNavGroup(group2)}
          <div style={{ height: '28px', flexShrink: 0 }}></div>
          {renderNavGroup(group3)}
        </nav>

        {/* Spacer */}
        <div className="flex-1"></div>

        {/* CTA & Footer */}
        <div className="flex flex-col shrink-0 mt-4">
          <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.2), transparent)' }}></div>
          <div style={{ height: '16px' }}></div>
          <div className="flex flex-col" style={{ gap: '4px' }}>
            <a
              className="flex items-center gap-3 px-3 rounded-lg hover:bg-white/5 transition-colors group shrink-0"
              href={SUPPORT_URL}
              {...(IS_EXTERNAL_SUPPORT ? { target: '_blank', rel: 'noreferrer' } : {})}
              style={{
                color: 'rgba(232,237,242,0.4)',
                fontSize: '13px',
                fontWeight: 400,
                height: '40px',
                fontFamily: "'Be Vietnam Pro', sans-serif"
              }}
            >
              <span 
                className="material-symbols-outlined transition-colors group-hover:text-white flex items-center justify-center w-6" 
                style={{ strokeWidth: 1.5, color: 'inherit', fontSize: '20px' }}
              >
                help
              </span> 
              <span className="whitespace-nowrap group-hover:text-white transition-colors">Trợ giúp</span>
            </a>
            <button 
              className="flex items-center gap-3 px-3 rounded-lg hover:bg-[#ef4444]/10 hover:text-[#ef4444] transition-colors group shrink-0 w-full text-left" 
              onClick={onLogout}
              style={{ 
                color: 'rgba(232,237,242,0.4)', 
                fontSize: '13px', 
                fontWeight: 400, 
                height: '40px',
                fontFamily: "'Be Vietnam Pro', sans-serif"
              }}
            >
              <span 
                className="material-symbols-outlined transition-colors flex items-center justify-center w-6" 
                style={{ strokeWidth: 1.5, color: 'inherit', fontSize: '20px' }}
              >
                logout
              </span> 
              <span className="whitespace-nowrap transition-colors">Đăng xuất</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
    </>
  );
}
