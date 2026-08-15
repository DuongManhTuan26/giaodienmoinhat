import React from 'react';

export default function SetupComplete({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-background relative overflow-hidden p-4">
      {/* Background glow - using green tint for success */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#10b981]/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="glass-card ai-border rounded-xl w-full max-w-[480px] p-xl flex flex-col items-center relative z-10 text-center border-[#10b981]/30 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
        
        {/* Big checkmark */}
        <div className="w-20 h-20 bg-[#10b981]/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(16,185,129,0.4)] border border-[#10b981]/50">
          <span className="material-symbols-outlined text-[#10b981] text-[48px]">check</span>
        </div>

        <h2 className="font-display-lg text-on-surface mb-8">Mọi thứ đã sẵn sàng</h2>

        {/* List of completed items */}
        <div className="flex flex-col gap-3 w-full text-left mb-xl">
          <div className="flex items-center gap-3 bg-surface-container p-4 rounded-lg border border-[#10b981]/20">
            <span className="material-symbols-outlined text-[#10b981]">check_circle</span>
            <span className="font-body-lg text-on-surface font-bold">Đã kết nối kênh bán hàng</span>
          </div>
          <div className="flex items-center gap-3 bg-surface-container p-4 rounded-lg border border-[#10b981]/20">
            <span className="material-symbols-outlined text-[#10b981]">check_circle</span>
            <span className="font-body-lg text-on-surface font-bold">AI đã được cấu hình và thử nghiệm</span>
          </div>
          <div className="flex items-center gap-3 bg-surface-container p-4 rounded-lg border border-[#10b981]/20">
            <span className="material-symbols-outlined text-[#10b981]">check_circle</span>
            <span className="font-body-lg text-on-surface font-bold">Telegram đã kết nối</span>
          </div>
        </div>

        <button 
          onClick={onFinish} 
          className="w-full py-4 bg-gradient-to-r from-[#10b981] to-[#059669] text-background font-label-sm rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:shadow-[0_0_25px_rgba(16,185,129,0.6)] hover:brightness-110 transition-all font-bold mb-6 text-lg"
        >
          Vào Bảng điều khiển
        </button>

        <div className="w-full border border-outline-variant p-4 rounded-lg bg-surface-container-low text-center">
          <p className="font-body-md text-on-surface-variant text-sm">Lưu ý: Tự động trả lời hiện đang TẮT. Bạn tự bật khi đã sẵn sàng.</p>
        </div>
      </div>
    </div>
  );
}
