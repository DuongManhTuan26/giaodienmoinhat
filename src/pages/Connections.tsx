import React, { useState, useRef } from 'react';
import { clsx } from 'clsx';
import { connectedAccounts, mockSubPagesToSelect, socialChannels, adChannels, communicationChannels } from '../data/mockApi';

export default function Connections() {
  const [bannerState, setBannerState] = useState<'normal' | 'warning' | 'danger'>('normal');
  const [connectStep, setConnectStep] = useState(0); // 0 = closed, 1-4 = steps
  const [selectedPlatform, setSelectedPlatform] = useState<{id: string, name: string, icon: string, connectionType?: string, selectionLabel?: string} | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const topGridRef = useRef<HTMLDivElement>(null);

  const handleOpenConnect = (platform?: {id: string, name: string, icon: string, connectionType?: string, selectionLabel?: string, requestedPermissions?: any[], publishOnly?: boolean, warnings?: string[], instructions?: string[]}) => {
    if (platform) {
      let fullPlatform = { ...platform };
      const allChannels = [...socialChannels, ...adChannels, ...communicationChannels];
      const found = allChannels.find(c => c.id === platform.id);
      
      if (!platform.connectionType) {
        if (found) {
          fullPlatform.connectionType = found.connectionType || 'oauth_simple';
          fullPlatform.selectionLabel = found.selectionLabel;
        } else {
          fullPlatform.connectionType = 'oauth_simple';
        }
      }
      
      if (found) {
        fullPlatform.requestedPermissions = found.requestedPermissions;
        fullPlatform.publishOnly = found.publishOnly;
        fullPlatform.warnings = found.warnings;
        fullPlatform.instructions = found.instructions;
      }

      setSelectedPlatform(fullPlatform);
      setConnectStep(2);
    } else {
      setSelectedPlatform(null);
      setConnectStep(1);
    }
    setLoginSuccess(false);
    setSelectedPages([]);
  };

  const handleSimulateLogin = () => {
    setIsLoggingIn(true);
    setTimeout(() => {
      setIsLoggingIn(false);
      setLoginSuccess(true);
      setTimeout(() => {
        if (selectedPlatform?.connectionType === 'oauth_simple') {
          setConnectStep(4);
        } else {
          setConnectStep(3);
        }
      }, 1000);
    }, 2000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Đang hoạt động': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'Sắp hết hạn': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'Mất kết nối': return 'bg-error/10 text-error border-error/20';
      case 'Thiếu quyền': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      default: return 'bg-surface-variant text-on-surface border-outline-variant';
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'Đang hoạt động': return 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]';
      case 'Sắp hết hạn': return 'bg-yellow-400';
      case 'Mất kết nối': return 'bg-error';
      case 'Thiếu quyền': return 'bg-orange-400';
      default: return 'bg-on-surface-variant';
    }
  };

  return (
    <main className="flex-1   p-8 bg-background relative  ">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-headline-sm text-3xl font-bold text-on-surface tracking-tight">Kết nối</h1>
            <span className="font-mono text-xs font-bold tracking-wider text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full uppercase">
              2/3 KÊNH ĐÃ KẾT NỐI
            </span>
          </div>
          <p className="text-on-surface-variant text-sm">Kết nối các kênh bán hàng để AI bắt đầu làm việc cho bạn</p>
        </div>
        <button 
          onClick={() => handleOpenConnect()}
          className="shrink-0 px-5 py-2.5 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          Kết nối kênh mới
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4" ref={topGridRef}>
        <label className="text-sm font-medium text-on-surface-variant flex items-center gap-2">
          [DEV] Chọn dải trạng thái: 
          <select 
            value={bannerState} 
            onChange={(e) => setBannerState(e.target.value as any)}
            className="bg-surface-container border border-outline-variant rounded px-2 py-1 text-on-surface focus:outline-none"
          >
            <option value="normal">Bình thường</option>
            <option value="warning">Sắp hết hạn</option>
            <option value="danger">Mất kết nối</option>
          </select>
        </label>
      </div>

      {/* Row 1: Status Banners */}
      <div className="mb-8">
        {bannerState === 'normal' && (
          <div className="bg-surface-container/30 border border-primary/30 shadow-[0_0_20px_rgba(0,229,255,0.05)] rounded-2xl p-5 flex items-center gap-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[80px] -z-10 rounded-full"></div>
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center shrink-0 border border-primary/20">
              <span className="material-symbols-outlined text-primary text-[24px]">shield</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-on-surface mb-0.5">Tất cả kết nối đang hoạt động tốt</h3>
              <p className="text-sm text-on-surface-variant font-medium">AI đang chạy trên 2 trang</p>
            </div>
          </div>
        )}

        {bannerState === 'warning' && (
          <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-yellow-500/10 rounded-full flex items-center justify-center shrink-0 border border-yellow-500/20">
                <span className="material-symbols-outlined text-yellow-400 text-[24px]">warning</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-yellow-400 mb-0.5">Có 1 kết nối sắp hết hạn</h3>
                <p className="text-sm text-on-surface-variant font-medium">Trang Fanpage B sẽ hết hạn sau 5 ngày. Gia hạn ngay để AI không bị gián đoạn.</p>
              </div>
            </div>
            <button className="shrink-0 px-5 py-2.5 bg-yellow-500 text-[#18181B] font-bold rounded-xl shadow-[0_4px_15px_rgba(234,179,8,0.3)] hover:scale-105 transition-transform whitespace-nowrap">
              Gia hạn ngay
            </button>
          </div>
        )}

        {bannerState === 'danger' && (
          <div className="bg-error/5 border border-error/30 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-error/10 rounded-full flex items-center justify-center shrink-0 border border-error/20">
                <span className="material-symbols-outlined text-error text-[24px]">gpp_bad</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-error mb-0.5">Có 1 kết nối đã mất, AI đã tự tạm dừng trên trang đó</h3>
                <p className="text-sm text-on-surface-variant font-medium">Tin nhắn khách vẫn được nhận và lưu lại, nhưng AI không trả lời được cho tới khi bạn kết nối lại.</p>
              </div>
            </div>
            <button className="shrink-0 px-5 py-2.5 bg-error text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(239,68,68,0.3)] hover:scale-105 transition-transform whitespace-nowrap">
              Kết nối lại ngay
            </button>
          </div>
        )}
      </div>

      {/* Available Channels Section */}
      <div className="mb-12">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-on-surface tracking-tight mb-2">Các kênh có thể kết nối</h2>
          <p className="text-sm font-medium text-on-surface-variant">Mỗi kênh kết nối tính là một lượt trong gói của bạn</p>
        </div>

        <div className="space-y-10">
          {/* Group 1 */}
          <div>
            <h3 className="text-lg font-bold text-on-surface flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary text-[20px]">share</span> 
              Mạng xã hội
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {socialChannels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => {
                    if (channel.connected) {
                      topGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } else {
                      handleOpenConnect({ id: channel.id, name: channel.name, icon: channel.icon });
                    }
                  }}
                  className={clsx(
                    "flex items-center gap-4 p-4 rounded-2xl border text-left w-full group relative transition-all duration-300",
                    channel.connected 
                      ? "bg-primary/5 border-primary/30 shadow-[0_0_15px_rgba(0,229,255,0.05)]" 
                      : "bg-surface-container border-outline-variant hover:bg-surface-container-high hover:border-outline"
                  )}
                >
                  <div className={clsx(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                    channel.connected ? "bg-primary/10 text-primary border border-primary/20" : "bg-on-surface/5 text-on-surface border border-outline-variant"
                  )}>
                    <span className="material-symbols-outlined text-[24px]">{channel.icon}</span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-[15px] text-on-surface truncate">{channel.name}</span>
                      {channel.publishOnly && (
                        <span className="shrink-0 bg-surface-container-highest text-on-surface-variant text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border border-outline-variant/50 flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[10px]">edit_note</span>
                          Chỉ đăng bài
                        </span>
                      )}
                      {channel.warnings && channel.warnings.length > 0 && (
                        <span className="shrink-0 bg-orange-500/10 text-orange-400 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border border-orange-500/20 flex items-center gap-0.5" title={channel.warnings[0]}>
                          <span className="material-symbols-outlined text-[10px]">warning</span>
                          Lưu ý
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      {channel.connected ? (
                        <>
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                          <span className="text-[12px] font-medium text-green-400">{channel.statusText || 'Đã kết nối'}</span>
                        </>
                      ) : (
                        <span className="text-[12px] font-medium text-on-surface-variant group-hover:text-on-surface transition-colors">{channel.statusText || 'Kết nối'}</span>
                      )}
                    </div>
                  </div>
                  
                  {channel.connected ? (
                     <span className="material-symbols-outlined text-green-500 text-[20px] shrink-0">check_circle</span>
                  ) : (
                     <span className="material-symbols-outlined text-on-surface-variant/40 group-hover:text-on-surface transition-colors text-[20px] shrink-0">add_circle</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Group 2 */}
          <div>
            <h3 className="text-lg font-bold text-on-surface flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary text-[20px]">campaign</span> 
              Tài khoản quảng cáo
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-3">
              {adChannels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => {
                    if (channel.connected) {
                      topGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } else {
                      handleOpenConnect({ id: channel.id, name: channel.name, icon: channel.icon });
                    }
                  }}
                  className={clsx(
                    "flex items-center gap-4 p-4 rounded-2xl border text-left w-full group relative transition-all duration-300",
                    channel.connected 
                      ? "bg-primary/5 border-primary/30 shadow-[0_0_15px_rgba(0,229,255,0.05)]" 
                      : "bg-surface-container border-outline-variant hover:bg-surface-container-high hover:border-outline"
                  )}
                >
                  <div className={clsx(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                    channel.connected ? "bg-primary/10 text-primary border border-primary/20" : "bg-on-surface/5 text-on-surface border border-outline-variant"
                  )}>
                    <span className="material-symbols-outlined text-[24px]">{channel.icon}</span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-[15px] text-on-surface truncate">{channel.name}</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      {channel.connected ? (
                        <>
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                          <span className="text-[12px] font-medium text-green-400">{channel.statusText || 'Đã kết nối'}</span>
                        </>
                      ) : (
                        <span className="text-[12px] font-medium text-on-surface-variant group-hover:text-on-surface transition-colors">{channel.statusText || 'Kết nối'}</span>
                      )}
                    </div>
                  </div>
                  
                  {channel.connected ? (
                     <span className="material-symbols-outlined text-green-500 text-[20px] shrink-0">check_circle</span>
                  ) : (
                     <span className="material-symbols-outlined text-on-surface-variant/40 group-hover:text-on-surface transition-colors text-[20px] shrink-0">add_circle</span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-sm font-medium text-on-surface-variant/70">Kết nối tài khoản quảng cáo để chạy và theo dõi chiến dịch ngay trong app, không cần mở trình quản lý quảng cáo riêng.</p>
          </div>

          {/* Group 3 */}
          <div>
            <h3 className="text-lg font-bold text-on-surface flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary text-[20px]">forum</span> 
              Tin nhắn và điện thoại
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-3">
              {communicationChannels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => {
                    if (channel.connected) {
                      topGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } else {
                      handleOpenConnect({ id: channel.id, name: channel.name, icon: channel.icon });
                    }
                  }}
                  className={clsx(
                    "flex items-center gap-4 p-4 rounded-2xl border text-left w-full group relative transition-all duration-300",
                    channel.connected 
                      ? "bg-primary/5 border-primary/30 shadow-[0_0_15px_rgba(0,229,255,0.05)]" 
                      : "bg-surface-container border-outline-variant hover:bg-surface-container-high hover:border-outline"
                  )}
                >
                  <div className={clsx(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                    channel.connected ? "bg-primary/10 text-primary border border-primary/20" : "bg-on-surface/5 text-on-surface border border-outline-variant"
                  )}>
                    <span className="material-symbols-outlined text-[24px]">{channel.icon}</span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-[15px] text-on-surface truncate">{channel.name}</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      {channel.connected ? (
                        <>
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                          <span className="text-[12px] font-medium text-green-400">{channel.statusText || 'Đã kết nối'}</span>
                        </>
                      ) : (
                        <span className="text-[12px] font-medium text-on-surface-variant group-hover:text-on-surface transition-colors">{channel.statusText || 'Kết nối'}</span>
                      )}
                    </div>
                  </div>
                  
                  {channel.connected ? (
                     <span className="material-symbols-outlined text-green-500 text-[20px] shrink-0">check_circle</span>
                  ) : (
                     <span className="material-symbols-outlined text-on-surface-variant/40 group-hover:text-on-surface transition-colors text-[20px] shrink-0">add_circle</span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-sm font-medium text-on-surface-variant/70">Dùng để nhắn tin hoặc gọi trực tiếp cho khách sau khi AI đã lấy được số điện thoại.</p>
          </div>
        </div>
      </div>
      {/* Connected Accounts Header */}
      <div className="mb-6 mt-12">
        <h2 className="text-2xl font-bold text-on-surface tracking-tight mb-2">Tài khoản đã kết nối</h2>
        <p className="text-sm font-medium text-on-surface-variant">Các tài khoản đang hoạt động và những trang thuộc về chúng</p>
      </div>

      {/* Row 2: Connections Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        
        {connectedAccounts.map(account => (
          <div key={account.id} className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6 flex flex-col hover:border-primary/30 transition-colors group relative overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between mb-6 pb-6 border-b border-outline-variant/50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-surface-variant rounded-full flex items-center justify-center shrink-0 border border-outline-variant/50 group-hover:scale-105 transition-transform">
                  <span className="material-symbols-outlined text-on-surface-variant text-[24px]">{account.platformIcon}</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-on-surface mb-0.5">{account.platformName} — {account.accountName}</h3>
                  <p className="text-sm text-on-surface-variant font-medium">Đang quản lý {account.pages.length} trang · Kết nối ngày {account.connectionDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={clsx("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border", getStatusColor(account.status))}>
                  <span className={clsx("w-1.5 h-1.5 rounded-full", getStatusDot(account.status))}></span>
                  {account.status}
                </span>
                <button className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-colors">
                  <span className="material-symbols-outlined text-[20px]">more_vert</span>
                </button>
              </div>
            </div>

            {/* Permissions or Disconnected Warning */}
            <div className="mb-6">
              {account.status === 'Mất kết nối' ? (
                <div className="bg-error/10 border border-error/30 rounded-xl p-4 flex items-start gap-3 mt-2">
                  <span className="material-symbols-outlined text-error shrink-0">warning</span>
                  <div>
                    <p className="text-sm font-bold text-error mb-1">
                      Kết nối đã hết hạn từ ngày {account.expiryDate}
                    </p>
                    <p className="text-xs text-error/90 leading-relaxed font-medium">
                      AI đã tự tạm dừng trên trang này. Tin nhắn và bình luận của khách vẫn được nhận và lưu lại, nhưng AI không trả lời được cho tới khi bạn kết nối lại.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <h4 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-3">QUYỀN ĐÃ CẤP TỪ TÀI KHOẢN NÀY</h4>
                  <div className="space-y-2">
                    {account.permissions.map((perm, idx) => {
                      let missingText = "";
                      if (!perm.granted) {
                        if (perm.name.includes("tin nhắn")) missingText = "Thiếu quyền này, AI không tư vấn và chốt đơn qua tin nhắn được.";
                        else if (perm.name.includes("bình luận") || perm.name.includes("Đọc và trả lời")) missingText = "Thiếu quyền này, AI không trả lời khách được.";
                        else if (perm.name.includes("Đăng")) missingText = "Thiếu quyền này, AI không đăng bài tự động được.";
                        else missingText = "Thiếu quyền này, một số tính năng sẽ bị giới hạn.";
                      }

                      return (
                        <div key={idx} className="flex flex-col">
                          <div className="flex items-center gap-3">
                            {perm.granted ? (
                              <span className="material-symbols-outlined text-green-400 text-[18px]">check</span>
                            ) : (
                              <span className="material-symbols-outlined text-error text-[18px]">close</span>
                            )}
                            <span className={clsx("text-sm font-medium", perm.granted ? "text-on-surface" : "text-error")}>
                              {perm.name}
                            </span>
                          </div>
                          {!perm.granted && missingText && (
                            <p className="text-xs font-bold text-orange-400 mt-1.5 pl-7">
                              {missingText}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Sub Pages List */}
            <div className="space-y-4 mb-6">
              {account.pages.map(page => (
                <div key={page.id} className="flex items-center justify-between p-4 rounded-xl bg-surface-container border border-outline-variant hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <img src={page.avatar} alt={page.name} className="w-10 h-10 rounded-full object-cover" />
                    <div>
                      <div className="text-base font-bold text-on-surface mb-1">{page.name}</div>
                      <div className="flex items-center gap-3">
                        <span className={clsx("text-[10px] font-bold uppercase tracking-wider", page.status === 'Đang hoạt động' ? 'text-green-400' : page.status === 'Sắp hết hạn' ? 'text-yellow-400' : 'text-error')}>
                          {page.status}
                        </span>
                        <span className="text-on-surface-variant text-xs font-medium">• {page.messagesProcessed} tin nhắn</span>
                        <span className="text-on-surface-variant text-xs font-medium">• {page.commentsReplied} bình luận</span>
                      </div>
                    </div>
                  </div>
                  <button className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-colors">
                    <span className="material-symbols-outlined text-[20px]">more_vert</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Footer Buttons */}
            <div className="mt-auto flex gap-3">
              <button 
                onClick={() => handleOpenConnect({ id: account.platformId, name: account.platformName, icon: account.platformIcon })}
                className="flex-1 py-2.5 px-4 bg-surface-container border border-outline-variant text-on-surface font-bold rounded-xl hover:bg-surface-variant transition-colors">
                Thêm trang từ tài khoản này
              </button>
              <button className="flex-1 py-2.5 px-4 bg-surface-container border border-error/50 text-error font-bold rounded-xl hover:bg-error/10 hover:border-error transition-colors">
                Ngắt kết nối cả tài khoản
              </button>
            </div>
          </div>
        ))}

        {/* Add New Page Card */}
        <button 
          onClick={() => handleOpenConnect()}
          className="border-2 border-dashed border-outline-variant hover:border-primary/50 bg-transparent rounded-2xl p-6 flex flex-col items-center justify-center min-h-[300px] group transition-colors"
        >
          <div className="w-16 h-16 rounded-full bg-surface-variant group-hover:bg-primary/10 flex items-center justify-center mb-4 transition-colors">
            <span className="material-symbols-outlined text-[32px] text-on-surface-variant group-hover:text-primary transition-colors">add</span>
          </div>
          <h3 className="text-xl font-bold text-on-surface mb-2 group-hover:text-primary transition-colors">Kết nối thêm kênh</h3>
          <p className="text-sm font-medium text-on-surface-variant">Gói hiện tại còn 1 lượt kết nối</p>
        </button>

      </div>

      {/* Connect Modal */}
      {connectStep > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setConnectStep(0)}></div>
          <div className={clsx("bg-surface-container-high border border-primary/30 rounded-2xl shadow-[0_0_40px_rgba(0,229,255,0.1)] relative z-10 animate-in zoom-in-95 duration-300 flex flex-col overflow-hidden transition-all max-h-[90vh]", connectStep === 1 ? "w-full max-w-4xl" : "w-full max-w-[560px]")}>
            
            <div className="flex items-center justify-between p-6 border-b border-outline-variant/50 shrink-0">
              <div className="flex gap-2">
                {connectStep === 1 ? (
                  <div className="h-1.5 rounded-full bg-primary w-12 shadow-[0_0_8px_rgba(0,229,255,0.4)]"></div>
                ) : selectedPlatform ? (
                  <>
                    {(selectedPlatform.connectionType === 'manual_credentials' || selectedPlatform.connectionType === 'access_code') ? (
                      <div className="h-1.5 rounded-full bg-primary w-12 shadow-[0_0_8px_rgba(0,229,255,0.4)]"></div>
                    ) : selectedPlatform.connectionType === 'oauth_simple' ? (
                      <>
                        <div className="h-1.5 rounded-full bg-primary w-12 shadow-[0_0_8px_rgba(0,229,255,0.4)]"></div>
                        <div className={clsx("h-1.5 rounded-full transition-all duration-300", connectStep >= 4 ? "bg-primary w-12 shadow-[0_0_8px_rgba(0,229,255,0.4)]" : "bg-surface-variant w-8")}></div>
                      </>
                    ) : (
                      <>
                        <div className="h-1.5 rounded-full bg-primary w-12 shadow-[0_0_8px_rgba(0,229,255,0.4)]"></div>
                        <div className={clsx("h-1.5 rounded-full transition-all duration-300", connectStep >= 3 ? "bg-primary w-12 shadow-[0_0_8px_rgba(0,229,255,0.4)]" : "bg-surface-variant w-8")}></div>
                        <div className={clsx("h-1.5 rounded-full transition-all duration-300", connectStep >= 4 ? "bg-primary w-12 shadow-[0_0_8px_rgba(0,229,255,0.4)]" : "bg-surface-variant w-8")}></div>
                      </>
                    )}
                  </>
                ) : null}
              </div>
              <button onClick={() => setConnectStep(0)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className={clsx("p-6 md:p-8 flex-1 overflow-y-auto custom-scrollbar", connectStep === 1 ? "max-h-[70vh]" : "")}>
              {connectStep === 1 && (
                <>
                  <h2 className="text-2xl font-bold text-on-surface mb-6">Bạn muốn kết nối nền tảng nào?</h2>
                  <div className="space-y-10">
                    <div>
                      <h3 className="font-mono text-sm font-bold tracking-wider text-on-surface-variant uppercase mb-4">MẠNG XÃ HỘI</h3>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                        {socialChannels.map((channel) => (
                          <button
                            key={channel.id}
                            onClick={() => setSelectedPlatform({ id: channel.id, name: channel.name, icon: channel.icon, connectionType: channel.connectionType || 'oauth_simple', selectionLabel: channel.selectionLabel })}
                            className={clsx(
                              "flex flex-col items-center justify-center p-4 rounded-xl border relative transition-all duration-200",
                              selectedPlatform?.id === channel.id 
                                ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(0,229,255,0.15)]" 
                                : "bg-surface-container border-outline-variant hover:bg-surface-container-high hover:border-outline"
                            )}
                          >
                            <span className={clsx("material-symbols-outlined text-[32px] mb-2", selectedPlatform?.id === channel.id ? "text-primary" : "text-on-surface")}>{channel.icon}</span>
                            <span className="text-xs font-bold text-on-surface text-center leading-tight">{channel.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-mono text-sm font-bold tracking-wider text-on-surface-variant uppercase mb-4">TÀI KHOẢN QUẢNG CÁO</h3>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                        {adChannels.map((channel) => (
                          <button
                            key={channel.id}
                            onClick={() => setSelectedPlatform({ id: channel.id, name: channel.name, icon: channel.icon, connectionType: channel.connectionType || 'oauth_simple', selectionLabel: channel.selectionLabel })}
                            className={clsx(
                              "flex flex-col items-center justify-center p-4 rounded-xl border relative transition-all duration-200",
                              selectedPlatform?.id === channel.id 
                                ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(0,229,255,0.15)]" 
                                : "bg-surface-container border-outline-variant hover:bg-surface-container-high hover:border-outline"
                            )}
                          >
                            <span className={clsx("material-symbols-outlined text-[32px] mb-2", selectedPlatform?.id === channel.id ? "text-primary" : "text-on-surface")}>{channel.icon}</span>
                            <span className="text-xs font-bold text-on-surface text-center leading-tight">{channel.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-mono text-sm font-bold tracking-wider text-on-surface-variant uppercase mb-4">TIN NHẮN VÀ ĐIỆN THOẠI</h3>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                        {communicationChannels.map((channel) => (
                          <button
                            key={channel.id}
                            onClick={() => setSelectedPlatform({ id: channel.id, name: channel.name, icon: channel.icon, connectionType: channel.connectionType || 'oauth_simple', selectionLabel: channel.selectionLabel })}
                            className={clsx(
                              "flex flex-col items-center justify-center p-4 rounded-xl border relative transition-all duration-200",
                              selectedPlatform?.id === channel.id 
                                ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(0,229,255,0.15)]" 
                                : "bg-surface-container border-outline-variant hover:bg-surface-container-high hover:border-outline"
                            )}
                          >
                            <span className={clsx("material-symbols-outlined text-[32px] mb-2", selectedPlatform?.id === channel.id ? "text-primary" : "text-on-surface")}>{channel.icon}</span>
                            <span className="text-xs font-bold text-on-surface text-center leading-tight">{channel.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-8 flex justify-end">
                    <button 
                      disabled={!selectedPlatform}
                      onClick={() => setConnectStep(2)}
                      className="py-3 px-8 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none"
                    >
                      Tiếp tục
                    </button>
                  </div>
                </>
              )}

              {connectStep === 2 && selectedPlatform?.connectionType === 'manual_credentials' && (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-[32px] text-primary">{selectedPlatform.icon}</span>
                  </div>
                  <h2 className="text-2xl font-bold text-on-surface mb-3">Kết nối {selectedPlatform.name}</h2>
                  {selectedPlatform.warnings && selectedPlatform.warnings.length > 0 && (
  <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 mb-6">
    <h3 className="font-bold text-orange-400 mb-2 flex items-center gap-2 text-sm">
      <span className="material-symbols-outlined text-[18px]">warning</span>
      LƯU Ý / HẠN CHẾ
    </h3>
    <ul className="list-disc list-inside text-sm text-orange-300/90 space-y-1.5 leading-relaxed">
      {selectedPlatform.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
    </ul>
  </div>
)}

{selectedPlatform.instructions && selectedPlatform.instructions.length > 0 && (
  <div className="space-y-4 mb-8">
    <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-4">HƯỚNG DẪN KẾT NỐI</h3>
    {selectedPlatform.instructions.map((inst: string, idx: number) => (
      <div key={idx} className="flex gap-4">
        <div className="w-7 h-7 rounded-full bg-surface-variant flex items-center justify-center text-sm font-bold text-on-surface shrink-0">{idx + 1}</div>
        <div className="pt-0.5 text-sm font-medium text-on-surface leading-relaxed" dangerouslySetInnerHTML={{__html: inst}} />
      </div>
    ))}
  </div>
)}

{selectedPlatform.id === 'bs' ? (
  <div className="space-y-4 mb-8">
    <div>
      <label className="block text-sm font-bold text-on-surface mb-2">Tên tài khoản (Handle)</label>
      <input type="text" placeholder="vidu.bsky.social" className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
    </div>
    <div>
      <label className="block text-sm font-bold text-on-surface mb-2">Mật khẩu ứng dụng</label>
      <input type="password" placeholder="••••••••••••" className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
    </div>
  </div>
) : (
  <div className="space-y-4 mb-8">
    <div>
      <label className="block text-sm font-bold text-on-surface mb-2">Account SID</label>
      <input type="text" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxx" className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
    </div>
    <div>
      <label className="block text-sm font-bold text-on-surface mb-2">Auth Token</label>
      <input type="password" placeholder="••••••••••••" className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
    </div>
  </div>
)}

                  <button 
                    onClick={() => {
                      setConnectStep(0);
                    }}
                    className="w-full py-3.5 px-4 bg-primary text-on-primary font-bold text-lg rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                  >
                    Kết nối
                  </button>
                </>
              )}

              {connectStep === 2 && selectedPlatform?.connectionType === 'access_code' && (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-[32px] text-primary">{selectedPlatform.icon}</span>
                  </div>
                  <h2 className="text-2xl font-bold text-on-surface mb-3">Kết nối {selectedPlatform.name}</h2>
                  {selectedPlatform.warnings && selectedPlatform.warnings.length > 0 && (
  <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 mb-6 mt-4">
    <h3 className="font-bold text-orange-400 mb-2 flex items-center gap-2 text-sm">
      <span className="material-symbols-outlined text-[18px]">warning</span>
      LƯU Ý / HẠN CHẾ
    </h3>
    <ul className="list-disc list-inside text-sm text-orange-300/90 space-y-1.5 leading-relaxed">
      {selectedPlatform.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
    </ul>
  </div>
)}

<div className="bg-surface-container border border-outline-variant/50 rounded-xl p-5 mb-8 text-center relative mt-4">
  <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-4">MÃ TRUY CẬP CỦA BẠN</h3>
  <div className="flex items-center justify-center gap-3 mb-3">
    <span className="text-3xl font-mono font-bold text-on-surface tracking-widest">ZRN-W8FFLZ</span>
    <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-variant text-on-surface hover:bg-surface-variant/80 transition-colors">
      <span className="material-symbols-outlined text-[20px]">content_copy</span>
    </button>
  </div>
  <div className="text-xs font-medium text-orange-400">Mã này hết hạn sau 15 phút</div>
</div>

{selectedPlatform.instructions && selectedPlatform.instructions.length > 0 && (
  <div className="space-y-4 mb-8">
    <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-4">HƯỚNG DẪN KẾT NỐI</h3>
    {selectedPlatform.instructions.map((inst: string, idx: number) => (
      <div key={idx} className="flex gap-4">
        <div className="w-7 h-7 rounded-full bg-surface-variant flex items-center justify-center text-sm font-bold text-on-surface shrink-0">{idx + 1}</div>
        <div className="pt-0.5 text-sm font-medium text-on-surface leading-relaxed" dangerouslySetInnerHTML={{__html: inst}} />
      </div>
    ))}
  </div>
)}

                  <div className="flex items-center justify-center gap-2 text-sm font-bold text-primary mt-8 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-primary"></span>
                    Đang chờ kết nối...
                  </div>
                </>
              )}

              {connectStep === 2 && selectedPlatform && (selectedPlatform.connectionType === 'oauth_simple' || selectedPlatform.connectionType === 'oauth_with_selection') && (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-[32px] text-primary">{selectedPlatform.icon}</span>
                  </div>
                  <h2 className="text-2xl font-bold text-on-surface mb-3">Đăng nhập tài khoản {selectedPlatform.name}</h2>
                  <p className="text-on-surface-variant font-medium leading-relaxed mb-8">
                    Bạn sẽ được chuyển sang {selectedPlatform.name} để đăng nhập. Chúng tôi không nhìn thấy mật khẩu của bạn.
                  </p>

                  {selectedPlatform.warnings && selectedPlatform.warnings.length > 0 && (
  <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 mb-8">
    <h3 className="font-bold text-orange-400 mb-2 flex items-center gap-2 text-sm">
      <span className="material-symbols-outlined text-[18px]">warning</span>
      LƯU Ý / HẠN CHẾ
    </h3>
    <ul className="list-disc list-inside text-sm text-orange-300/90 space-y-1.5 leading-relaxed">
      {selectedPlatform.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
    </ul>
  </div>
)}

{selectedPlatform.instructions && selectedPlatform.instructions.length > 0 ? (
  <div className="space-y-4 mb-8">
    <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-4">HƯỚNG DẪN KẾT NỐI</h3>
    {selectedPlatform.instructions.map((inst: string, idx: number) => (
      <div key={idx} className="flex gap-4">
        <div className="w-7 h-7 rounded-full bg-surface-variant flex items-center justify-center text-sm font-bold text-on-surface shrink-0">{idx + 1}</div>
        <div className="pt-0.5 text-sm font-medium text-on-surface leading-relaxed" dangerouslySetInnerHTML={{__html: inst}} />
      </div>
    ))}
  </div>
) : (
  <div className="space-y-4 mb-8">
    <div className="flex gap-4">
      <div className="w-7 h-7 rounded-full bg-surface-variant flex items-center justify-center text-sm font-bold text-on-surface shrink-0">1</div>
      <div className="pt-0.5 text-sm font-medium text-on-surface">Bấm nút bên dưới, một cửa sổ {selectedPlatform.name} sẽ mở ra</div>
    </div>
    <div className="flex gap-4">
      <div className="w-7 h-7 rounded-full bg-surface-variant flex items-center justify-center text-sm font-bold text-on-surface shrink-0">2</div>
      <div className="pt-0.5 text-sm font-medium text-on-surface">
        Đăng nhập tài khoản {selectedPlatform.name} của bạn
      </div>
    </div>
    <div className="flex gap-4">
      <div className="w-7 h-7 rounded-full bg-surface-variant flex items-center justify-center text-sm font-bold text-on-surface shrink-0">3</div>
      <div className="pt-0.5 text-sm font-medium text-on-surface">Cấp đủ các quyền được yêu cầu</div>
    </div>
  </div>
)}

                  <div className="bg-surface-container border border-outline-variant/50 rounded-xl p-5 mb-8">
                    <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-4">CÁC QUYỀN SẼ ĐƯỢC XIN</h3>
                    <div className="space-y-4">
                      {(selectedPlatform.requestedPermissions || [
                        { icon: 'api', name: `Truy cập API ${selectedPlatform.name}`, desc: 'Cho phép Zernio kết nối và trao đổi dữ liệu với tài khoản của bạn.' },
                        { icon: 'manage_accounts', name: 'Quản lý tài nguyên', desc: 'Đọc thông tin, danh sách trang và thiết lập để AI có thể hoạt động.' }
                      ]).map((perm: any, idx: number) => (
                        <div key={idx} className="flex gap-3">
                          <span className="material-symbols-outlined text-primary text-[20px]">{perm.icon || 'api'}</span>
                          <div>
                            <div className="text-sm font-bold text-on-surface mb-0.5">{perm.name}</div>
                            <div className="text-xs text-on-surface-variant leading-relaxed">{perm.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-8">
                    {!loginSuccess ? (
                      <button 
                        onClick={handleSimulateLogin}
                        disabled={isLoggingIn}
                        className="w-full py-3.5 px-4 bg-primary text-on-primary font-bold text-lg rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 disabled:opacity-80 disabled:hover:scale-100"
                      >
                        {isLoggingIn ? (
                          <>
                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            Đang kết nối...
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined">link</span>
                            Đăng nhập với {selectedPlatform.name}
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="w-full py-3.5 px-4 bg-green-500/10 border border-green-500/30 text-green-400 font-bold text-lg rounded-xl flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined">check_circle</span>
                        Đã đăng nhập: Hoàng Tuấn
                      </div>
                    )}
                  </div>
                </>
              )}

              {connectStep === 3 && selectedPlatform && selectedPlatform.connectionType === 'oauth_with_selection' && (
                <>
                  <h2 className="text-2xl font-bold text-on-surface mb-2">Chọn {selectedPlatform.selectionLabel} muốn kết nối</h2>
                  <p className="text-on-surface-variant font-medium leading-relaxed mb-6">
                    Tài khoản Hoàng Tuấn đang quản lý 5 {selectedPlatform.selectionLabel?.toLowerCase()}. Mỗi {selectedPlatform.selectionLabel?.toLowerCase()} kết nối tính là một lượt trong gói của bạn.
                  </p>

                  <div className="space-y-3 mb-6">
                    {mockSubPagesToSelect.map(page => (
                      <label key={page.id} className={clsx("flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer", page.connected ? "bg-surface-variant/50 border-outline-variant/30 opacity-70" : selectedPages.includes(page.id) ? "bg-primary/5 border-primary shadow-[0_0_10px_rgba(0,229,255,0.1)]" : "bg-surface-container border-outline-variant hover:border-outline")}>
                        <div className="flex-1 flex items-center gap-4">
                          <img src={page.avatar} alt={page.name} className="w-12 h-12 rounded-full object-cover border border-outline-variant/50" />
                          <div>
                            <div className="text-base font-bold text-on-surface mb-0.5">{page.name}</div>
                            <div className="text-sm text-on-surface-variant">{page.followers} người theo dõi</div>
                          </div>
                        </div>
                        {page.connected ? (
                          <div className="text-sm font-bold text-on-surface-variant bg-surface px-3 py-1 rounded-full border border-outline-variant/50">Đã kết nối</div>
                        ) : (
                          <div className={clsx("w-6 h-6 rounded-md flex items-center justify-center border-2 transition-colors", selectedPages.includes(page.id) ? "bg-primary border-primary text-on-primary" : "bg-transparent border-outline-variant")}>
                            {selectedPages.includes(page.id) && <span className="material-symbols-outlined text-[16px] font-bold">check</span>}
                          </div>
                        )}
                        {!page.connected && (
                          <input 
                            type="checkbox" 
                            className="hidden" 
                            checked={selectedPages.includes(page.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                if (selectedPages.length < 1) {
                                  setSelectedPages([...selectedPages, page.id]);
                                }
                              } else {
                                setSelectedPages(selectedPages.filter(id => id !== page.id));
                              }
                            }}
                          />
                        )}
                      </label>
                    ))}
                  </div>

                  <div className="flex items-center justify-between p-4 bg-surface-container rounded-xl border border-outline-variant">
                    <div className="text-sm">
                      <span className="text-on-surface-variant">Đã chọn: </span>
                      <span className="font-bold text-on-surface">{selectedPages.length} {selectedPlatform.selectionLabel?.toLowerCase()}</span>
                    </div>
                    {selectedPages.length >= 1 ? (
                      <div className="text-sm font-medium text-orange-400 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px]">info</span>
                        Gói của bạn đã hết lượt
                      </div>
                    ) : (
                      <div className="text-sm font-medium text-on-surface-variant">
                        Gói của bạn còn <span className="text-on-surface font-bold">1</span> lượt kết nối
                      </div>
                    )}
                  </div>

                  <div className="mt-8 flex gap-3 justify-end">
                    <button 
                      onClick={() => setConnectStep(2)}
                      className="py-3 px-6 bg-surface-container border border-outline-variant text-on-surface font-bold rounded-xl hover:bg-surface-variant transition-colors"
                    >
                      Quay lại
                    </button>
                    <button 
                      disabled={selectedPages.length === 0}
                      onClick={() => setConnectStep(4)}
                      className="py-3 px-8 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none"
                    >
                      Tiếp tục
                    </button>
                  </div>
                </>
              )}

              {connectStep === 4 && selectedPlatform && (selectedPlatform.connectionType === 'oauth_simple' || selectedPlatform.connectionType === 'oauth_with_selection') && (
                <>
                  <h2 className="text-2xl font-bold text-on-surface mb-8 text-center">Xác nhận kết nối</h2>
                  
                  <div className="bg-surface-container border border-outline-variant rounded-2xl p-6 mb-8 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary"></div>
                    <div className="flex items-center gap-4 mb-6 pb-6 border-b border-outline-variant/50">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[24px] text-primary">{selectedPlatform.icon}</span>
                      </div>
                      <div>
                        <div className="text-sm text-on-surface-variant mb-1">Nền tảng & Tài khoản</div>
                        <div className="text-lg font-bold text-on-surface">{selectedPlatform.name} — Hoàng Tuấn</div>
                      </div>
                    </div>
                    
                    {selectedPlatform.connectionType === 'oauth_with_selection' && (
                      <div>
                        <div className="text-sm text-on-surface-variant mb-4">Các {selectedPlatform.selectionLabel?.toLowerCase()} sẽ được kết nối:</div>
                        <div className="space-y-3">
                          {mockSubPagesToSelect.filter(p => selectedPages.includes(p.id)).map(page => (
                            <div key={page.id} className="flex items-center gap-3">
                              <span className="material-symbols-outlined text-green-400 text-[18px]">check_circle</span>
                              <img src={page.avatar} alt={page.name} className="w-6 h-6 rounded-full object-cover" />
                              <span className="font-bold text-on-surface">{page.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-8 flex gap-3">
                    {selectedPlatform.connectionType === 'oauth_with_selection' && (
                      <button 
                        onClick={() => setConnectStep(3)}
                        className="flex-1 py-3.5 px-4 bg-surface-container border border-outline-variant text-on-surface font-bold text-lg rounded-xl hover:bg-surface-variant transition-colors"
                      >
                        Quay lại
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        setConnectStep(0);
                      }}
                      className="flex-1 py-3.5 px-4 bg-primary text-on-primary font-bold text-lg rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                    >
                      Hoàn tất kết nối
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}