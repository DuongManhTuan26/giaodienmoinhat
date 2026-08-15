import React, { useState } from 'react';

export default function Onboarding({ onComplete, onSkip }: { onComplete: () => void, onSkip: () => void }) {
  const [completedSteps, setCompletedSteps] = useState(0);

  const handleNext = () => {
    if (completedSteps < 2) {
      setCompletedSteps(prev => prev + 1);
    } else if (completedSteps === 2) {
      setCompletedSteps(3);
      setTimeout(onComplete, 600); // Delay slightly to show the final checkmark
    }
  };

  const steps = [
    {
      title: "Kết nối kênh bán hàng",
      desc: "Để AI đọc được tin nhắn và bình luận của khách"
    },
    {
      title: "Dạy AI cách bán hàng",
      desc: "Nhập sản phẩm, giá, và cách bạn muốn AI tư vấn"
    },
    {
      title: "Kết nối Telegram",
      desc: "Để nhận thông báo đơn hàng ngay trên điện thoại"
    }
  ];

  return (
    <div className="h-screen w-full flex items-center justify-center bg-background relative overflow-hidden p-4">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="glass-card ai-border rounded-xl w-full max-w-[560px] p-xl relative z-10 shadow-[0_0_30px_rgba(0,229,255,0.05)]">
        <h2 className="font-display-lg text-on-surface text-center mb-2">Chào mừng! Hoàn thành 3 bước để bắt đầu</h2>
        <p className="font-body-lg text-on-surface-variant text-center mb-xl">Mất khoảng 5 phút, sau đó AI bắt đầu làm việc cho bạn</p>

        <div className="flex flex-col gap-4 mb-xl">
          {steps.map((step, idx) => {
            const isCompleted = completedSteps > idx;
            const isLocked = completedSteps < idx;
            const isActive = completedSteps === idx;
            
            return (
              <div 
                key={idx} 
                className={`flex items-center gap-4 p-4 rounded-lg border transition-all duration-300 ${isActive ? 'bg-surface-container border-primary shadow-[0_0_15px_rgba(0,229,255,0.1)]' : isLocked ? 'bg-surface-container-low border-outline-variant opacity-50' : 'bg-surface-container-high border-[#10b981]/30'}`}
              >
                {/* Number / Status Icon */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-label-sm font-bold transition-colors ${isCompleted ? 'bg-[#10b981] text-background' : isActive ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant'}`}>
                  {isCompleted ? <span className="material-symbols-outlined text-[18px]">check</span> : idx + 1}
                </div>
                
                {/* Content */}
                <div className="flex-1">
                  <p className={`font-body-lg font-bold transition-colors ${isCompleted ? 'text-on-surface' : isActive ? 'text-primary' : 'text-on-surface-variant'}`}>{step.title}</p>
                  <p className="font-body-md text-on-surface-variant text-sm mt-0.5">{step.desc}</p>
                </div>

                {/* Right Status */}
                <div className="flex items-center">
                  {isCompleted ? (
                    <span className="material-symbols-outlined text-[#10b981] text-[24px]">check_circle</span>
                  ) : isLocked ? (
                    <div title="Hoàn thành bước trước đã" className="cursor-not-allowed">
                      <span className="material-symbols-outlined text-on-surface-variant text-[24px] opacity-60">lock</span>
                    </div>
                  ) : (
                    <span className="material-symbols-outlined text-primary text-[24px] opacity-80">radio_button_unchecked</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-8">
          <button 
            onClick={onSkip} 
            className="font-body-md text-on-surface-variant hover:text-on-surface transition-colors bg-transparent border-none p-0 cursor-pointer"
          >
            Để sau, tôi muốn xem trước
          </button>
          <button 
            onClick={handleNext} 
            className="px-lg py-3 bg-gradient-to-r from-primary to-primary-container text-on-primary font-label-sm rounded-lg shadow-[0_0_15px_rgba(0,229,255,0.4)] hover:shadow-[0_0_25px_rgba(0,229,255,0.6)] hover:brightness-110 transition-all font-bold"
          >
            Bắt đầu ngay
          </button>
        </div>
      </div>
    </div>
  );
}
