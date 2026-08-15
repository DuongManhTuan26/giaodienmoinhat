import React, { useState } from 'react';
import { clsx } from 'clsx';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { mockAdsChartData, mockAdsCampaigns, mockAdsAudiences, mockAdsPosts } from '../data/mockApi';
import AITrainingModal from '../components/AITrainingModal';

export default function Ads() {
  const [filter, setFilter] = useState('Tất cả');
  const [isFlowOpen, setIsFlowOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isAudienceFlowOpen, setIsAudienceFlowOpen] = useState(false);
  const [isTrainingOpen, setIsTrainingOpen] = useState(false);
  
  // Create Audience Form State
  const [audName, setAudName] = useState('');
  const [audType, setAudType] = useState('custom');
  const [audCustomSources, setAudCustomSources] = useState<string[]>([]);
  const [audLookalikeSource, setAudLookalikeSource] = useState('Khách đã mua');
  const [audLookalikePercent, setAudLookalikePercent] = useState(3);
  const [audInterests, setAudInterests] = useState<string[]>([]);
  const [audNewInterest, setAudNewInterest] = useState('');

  const handleToggleCustomSource = (source: string) => {
    setAudCustomSources(prev => 
      prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source]
    );
  };

  const handleAddInterest = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && audNewInterest.trim()) {
      e.preventDefault();
      setAudInterests([...audInterests, audNewInterest.trim()]);
      setAudNewInterest('');
    }
  };

  const handleRemoveInterest = (idx: number) => {
    setAudInterests(audInterests.filter((_, i) => i !== idx));
  };
  
  // Form state
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [dailyBudget, setDailyBudget] = useState<number>(300000);
  const [duration, setDuration] = useState<number>(5);
  const [audienceType, setAudienceType] = useState('custom');
  const [location, setLocation] = useState('Toàn quốc');
  const [ageRange, setAgeRange] = useState([25, 45]);
  const [gender, setGender] = useState('Tất cả');

  const openFlow = () => {
    setIsFlowOpen(true);
    setCurrentStep(1);
    setIsSuccess(false);
  };
  
  const closeFlow = () => {
    setIsFlowOpen(false);
  };
  
  const filteredCampaigns = mockAdsCampaigns.filter(camp => {
    if (filter === 'Tất cả') return true;
    return camp.status === filter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Đang chạy': return 'bg-green-500/20 text-green-400';
      case 'Tạm dừng': return 'bg-yellow-500/20 text-yellow-400';
      case 'Đã kết thúc': return 'bg-surface-variant text-on-surface-variant';
      default: return 'bg-surface-variant text-on-surface';
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'Đang chạy': return 'bg-green-400';
      case 'Tạm dừng': return 'bg-yellow-400';
      case 'Đã kết thúc': return 'bg-on-surface-variant';
      default: return 'bg-on-surface-variant';
    }
  };

  return (
    <main className="flex-1  p-6 md:p-8 max-w-7xl mx-auto w-full relative    bg-background">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-headline-sm text-3xl font-bold text-on-surface tracking-tight">AI Quảng Cáo</h1>
            <span className="font-mono text-xs font-bold tracking-wider text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full uppercase">
              4 CHIẾN DỊCH ĐANG CHẠY
            </span>
          </div>
          <p className="text-on-surface-variant text-sm">Chạy quảng cáo để kéo thêm khách vào bình luận và nhắn tin</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsTrainingOpen(true)}
            className="px-4 py-2 bg-surface-container text-primary border border-primary/30 font-bold rounded-lg hover:bg-primary/10 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">model_training</span>
            Huấn luyện AI
          </button>
          <select className="bg-surface-container border border-outline-variant rounded-lg px-4 py-2 text-sm text-on-surface font-medium focus:outline-none focus:border-primary">
            <option>30 ngày qua</option>
            <option>7 ngày qua</option>
            <option>Tháng này</option>
          </select>
          <button onClick={openFlow} className="shrink-0 px-4 py-2 bg-primary text-on-primary font-bold rounded-lg shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">add</span>
            Tạo quảng cáo
          </button>
        </div>
      </div>

      {/* Row 1: Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors h-[140px]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/10 blur-2xl rounded-full group-hover:bg-blue-500/20 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">TỔNG CHI TIÊU</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-3xl font-bold text-on-surface">12.450.000 đ</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-green-400 bg-green-400/10 self-start px-2 py-1 rounded-md mt-auto">
            <span className="material-symbols-outlined text-[14px]">trending_up</span>
            +5,2% so với tháng trước
          </div>
        </div>

        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors h-[140px]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-purple-500/10 blur-2xl rounded-full group-hover:bg-purple-500/20 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">LƯỢT TIẾP CẬN</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-3xl font-bold text-on-surface">1.2 triệu</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-green-400 bg-green-400/10 self-start px-2 py-1 rounded-md mt-auto">
            <span className="material-symbols-outlined text-[14px]">trending_up</span>
            +12,4%
          </div>
        </div>

        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors h-[140px]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-orange-500/10 blur-2xl rounded-full group-hover:bg-orange-500/20 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">BÌNH LUẬN THU ĐƯỢC</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-3xl font-bold text-on-surface">842</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">Đã nhắn tin 784 người</p>
          </div>
        </div>

        {/* Highlighted Card */}
        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/60 transition-colors h-[140px] shadow-[0_0_20px_rgba(0,229,255,0.1)]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/20 blur-2xl rounded-full group-hover:bg-primary/30 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase mb-1">ĐƠN CHỐT TỪ QUẢNG CÁO</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-3xl font-bold text-on-surface">47</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">Chi phí 264.893 đ mỗi đơn</p>
          </div>
        </div>
      </div>

      {/* Row 2: Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <button onClick={openFlow} className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6 text-left flex gap-5 items-start group hover:border-primary/50 transition-colors hover:bg-surface-container/50">
          <div className="w-14 h-14 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-3xl text-blue-400">rocket_launch</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-on-surface mb-2">Đẩy bài đã đăng</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Chọn một bài đang có tương tác tốt và trả tiền để nhiều người thấy hơn. Cách nhanh và đơn giản nhất.
            </p>
          </div>
        </button>

        <button onClick={openFlow} className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6 text-left flex gap-5 items-start group hover:border-primary/50 transition-colors hover:bg-surface-container/50">
          <div className="w-14 h-14 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-3xl text-purple-400">stars</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-on-surface mb-2">Tạo chiến dịch mới</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Tự làm nội dung quảng cáo riêng, không cần đăng bài lên trang trước. Kiểm soát được nhiều hơn.
            </p>
          </div>
        </button>
      </div>

      {/* Row 3: Performance Chart */}
      <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6 mb-8 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-on-surface">Hiệu quả chiến dịch</h2>
          <button className="font-mono text-xs font-bold text-primary hover:brightness-110 uppercase tracking-wider">
            XEM CHI TIẾT →
          </button>
        </div>
        <div className="w-full h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mockAdsChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorReach" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#00E5FF" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#A1A1AA', fontSize: 12 }} dy={10} />
              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#A1A1AA', fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#A1A1AA', fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#18181B', borderColor: '#27272A', borderRadius: '12px', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
              />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', color: '#A1A1AA' }} />
              <Area yAxisId="left" type="monotone" dataKey="reach" name="Lượt tiếp cận" stroke="#00E5FF" strokeWidth={2} fillOpacity={1} fill="url(#colorReach)" />
              <Area yAxisId="right" type="monotone" dataKey="orders" name="Đơn chốt" stroke="#8B5CF6" strokeWidth={2} fillOpacity={1} fill="url(#colorOrders)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 4: Campaigns List */}
      <div className="bg-surface-container/30 border border-outline-variant rounded-2xl overflow-hidden mb-8">
        <div className="p-6 border-b border-outline-variant/50">
          <div className="flex flex-wrap gap-2">
            {['Tất cả', 'Đang chạy', 'Tạm dừng', 'Đã kết thúc'].map(opt => (
              <button 
                key={opt}
                onClick={() => setFilter(opt)}
                className={clsx(
                  "px-4 py-1.5 rounded-full text-sm font-bold transition-colors",
                  filter === opt 
                    ? "bg-on-surface text-surface" 
                    : "bg-surface-container border border-outline-variant text-on-surface hover:bg-surface-variant"
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto ">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-surface-container/20 border-b border-outline-variant/50">
                <th className="p-4 font-mono text-[11px] font-bold text-on-surface-variant tracking-wider whitespace-nowrap uppercase">Tên chiến dịch</th>
                <th className="p-4 font-mono text-[11px] font-bold text-on-surface-variant tracking-wider whitespace-nowrap uppercase">Loại</th>
                <th className="p-4 font-mono text-[11px] font-bold text-on-surface-variant tracking-wider whitespace-nowrap uppercase">Ngân sách</th>
                <th className="p-4 font-mono text-[11px] font-bold text-on-surface-variant tracking-wider whitespace-nowrap uppercase">Đã chi</th>
                <th className="p-4 font-mono text-[11px] font-bold text-on-surface-variant tracking-wider whitespace-nowrap uppercase">Tiếp cận</th>
                <th className="p-4 font-mono text-[11px] font-bold text-on-surface-variant tracking-wider whitespace-nowrap uppercase">Bình luận</th>
                <th className="p-4 font-mono text-[11px] font-bold text-on-surface-variant tracking-wider whitespace-nowrap uppercase">Đơn chốt</th>
                <th className="p-4 font-mono text-[11px] font-bold text-on-surface-variant tracking-wider whitespace-nowrap uppercase">Trạng thái</th>
                <th className="p-4 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50">
              {filteredCampaigns.map(camp => (
                <tr key={camp.id} className="hover:bg-surface-variant/30 transition-colors group">
                  <td className="p-4">
                    <p className="font-bold text-sm text-on-surface mb-0.5">{camp.name}</p>
                    <p className="text-xs text-on-surface-variant">{camp.startDate}</p>
                  </td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 bg-surface-container border border-outline-variant text-on-surface font-medium text-xs rounded-full whitespace-nowrap">
                      {camp.type}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-on-surface font-medium whitespace-nowrap">{camp.budget}</td>
                  <td className="p-4 min-w-[150px]">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-on-surface">{camp.spent.current}</span>
                      <span className="text-on-surface-variant">/ {camp.spent.total}</span>
                    </div>
                    <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full" 
                        style={{ width: `${camp.spent.percent}%` }}
                      ></div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-on-surface font-medium">{camp.reach}</td>
                  <td className="p-4 text-sm text-on-surface font-medium">{camp.comments}</td>
                  <td className="p-4 text-sm font-bold text-primary">{camp.orders}</td>
                  <td className="p-4">
                    <span className={clsx("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap", getStatusColor(camp.status))}>
                      <span className={clsx("w-1.5 h-1.5 rounded-full", getStatusDot(camp.status))}></span>
                      {camp.status}
                    </span>
                  </td>
                  <td className="p-4 relative">
                    <button className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant rounded-md transition-colors opacity-0 group-hover:opacity-100 peer">
                      <span className="material-symbols-outlined text-[20px]">more_vert</span>
                    </button>
                    <div className="absolute right-8 top-1/2 -translate-y-1/2 w-48 bg-surface-container-high border border-outline-variant rounded-xl shadow-xl py-1 opacity-0 invisible peer-hover:opacity-100 peer-hover:visible hover:opacity-100 hover:visible transition-all z-10">
                      <button className="w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-variant transition-colors">Xem chi tiết</button>
                      <button className="w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-variant transition-colors">Sửa ngân sách</button>
                      <button className="w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-variant transition-colors">Tạm dừng</button>
                      <button className="w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-variant transition-colors">Nhân bản</button>
                      <div className="h-px bg-outline-variant/50 my-1"></div>
                      <button className="w-full text-left px-4 py-2 text-sm text-error hover:bg-error/10 transition-colors">Kết thúc</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredCampaigns.length === 0 && (
            <div className="p-8 text-center text-on-surface-variant text-sm">
              Không có chiến dịch nào phù hợp với bộ lọc.
            </div>
          )}
        </div>
      </div>

      {/* Row 5: Audiences */}
      <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-on-surface">Tệp đối tượng đã lưu</h2>
          <button onClick={() => setIsAudienceFlowOpen(true)} className="px-3 py-1.5 border border-outline-variant text-on-surface font-bold text-sm rounded-lg hover:bg-surface-variant transition-colors flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">add</span>
            Tạo tệp mới
          </button>
        </div>
        
        <div className="flex overflow-x-auto gap-4 pb-2 ">
          {mockAdsAudiences.map(aud => (
            <div key={aud.id} className="bg-surface-container/50 border border-outline-variant/50 rounded-xl p-4 flex flex-col justify-between group hover:border-primary/30 transition-colors min-w-[250px] flex-shrink-0 h-[100px]">
              <div className="flex items-start justify-between mb-2">
                <span className="px-2 py-0.5 bg-surface-variant text-on-surface-variant font-medium text-[11px] uppercase tracking-wider rounded">
                  {aud.type}
                </span>
                <button className="text-on-surface-variant opacity-0 group-hover:opacity-100 hover:text-on-surface transition-opacity">
                  <span className="material-symbols-outlined text-[18px]">more_horiz</span>
                </button>
              </div>
              <div>
                <h3 className="font-bold text-on-surface text-sm mb-1">{aud.name}</h3>
                <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">group</span>
                  {aud.size}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ad Creation Flow Modal */}
      {isFlowOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeFlow}></div>
          <div className="relative w-full max-w-[900px] max-h-[90vh] bg-surface-container-high border border-primary/30 rounded-2xl shadow-[0_0_40px_rgba(0,229,255,0.1)] flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden">
            
            <button onClick={closeFlow} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors z-20">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>

            {/* Progress Bar */}
            {!isSuccess && (
              <div className="px-8 pt-8 pb-4 border-b border-outline-variant/50 relative z-10 bg-surface-container-low">
                <div className="flex justify-between items-center relative max-w-[600px] mx-auto">
                  <div className="absolute top-4 left-0 w-full h-0.5 bg-surface-variant -z-10"></div>
                  <div 
                    className="absolute top-4 left-0 h-0.5 bg-primary -z-10 transition-all duration-300"
                    style={{ width: `${((currentStep - 1) / 3) * 100}%` }}
                  ></div>
                  
                  {[
                    { step: 1, label: 'Chọn bài' },
                    { step: 2, label: 'Ngân sách' },
                    { step: 3, label: 'Đối tượng' },
                    { step: 4, label: 'Xác nhận' }
                  ].map((s) => (
                    <div key={s.step} className="flex flex-col items-center gap-2">
                      <div className={clsx(
                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors shadow-sm",
                        currentStep === s.step ? "bg-primary text-on-primary ring-4 ring-primary/20" :
                        currentStep > s.step ? "bg-green-500 text-white" :
                        "bg-surface-variant text-on-surface-variant"
                      )}>
                        {currentStep > s.step ? <span className="material-symbols-outlined text-[16px]">check</span> : s.step}
                      </div>
                      <span className={clsx(
                        "text-[11px] font-bold uppercase tracking-wider",
                        currentStep === s.step ? "text-primary" : "text-on-surface-variant"
                      )}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 relative">
              {isSuccess ? (
                <div className="flex flex-col items-center justify-center h-full text-center w-full max-w-md mx-auto py-12 animate-in zoom-in-95 duration-500">
                  <div className="w-24 h-24 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(34,197,94,0.2)]">
                    <span className="material-symbols-outlined text-[48px] text-green-400">check_circle</span>
                  </div>
                  <h2 className="text-2xl font-bold text-on-surface mb-3">Chiến dịch đã bắt đầu chạy</h2>
                  <p className="text-on-surface-variant mb-8 leading-relaxed">
                    Bạn sẽ nhận được thông báo qua Telegram khi có khách bình luận và AI bắt đầu nhắn tin.
                  </p>
                  <div className="flex gap-4 w-full">
                    <button onClick={closeFlow} className="flex-1 py-3 px-4 bg-surface-container border border-outline-variant text-on-surface font-bold rounded-xl hover:bg-surface-variant transition-colors">
                      Đóng
                    </button>
                    <button onClick={closeFlow} className="flex-1 py-3 px-4 bg-primary text-on-primary font-bold rounded-xl hover:scale-105 transition-transform shadow-[0_4px_15px_rgba(0,229,255,0.3)]">
                      Xem chiến dịch
                    </button>
                  </div>
                </div>
              ) : currentStep === 1 ? (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                  <h2 className="text-2xl font-bold text-on-surface mb-2">Chọn bài đăng muốn quảng cáo</h2>
                  <p className="text-on-surface-variant mb-8">
                    Nên chọn bài đang có nhiều bình luận, vì đó là dấu hiệu nội dung được đón nhận tốt
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    {mockAdsPosts.map((post) => (
                      <button 
                        key={post.id}
                        onClick={() => setSelectedPostId(post.id)}
                        className={clsx(
                          "text-left p-4 rounded-xl border transition-all duration-200 bg-surface-container/30 hover:bg-surface-container group flex gap-4",
                          selectedPostId === post.id 
                            ? "border-primary bg-primary/5 shadow-[0_0_15px_rgba(0,229,255,0.1)]" 
                            : "border-outline-variant hover:border-primary/50"
                        )}
                      >
                        <div className="w-20 h-20 bg-surface-variant rounded-lg shrink-0 flex items-center justify-center overflow-hidden">
                          {post.hasImage ? (
                            <span className="material-symbols-outlined text-on-surface-variant/50 text-[32px]">image</span>
                          ) : (
                            <span className="material-symbols-outlined text-on-surface-variant/50 text-[32px]">article</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col">
                          <p className="text-sm text-on-surface font-medium line-clamp-2 leading-snug mb-2 group-hover:text-primary transition-colors">
                            {post.content}
                          </p>
                          <div className="mt-auto flex items-center justify-between text-xs text-on-surface-variant font-medium">
                            <span>{post.date}</span>
                            <div className="flex gap-3">
                              <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">thumb_up</span>{post.stats.likes}</span>
                              <span className="flex items-center gap-1 text-primary"><span className="material-symbols-outlined text-[14px]">chat_bubble</span>{post.stats.comments}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-end pt-6 border-t border-outline-variant/50">
                    <button 
                      onClick={() => setCurrentStep(2)}
                      disabled={!selectedPostId}
                      className="px-6 py-2.5 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
                    >
                      Tiếp tục <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              ) : currentStep === 2 ? (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                  <h2 className="text-2xl font-bold text-on-surface mb-8">Bạn muốn chi bao nhiêu?</h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-8 mb-8">
                    <div className="md:col-span-3 space-y-6">
                      <div className="bg-surface-container/30 border border-outline-variant p-6 rounded-2xl">
                        <label className="block text-sm font-bold text-on-surface mb-3">Ngân sách mỗi ngày</label>
                        <div className="relative mb-4">
                          <input 
                            type="text" 
                            value={dailyBudget === 0 ? '' : dailyBudget.toLocaleString('vi-VN')}
                            onChange={(e) => {
                              const rawValue = e.target.value.replace(/\./g, '');
                              const numValue = parseInt(rawValue, 10);
                              if (!isNaN(numValue)) {
                                setDailyBudget(numValue);
                              } else if (rawValue === '') {
                                setDailyBudget(0);
                              }
                            }}
                            className="w-full bg-surface-container-high border border-outline-variant rounded-xl px-4 py-3 text-lg font-bold text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all pr-12"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold">đ</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {[100000, 300000, 500000, 1000000].map(val => (
                            <button 
                              key={val}
                              onClick={() => setDailyBudget(val)}
                              className="py-2 bg-surface-variant hover:bg-surface-variant-high text-on-surface font-medium text-xs rounded-lg transition-colors border border-transparent hover:border-outline-variant"
                            >
                              {val.toLocaleString('vi-VN')}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="bg-surface-container/30 border border-outline-variant p-6 rounded-2xl">
                        <label className="block text-sm font-bold text-on-surface mb-3">Chạy trong bao nhiêu ngày</label>
                        <div className="flex items-center gap-4 mb-4">
                          <button onClick={() => setDuration(Math.max(1, duration - 1))} className="w-10 h-10 rounded-full bg-surface-variant hover:bg-surface-variant-high text-on-surface flex items-center justify-center transition-colors">
                            <span className="material-symbols-outlined">remove</span>
                          </button>
                          <div className="flex-1 relative">
                            <input 
                              type="number" 
                              value={duration}
                              onChange={(e) => setDuration(Number(e.target.value) || 1)}
                              className="w-full bg-surface-container-high border border-outline-variant rounded-xl px-4 py-3 text-lg font-bold text-on-surface text-center focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all pr-16"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold">ngày</span>
                          </div>
                          <button onClick={() => setDuration(duration + 1)} className="w-10 h-10 rounded-full bg-surface-variant hover:bg-surface-variant-high text-on-surface flex items-center justify-center transition-colors">
                            <span className="material-symbols-outlined">add</span>
                          </button>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-primary font-medium bg-primary/10 px-3 py-2 rounded-lg w-fit">
                          <span className="material-symbols-outlined text-[16px]">calendar_month</span>
                          Từ 15/08 đến {15 + duration > 31 ? (15+duration-31).toString().padStart(2, '0') + '/09' : (15+duration).toString().padStart(2, '0') + '/08'}
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <div className="sticky top-0 bg-primary/10 border-2 border-primary/40 rounded-2xl p-6 shadow-[0_0_30px_rgba(0,229,255,0.15)] h-full flex flex-col justify-center overflow-hidden">
                        <h3 className="font-mono text-xs font-bold tracking-wider text-primary uppercase mb-4 opacity-80">
                          TỔNG CHI TIÊU TỐI ĐA
                        </h3>
                        <div className={clsx(
                          "font-black text-on-surface mb-2 tracking-tight whitespace-nowrap",
                          (dailyBudget * duration).toLocaleString('vi-VN').length >= 12 ? "text-2xl lg:text-3xl" : 
                          (dailyBudget * duration).toLocaleString('vi-VN').length >= 9 ? "text-3xl lg:text-4xl" : "text-4xl lg:text-5xl"
                        )}>
                          {(dailyBudget * duration).toLocaleString('vi-VN')} đ
                        </div>
                        <p className="text-on-surface-variant font-medium mt-auto">
                          {dailyBudget.toLocaleString('vi-VN')} đ × {duration} ngày
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between pt-6 border-t border-outline-variant/50">
                    <button 
                      onClick={() => setCurrentStep(1)}
                      className="px-6 py-2.5 bg-surface-container border border-outline-variant text-on-surface font-bold rounded-xl hover:bg-surface-variant transition-colors flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px]">arrow_back</span> Quay lại
                    </button>
                    <button 
                      onClick={() => setCurrentStep(3)}
                      className="px-6 py-2.5 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform flex items-center gap-2"
                    >
                      Tiếp tục <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              ) : currentStep === 3 ? (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                  <h2 className="text-2xl font-bold text-on-surface mb-8">Ai sẽ thấy quảng cáo này?</h2>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                    <div className="md:col-span-2 space-y-4">
                      
                      <div 
                        onClick={() => setAudienceType('saved')}
                        className={clsx(
                          "w-full text-left p-5 rounded-2xl border transition-all duration-200 bg-surface-container/30 cursor-pointer",
                          audienceType === 'saved' ? "border-primary bg-primary/5" : "border-outline-variant hover:border-primary/50"
                        )}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className={clsx("w-5 h-5 rounded-full border-2 flex items-center justify-center", audienceType === 'saved' ? "border-primary" : "border-outline-variant")}>
                            {audienceType === 'saved' && <div className="w-2.5 h-2.5 rounded-full bg-primary"></div>}
                          </div>
                          <span className="font-bold text-on-surface text-lg">Dùng tệp đã lưu</span>
                        </div>
                        {audienceType === 'saved' && (
                          <div className="pl-8 mt-4 animate-in slide-in-from-top-2 duration-200">
                            <select className="w-full bg-surface-container-high border border-outline-variant rounded-xl px-4 py-3 text-sm font-medium text-on-surface focus:outline-none focus:border-primary">
                              <option>Khách đã mua</option>
                              <option>Giống khách đã mua</option>
                              <option>Quan tâm sản phẩm</option>
                            </select>
                          </div>
                        )}
                      </div>

                      <div 
                        onClick={() => setAudienceType('custom')}
                        className={clsx(
                          "w-full text-left p-5 rounded-2xl border transition-all duration-200 bg-surface-container/30 cursor-pointer",
                          audienceType === 'custom' ? "border-primary bg-primary/5" : "border-outline-variant hover:border-primary/50"
                        )}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className={clsx("w-5 h-5 rounded-full border-2 flex items-center justify-center", audienceType === 'custom' ? "border-primary" : "border-outline-variant")}>
                            {audienceType === 'custom' && <div className="w-2.5 h-2.5 rounded-full bg-primary"></div>}
                          </div>
                          <span className="font-bold text-on-surface text-lg">Tự chọn đối tượng</span>
                        </div>
                        {audienceType === 'custom' && (
                          <div className="pl-8 mt-6 space-y-5 animate-in slide-in-from-top-2 duration-200 cursor-default" onClick={e => e.stopPropagation()}>
                            <div>
                              <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Khu vực</label>
                              <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary" />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Độ tuổi: {ageRange[0]} - {ageRange[1]}</label>
                              <div className="h-10 border border-outline-variant rounded-lg bg-surface-container-high flex items-center px-4 relative">
                                <div className="absolute left-1/4 right-1/4 h-1.5 bg-primary rounded-full"></div>
                                <div className="absolute left-1/4 w-4 h-4 rounded-full bg-white shadow-md border-2 border-primary -translate-x-1/2"></div>
                                <div className="absolute right-1/4 w-4 h-4 rounded-full bg-white shadow-md border-2 border-primary translate-x-1/2"></div>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Giới tính</label>
                              <div className="flex bg-surface-container-high rounded-lg p-1 border border-outline-variant">
                                {['Tất cả', 'Nam', 'Nữ'].map(g => (
                                  <button 
                                    key={g} 
                                    onClick={() => setGender(g)}
                                    className={clsx("flex-1 py-1.5 text-sm font-bold rounded-md transition-colors", gender === g ? "bg-primary/20 text-primary" : "text-on-surface-variant hover:text-on-surface")}
                                  >
                                    {g}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Sở thích</label>
                              <input type="text" placeholder="Thêm sở thích..." className="w-full bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary placeholder:text-on-surface-variant/50" />
                            </div>
                          </div>
                        )}
                      </div>

                      <div 
                        onClick={() => setAudienceType('auto')}
                        className={clsx(
                          "w-full text-left p-5 rounded-2xl border transition-all duration-200 bg-surface-container/30 cursor-pointer",
                          audienceType === 'auto' ? "border-primary bg-primary/5" : "border-outline-variant hover:border-primary/50"
                        )}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className={clsx("w-5 h-5 rounded-full border-2 flex items-center justify-center", audienceType === 'auto' ? "border-primary" : "border-outline-variant")}>
                            {audienceType === 'auto' && <div className="w-2.5 h-2.5 rounded-full bg-primary"></div>}
                          </div>
                          <span className="font-bold text-on-surface text-lg">Để Facebook tự tìm</span>
                        </div>
                        <p className="pl-8 text-sm text-on-surface-variant">
                          Facebook tự tìm người có khả năng quan tâm nhất dựa trên nội dung bài đăng
                        </p>
                      </div>
                    </div>

                    <div className="md:col-span-1">
                      <div className="sticky top-0 bg-surface-container/50 border border-outline-variant rounded-2xl p-6 h-full flex flex-col justify-center text-center">
                        <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-4">
                          ƯỚC TÍNH TIẾP CẬN
                        </h3>
                        <div className="text-2xl font-black text-primary mb-6">
                          12.000 - 18.000<br/><span className="text-base font-bold text-on-surface-variant">người</span>
                        </div>
                        
                        <div className="relative w-32 h-16 mx-auto mb-2 overflow-hidden">
                          <div className="w-32 h-32 rounded-full border-8 border-outline-variant border-t-green-400 border-r-yellow-400 border-l-primary rotate-45 box-border"></div>
                          <div className="absolute bottom-0 left-1/2 w-1 h-14 bg-on-surface origin-bottom -translate-x-1/2 rotate-[15deg] transition-transform duration-500">
                            <div className="absolute -top-1 -left-1 w-3 h-3 bg-on-surface rounded-full"></div>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-green-400">Tệp vừa phải</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between pt-6 border-t border-outline-variant/50">
                    <button 
                      onClick={() => setCurrentStep(2)}
                      className="px-6 py-2.5 bg-surface-container border border-outline-variant text-on-surface font-bold rounded-xl hover:bg-surface-variant transition-colors flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px]">arrow_back</span> Quay lại
                    </button>
                    <button 
                      onClick={() => setCurrentStep(4)}
                      className="px-6 py-2.5 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform flex items-center gap-2"
                    >
                      Tiếp tục <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                  <h2 className="text-2xl font-bold text-on-surface mb-2">Xác nhận trước khi chạy</h2>
                  <p className="text-on-surface-variant mb-8">
                    Kiểm tra lại một lần nữa trước khi tiền bắt đầu được trừ
                  </p>

                  <div className="bg-surface-container/30 border border-outline-variant rounded-2xl overflow-hidden mb-6">
                    <div className="flex items-center justify-between p-4 border-b border-outline-variant/50">
                      <span className="text-sm font-bold text-on-surface-variant">Bài đăng</span>
                      <div className="flex items-center gap-3 max-w-[60%] text-right">
                        <span className="text-sm font-medium text-on-surface truncate">
                          {mockAdsPosts.find(p => p.id === selectedPostId)?.content || "Bài viết chưa chọn"}
                        </span>
                        <div className="w-10 h-10 bg-surface-variant rounded shrink-0 flex items-center justify-center">
                          {mockAdsPosts.find(p => p.id === selectedPostId)?.hasImage ? (
                            <span className="material-symbols-outlined text-on-surface-variant/50 text-[20px]">image</span>
                          ) : (
                            <span className="material-symbols-outlined text-on-surface-variant/50 text-[20px]">article</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 border-b border-outline-variant/50">
                      <span className="text-sm font-bold text-on-surface-variant">Ngân sách mỗi ngày</span>
                      <span className="text-base font-bold text-on-surface">{dailyBudget.toLocaleString('vi-VN')} đ</span>
                    </div>

                    <div className="flex items-center justify-between p-4 border-b border-outline-variant/50">
                      <span className="text-sm font-bold text-on-surface-variant">Thời gian chạy</span>
                      <div className="text-right">
                        <span className="text-base font-bold text-on-surface block">{duration} ngày</span>
                        <span className="text-xs text-on-surface-variant font-medium">từ 15/08 đến {15+duration > 31 ? (15+duration-31).toString().padStart(2,'0')+'/09' : (15+duration).toString().padStart(2,'0')+'/08'}</span>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between p-4 border-b border-outline-variant/50 gap-2">
                      <span className="text-sm font-bold text-on-surface-variant shrink-0">Đối tượng</span>
                      <span className="text-sm font-medium text-on-surface text-right">
                        {audienceType === 'custom' ? `${location}, ${ageRange[0]}-${ageRange[1]} tuổi, ${gender}` : 
                         audienceType === 'auto' ? "Tự động phân phối (Khuyên dùng)" : "Tệp: Khách đã mua"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-4">
                      <span className="text-sm font-bold text-on-surface-variant">Ước tính tiếp cận</span>
                      <span className="text-sm font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md">12.000 - 18.000 người</span>
                    </div>
                  </div>

                  <div className="bg-surface-container-highest border-2 border-primary/30 rounded-2xl p-6 text-center shadow-[0_0_40px_rgba(0,229,255,0.08)] mb-8 overflow-hidden">
                    <h3 className="font-mono text-xs font-bold tracking-wider text-primary uppercase mb-2">TỔNG CHI TIÊU TỐI ĐA</h3>
                    <div className={clsx(
                      "font-black text-on-surface mb-3 tracking-tight whitespace-nowrap",
                      (dailyBudget * duration).toLocaleString('vi-VN').length >= 12 ? "text-3xl lg:text-4xl" : "text-5xl"
                    )}>
                      {(dailyBudget * duration).toLocaleString('vi-VN')} đ
                    </div>
                    <p className="text-sm text-on-surface-variant font-medium">Số tiền này sẽ được trừ vào tài khoản quảng cáo Facebook của bạn</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => setCurrentStep(3)}
                      className="w-full py-3.5 px-4 bg-surface-container border border-outline-variant text-on-surface font-bold text-lg rounded-xl hover:bg-surface-variant transition-colors"
                    >
                      Quay lại chỉnh sửa
                    </button>
                    <button 
                      onClick={() => setIsSuccess(true)}
                      className="w-full py-3.5 px-4 bg-primary text-on-primary font-bold text-lg rounded-xl shadow-[0_4px_25px_rgba(0,229,255,0.4)] hover:scale-[1.02] transition-transform"
                    >
                      Xác nhận và chạy
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Centered Create Audience Modal */}
      {isAudienceFlowOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsAudienceFlowOpen(false)}></div>
          <div className="relative w-full max-w-[640px] max-h-[90vh] bg-surface-container-high border border-primary/30 rounded-2xl shadow-[0_0_40px_rgba(0,229,255,0.1)] flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-outline-variant/50 shrink-0">
              <h2 className="text-xl font-bold text-on-surface">Tạo tệp đối tượng</h2>
              <button onClick={() => setIsAudienceFlowOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
              
              {/* Block 1 */}
              <div>
                <label className="block font-mono text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">TÊN TỆP</label>
                <input 
                  type="text" 
                  value={audName}
                  onChange={e => setAudName(e.target.value)}
                  placeholder="Ví dụ: Khách đã mua"
                  className="w-full bg-surface-container-high border border-outline-variant rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary placeholder:text-on-surface-variant/50"
                />
              </div>

              {/* Block 2 */}
              <div>
                <label className="block font-mono text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">LOẠI TỆP</label>
                <div className="space-y-3">
                  {[
                    { id: 'custom', title: 'Tệp tùy chỉnh', desc: 'Danh sách khách hàng của bạn, ví dụ người đã nhắn tin hoặc đã mua hàng' },
                    { id: 'lookalike', title: 'Tệp tương tự', desc: 'Facebook tìm những người có hành vi giống với một tệp bạn đã có' },
                    { id: 'interest', title: 'Theo sở thích', desc: 'Nhắm vào người quan tâm những chủ đề bạn chọn' }
                  ].map(type => (
                    <button 
                      key={type.id}
                      onClick={() => setAudType(type.id)}
                      className={clsx(
                        "w-full text-left p-4 rounded-xl border transition-all duration-200 flex gap-4 items-start",
                        audType === type.id ? "bg-primary/10 border-primary" : "bg-surface-container border-outline-variant hover:border-primary/50"
                      )}
                    >
                      <div className={clsx("w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center mt-0.5", audType === type.id ? "border-primary" : "border-outline-variant")}>
                        {audType === type.id && <div className="w-2.5 h-2.5 rounded-full bg-primary"></div>}
                      </div>
                      <div>
                        <h4 className="font-bold text-on-surface mb-1">{type.title}</h4>
                        <p className="text-sm text-on-surface-variant leading-relaxed">{type.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Block 3 - Dynamic */}
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                {audType === 'custom' && (
                  <div className="space-y-3">
                    {[
                      'Người đã nhắn tin cho trang',
                      'Người đã bình luận bài đăng',
                      'Khách đã chốt đơn',
                      'Người đã xem bài đăng'
                    ].map(source => (
                      <label key={source} onClick={() => handleToggleCustomSource(source)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container transition-colors cursor-pointer border border-transparent hover:border-outline-variant">
                        <div className={clsx(
                          "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                          audCustomSources.includes(source) ? "bg-primary border-primary" : "border-outline-variant bg-surface-container-high"
                        )}>
                          {audCustomSources.includes(source) && <span className="material-symbols-outlined text-[14px] text-on-primary font-bold">check</span>}
                        </div>
                        <span className="text-sm font-medium text-on-surface">{source}</span>
                      </label>
                    ))}
                  </div>
                )}

                {audType === 'lookalike' && (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-bold text-on-surface mb-2">Tệp gốc</label>
                      <select 
                        value={audLookalikeSource}
                        onChange={e => setAudLookalikeSource(e.target.value)}
                        className="w-full bg-surface-container-high border border-outline-variant rounded-xl px-4 py-3 text-sm font-medium text-on-surface focus:outline-none focus:border-primary"
                      >
                        <option>Khách đã mua</option>
                        <option>Người đã nhắn tin</option>
                        <option>Người đã bình luận</option>
                      </select>
                    </div>
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-sm font-bold text-on-surface">Độ tương đồng</label>
                        <span className="text-primary font-bold">{audLookalikePercent}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="1" max="10" 
                        value={audLookalikePercent}
                        onChange={e => setAudLookalikePercent(Number(e.target.value))}
                        className="w-full accent-primary h-2 bg-surface-variant rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs font-bold text-on-surface-variant mt-2">
                        <span>1% (Giống nhất)</span>
                        <span>10% (Rộng nhất)</span>
                      </div>
                      <p className="text-xs text-on-surface-variant mt-3 bg-surface-container p-3 rounded-lg border border-outline-variant/50">
                        Số càng nhỏ thì càng giống tệp gốc nhưng ít người hơn
                      </p>
                    </div>
                  </div>
                )}

                {audType === 'interest' && (
                  <div>
                    <label className="block text-sm font-bold text-on-surface mb-2">Chủ đề quan tâm</label>
                    <div className="bg-surface-container-high border border-outline-variant rounded-xl p-2 min-h-[100px] flex flex-wrap gap-2 focus-within:border-primary transition-colors">
                      {audInterests.map((interest, idx) => (
                        <span key={idx} className="bg-primary/20 text-primary border border-primary/30 px-3 py-1 rounded-md text-sm font-medium flex items-center gap-1.5">
                          {interest}
                          <button onClick={() => handleRemoveInterest(idx)} className="hover:bg-primary/30 rounded-full w-4 h-4 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[12px]">close</span>
                          </button>
                        </span>
                      ))}
                      <input 
                        type="text"
                        value={audNewInterest}
                        onChange={e => setAudNewInterest(e.target.value)}
                        onKeyDown={handleAddInterest}
                        placeholder={audInterests.length === 0 ? "Nhập sở thích và nhấn Enter..." : ""}
                        className="flex-1 min-w-[150px] bg-transparent outline-none text-sm text-on-surface p-1"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Block 4 */}
              <div className="bg-surface-container border border-outline-variant rounded-xl p-5 text-center">
                <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">ƯỚC TÍNH SỐ NGƯỜI</h3>
                <div className="text-3xl font-black text-primary">
                  {audType === 'custom' ? 'khoảng 45.000' : 
                   audType === 'lookalike' ? 'khoảng 850.000' : 'khoảng 320.000'} <span className="text-lg text-on-surface font-bold">người</span>
                </div>
              </div>

            </div>

            {/* Block 5: Footer */}
            <div className="p-6 border-t border-outline-variant/50 bg-surface-container-low flex gap-3 shrink-0">
              <button 
                onClick={() => setIsAudienceFlowOpen(false)}
                className="flex-1 py-3 px-4 border border-outline-variant bg-transparent text-on-surface font-bold rounded-xl hover:bg-surface-variant transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={() => setIsAudienceFlowOpen(false)}
                className="flex-1 py-3 px-4 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform"
              >
                Tạo tệp
              </button>
            </div>

          </div>
        </div>
      )}

      <AITrainingModal isOpen={isTrainingOpen} onClose={() => setIsTrainingOpen(false)} aiName="AI Quảng Cáo" />
    </main>
  );
}

