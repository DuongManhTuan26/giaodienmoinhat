import React, { useState } from 'react';
import { clsx } from 'clsx';
import { mockAutoScripts } from '../data/mockApi';
import AITrainingModal from '../components/AITrainingModal';

export default function AutoScripts() {
  const [scripts, setScripts] = useState(mockAutoScripts);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isTrainingOpen, setIsTrainingOpen] = useState(false);
  
  // Composer Form State
  const [scriptName, setScriptName] = useState('');
  const [keywords, setKeywords] = useState(['giá', 'bao nhiêu', 'inbox']);
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newExcludeKeyword, setNewExcludeKeyword] = useState('');
  const [matchType, setMatchType] = useState('word');
  const [ignoreTypo, setIgnoreTypo] = useState(true);
  const [message, setMessage] = useState('Xin chào! Đây là trợ lý tự động của shop. Em thấy mình quan tâm sản phẩm, em tư vấn ngay cho mình nhé!');
  const [publicReplyEnabled, setPublicReplyEnabled] = useState(true);
  const [publicReplyText, setPublicReplyText] = useState('Em đã nhắn tin riêng cho mình rồi nhé!');
  const [delay, setDelay] = useState(30);
  const [applyTo, setApplyTo] = useState('all');

  const toggleScriptStatus = (id: string) => {
    setScripts(prev => prev.map(script => 
      script.id === id 
        ? { ...script, status: script.status === 'Đang chạy' ? 'Tạm dừng' : 'Đang chạy' }
        : script
    ));
  };

  const handleAddKeyword = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newKeyword.trim()) {
      setKeywords([...keywords, newKeyword.trim()]);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (indexToRemove: number) => {
    setKeywords(keywords.filter((_, index) => index !== indexToRemove));
  };

  const handleAddExcludeKeyword = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newExcludeKeyword.trim()) {
      setExcludeKeywords([...excludeKeywords, newExcludeKeyword.trim()]);
      setNewExcludeKeyword('');
    }
  };

  const handleRemoveExcludeKeyword = (indexToRemove: number) => {
    setExcludeKeywords(excludeKeywords.filter((_, index) => index !== indexToRemove));
  };

  return (
    <main className="flex-1  p-6 md:p-8 max-w-7xl mx-auto w-full relative    bg-background">
      
      {/* Tabs */}
      <div className="flex border-b border-outline-variant mb-6">
        <button className="px-6 py-3 font-bold text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50 transition-colors">
          Đào tạo AI
        </button>
        <button className="px-6 py-3 font-bold text-sm text-primary border-b-2 border-primary transition-colors bg-primary/5">
          Comment sang tin nhắn
        </button>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-headline-sm text-3xl font-bold text-on-surface tracking-tight">AI Bán Hàng</h1>
            <span className="font-mono text-xs font-bold tracking-wider text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full uppercase">
              3 KỊCH BẢN ĐANG CHẠY
            </span>
          </div>
          <p className="text-on-surface-variant text-sm">Tự động nhắn tin cho người vừa bình luận bài đăng của bạn</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsTrainingOpen(true)}
            className="px-4 py-2 bg-surface-container text-primary border border-primary/30 font-bold rounded-lg hover:bg-primary/10 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">model_training</span>
            Huấn luyện AI
          </button>
          <button 
            onClick={() => setIsComposerOpen(true)}
            className="shrink-0 px-4 py-2 bg-primary text-on-primary font-bold rounded-lg shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Tạo kịch bản
          </button>
        </div>
      </div>

      {/* Row 1: Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors h-[140px]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/10 blur-2xl rounded-full group-hover:bg-primary/20 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">KỊCH BẢN ĐANG CHẠY</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-3xl font-bold text-on-surface">3</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">Trên 5 bài đăng</p>
          </div>
        </div>

        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors h-[140px]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/10 blur-2xl rounded-full group-hover:bg-blue-500/20 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">ĐÃ NHẮN TIN ĐẦU</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-3xl font-bold text-on-surface">142</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">Trong 30 ngày qua</p>
          </div>
        </div>

        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors h-[140px]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-purple-500/10 blur-2xl rounded-full group-hover:bg-purple-500/20 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">KHÁCH PHẢN HỒI</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-3xl font-bold text-on-surface">89</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">Tỷ lệ 63%</p>
          </div>
        </div>

        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors h-[140px]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-green-500/10 blur-2xl rounded-full group-hover:bg-green-500/20 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">ĐÃ CHỐT ĐƠN</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-3xl font-bold text-on-surface">18</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-green-400 bg-green-400/10 self-start px-2 py-1 rounded-md mt-auto">
            <span className="material-symbols-outlined text-[14px]">trending_up</span>
            +5 so với tháng trước
          </div>
        </div>
      </div>

      {/* Row 2: Policy Banner */}
      <div className="w-full bg-primary/5 border border-primary/20 rounded-xl p-4 flex gap-4 items-start mb-8">
        <div className="shrink-0 pt-0.5">
          <span className="material-symbols-outlined text-primary text-[24px]">shield</span>
        </div>
        <div>
          <p className="font-bold text-on-surface text-sm mb-1">Mỗi bình luận chỉ được nhắn riêng một lần</p>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Đây là quy định của Facebook. Hệ thống tự động ghi nhớ và không bao giờ nhắn trùng cho cùng một bình luận, kể cả khi người đó bình luận nhiều lần.
          </p>
        </div>
      </div>

      {/* Row 3: List of Scripts */}
      <div className="flex flex-col gap-4">
        {scripts.map(script => (
          <div key={script.id} className="w-full bg-surface-container/30 border border-outline-variant rounded-2xl flex flex-col overflow-hidden group hover:border-primary/30 transition-colors shadow-sm">
            {/* Header */}
            <div className="p-5 flex items-center justify-between border-b border-outline-variant/50 bg-surface-container/20">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-bold text-on-surface">{script.name}</h2>
                <span className={clsx(
                  "px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider border uppercase",
                  script.status === 'Đang chạy' 
                    ? "text-green-500 bg-green-500/10 border-green-500/20" 
                    : "text-on-surface-variant bg-surface-variant border-outline-variant"
                )}>
                  {script.status}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => toggleScriptStatus(script.id)}
                  className={clsx(
                    "w-11 h-6 rounded-full relative transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-surface-container",
                    script.status === 'Đang chạy' ? "bg-primary" : "bg-surface-variant border border-outline-variant"
                  )}
                >
                  <span className={clsx(
                    "absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-sm",
                    script.status === 'Đang chạy' ? "left-[26px]" : "left-[3px]"
                  )} />
                </button>
                <button className="text-on-surface-variant hover:text-on-surface p-1.5 rounded-md hover:bg-surface-variant transition-colors">
                  <span className="material-symbols-outlined text-[20px]">more_vert</span>
                </button>
              </div>
            </div>

            {/* Body (3 Columns) */}
            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-outline-variant/50">
              {/* Col 1 */}
              <div className="md:pr-6">
                <h3 className="font-mono text-[11px] font-bold text-on-surface-variant tracking-wider uppercase mb-3">TỪ KHÓA KÍCH HOẠT</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {script.keywords.map(kw => (
                    <span key={kw} className="px-2.5 py-1 bg-surface-variant text-on-surface font-medium text-xs rounded-full border border-outline-variant">
                      {kw}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-on-surface-variant/80">{script.matchType}</p>
              </div>

              {/* Col 2 */}
              <div className="md:px-6 py-4 md:py-0">
                <h3 className="font-mono text-[11px] font-bold text-on-surface-variant tracking-wider uppercase mb-3">TIN NHẮN SẼ GỬI</h3>
                <p className="text-sm text-on-surface leading-relaxed line-clamp-3 mb-3">"{script.message}"</p>
                <p className="text-xs text-on-surface-variant/80">{script.delay}</p>
              </div>

              {/* Col 3 */}
              <div className="md:pl-6 pt-4 md:pt-0">
                <h3 className="font-mono text-[11px] font-bold text-on-surface-variant tracking-wider uppercase mb-3">KẾT QUẢ</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-on-surface-variant">Đã kích hoạt</span>
                    <span className="font-bold text-on-surface">— {script.stats.triggered} lần</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-on-surface-variant">Tin đã gửi</span>
                    <span className="font-bold text-on-surface">— {script.stats.sent}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-on-surface-variant">Khách phản hồi</span>
                    <span className="font-bold text-primary">— {script.stats.replied}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-surface-container/20 border-t border-outline-variant/50 text-xs text-on-surface-variant">
              Áp dụng cho: <span className="font-medium text-on-surface">{script.appliedTo}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Centered Composer Modal */}
      {isComposerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div 
            className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setIsComposerOpen(false)}
          ></div>
          <div className="relative w-full max-w-[640px] max-h-[90vh] bg-surface-container-high border border-primary/30 rounded-2xl shadow-[0_0_40px_rgba(0,229,255,0.1)] flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-outline-variant flex items-center justify-between bg-surface-container/50 shrink-0">
              <h2 className="font-headline-sm text-xl font-bold text-on-surface">Tạo kịch bản tự động</h2>
              <button 
                onClick={() => setIsComposerOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-variant text-on-surface hover:bg-outline-variant transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
              
              {/* Block 1: TÊN KỊCH BẢN */}
              <div>
                <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-3">TÊN KỊCH BẢN</h3>
                <input 
                  type="text" 
                  value={scriptName}
                  onChange={(e) => setScriptName(e.target.value)}
                  placeholder="Ví dụ: Khách hỏi giá"
                  className="w-full bg-surface-container-high border border-outline-variant rounded-lg p-3 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                />
              </div>

              {/* Block 2: TỪ KHÓA KÍCH HOẠT */}
              <div>
                <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-3">TỪ KHÓA KÍCH HOẠT</h3>
                
                <div className="bg-surface-container rounded-xl border border-outline-variant p-4 md:p-5 space-y-6">
                  {/* Keywords input */}
                  <div>
                    <div className="bg-surface-container-high border border-outline-variant rounded-lg p-2 min-h-[46px] flex flex-wrap gap-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
                      {keywords.map((kw, idx) => (
                        <div key={idx} className="flex items-center gap-1 px-2.5 py-1 bg-primary/20 text-primary border border-primary/30 rounded-full text-xs font-bold">
                          {kw}
                          <button onClick={() => handleRemoveKeyword(idx)} className="hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        </div>
                      ))}
                      <input 
                        type="text"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyDown={handleAddKeyword}
                        placeholder="Gõ từ khóa và nhấn Enter..."
                        className="flex-1 min-w-[150px] bg-transparent border-none outline-none text-sm text-on-surface px-1 placeholder:text-on-surface-variant/50"
                      />
                    </div>
                  </div>

                  {/* Match type radios */}
                  <div className="space-y-4 pt-4 border-t border-outline-variant/50">
                    <label className="flex gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center w-5 h-5 shrink-0 mt-0.5">
                        <input 
                          type="radio" name="matchType" value="anywhere"
                          checked={matchType === 'anywhere'} onChange={() => setMatchType('anywhere')}
                          className="peer appearance-none w-5 h-5 border-2 border-outline-variant rounded-full checked:border-primary cursor-pointer transition-colors"
                        />
                        <div className="absolute w-2.5 h-2.5 rounded-full bg-primary opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"></div>
                      </div>
                      <div>
                        <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">Khớp bất kỳ đâu</span>
                        <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">Từ 'giá' sẽ khớp cả trong chữ 'giá cả', 'đánh giá'</p>
                      </div>
                    </label>

                    <label className="flex gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center w-5 h-5 shrink-0 mt-0.5">
                        <input 
                          type="radio" name="matchType" value="word"
                          checked={matchType === 'word'} onChange={() => setMatchType('word')}
                          className="peer appearance-none w-5 h-5 border-2 border-outline-variant rounded-full checked:border-primary cursor-pointer transition-colors"
                        />
                        <div className="absolute w-2.5 h-2.5 rounded-full bg-primary opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"></div>
                      </div>
                      <div>
                        <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">Khớp nguyên từ</span>
                        <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">Chỉ khớp khi từ đứng riêng. Đây là lựa chọn khuyên dùng.</p>
                      </div>
                    </label>

                    <label className="flex gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center w-5 h-5 shrink-0 mt-0.5">
                        <input 
                          type="radio" name="matchType" value="exact"
                          checked={matchType === 'exact'} onChange={() => setMatchType('exact')}
                          className="peer appearance-none w-5 h-5 border-2 border-outline-variant rounded-full checked:border-primary cursor-pointer transition-colors"
                        />
                        <div className="absolute w-2.5 h-2.5 rounded-full bg-primary opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"></div>
                      </div>
                      <div>
                        <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">Khớp chính xác</span>
                        <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">Cả bình luận phải đúng bằng từ khóa</p>
                      </div>
                    </label>
                  </div>

                  {/* Ignore Typo Switch */}
                  <div className="flex items-center justify-between pt-4 border-t border-outline-variant/50">
                    <div>
                      <span className="text-sm font-bold text-on-surface block mb-1">Bỏ qua lỗi chính tả</span>
                      <span className="text-xs text-on-surface-variant">Khách gõ sai chính tả vẫn kích hoạt được</span>
                    </div>
                    <button 
                      onClick={() => setIgnoreTypo(!ignoreTypo)}
                      className={clsx(
                        "w-11 h-6 rounded-full relative transition-colors duration-200 focus:outline-none shrink-0",
                        ignoreTypo ? "bg-primary" : "bg-surface-variant border border-outline-variant"
                      )}
                    >
                      <span className={clsx(
                        "absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-sm",
                        ignoreTypo ? "left-[26px]" : "left-[3px]"
                      )} />
                    </button>
                  </div>

                  {/* Exclude Keywords */}
                  <div className="pt-4 border-t border-outline-variant/50">
                    <label className="block text-sm font-medium text-on-surface mb-2">Từ khóa loại trừ</label>
                    <div className="bg-surface-container-high border border-outline-variant rounded-lg p-2 min-h-[46px] flex flex-wrap gap-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all mb-2">
                      {excludeKeywords.map((kw, idx) => (
                        <div key={idx} className="flex items-center gap-1 px-2.5 py-1 bg-error/10 text-error border border-error/20 rounded-full text-xs font-bold">
                          {kw}
                          <button onClick={() => handleRemoveExcludeKeyword(idx)} className="hover:bg-error/20 rounded-full transition-colors">
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        </div>
                      ))}
                      <input 
                        type="text"
                        value={newExcludeKeyword}
                        onChange={(e) => setNewExcludeKeyword(e.target.value)}
                        onKeyDown={handleAddExcludeKeyword}
                        placeholder="Gõ từ loại trừ và nhấn Enter..."
                        className="flex-1 min-w-[150px] bg-transparent border-none outline-none text-sm text-on-surface px-1 placeholder:text-on-surface-variant/50"
                      />
                    </div>
                    <p className="text-xs text-on-surface-variant">Nếu bình luận chứa những từ này thì KHÔNG kích hoạt kịch bản</p>
                  </div>
                </div>
              </div>

              {/* Block 3: TIN NHẮN RIÊNG SẼ GỬI */}
              <div>
                <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-3">TIN NHẮN RIÊNG SẼ GỬI</h3>
                <textarea 
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-surface-container-high rounded-xl border border-outline-variant p-4 text-sm text-on-surface leading-relaxed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all resize-none  mb-3"
                ></textarea>
                <div className="flex gap-2 items-start text-xs text-on-surface-variant/80">
                  <span className="material-symbols-outlined text-[14px] shrink-0 mt-0.5">shield</span>
                  <p className="leading-relaxed">Tin nhắn phải bắt đầu bằng câu cho khách biết đây là trợ lý tự động. Đây là yêu cầu bắt buộc của Facebook.</p>
                </div>
              </div>

              {/* Block 4: TRẢ LỜI CÔNG KHAI DƯỚI BÌNH LUẬN */}
              <div>
                <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-3">TRẢ LỜI CÔNG KHAI DƯỚI BÌNH LUẬN</h3>
                <div className="p-4 bg-surface-container rounded-xl border border-outline-variant">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-bold text-on-surface">Cũng trả lời công khai</span>
                    <button 
                      onClick={() => setPublicReplyEnabled(!publicReplyEnabled)}
                      className={clsx(
                        "w-11 h-6 rounded-full relative transition-colors duration-200 focus:outline-none shrink-0",
                        publicReplyEnabled ? "bg-primary" : "bg-surface-variant border border-outline-variant"
                      )}
                    >
                      <span className={clsx(
                        "absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-sm",
                        publicReplyEnabled ? "left-[26px]" : "left-[3px]"
                      )} />
                    </button>
                  </div>
                  
                  {publicReplyEnabled && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                      <input 
                        type="text" 
                        value={publicReplyText}
                        onChange={(e) => setPublicReplyText(e.target.value)}
                        className="w-full bg-surface-container-high border border-outline-variant rounded-lg p-3 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all mb-2"
                      />
                      <p className="text-xs text-on-surface-variant leading-relaxed">Câu này hiện công khai dưới bình luận để khách biết mà vào xem tin nhắn</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Block 5: THỜI ĐIỂM GỬI */}
              <div>
                <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-3">THỜI ĐIỂM GỬI</h3>
                <div className="p-4 bg-surface-container rounded-xl border border-outline-variant">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-bold text-on-surface">Gửi sau {delay} giây</span>
                    <span className="font-mono text-[11px] text-on-surface-variant font-bold bg-surface-container-high px-2 py-1 rounded-md">{delay}s</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" max="300" step="1"
                    value={delay}
                    onChange={(e) => setDelay(Number(e.target.value))}
                    className="w-full accent-primary h-1 bg-outline-variant/50 rounded-lg appearance-none cursor-pointer hover:bg-outline-variant transition-colors mb-4"
                  />
                  <p className="text-xs text-on-surface-variant leading-relaxed">Gửi ngay lập tức trông giống máy. Chờ vài chục giây tự nhiên hơn.</p>
                </div>
              </div>

              {/* Block 6: ÁP DỤNG CHO BÀI NÀO */}
              <div>
                <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-3">ÁP DỤNG CHO BÀI NÀO</h3>
                <div className="bg-surface-container rounded-xl p-4 border border-outline-variant space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
                      <input 
                        type="radio" name="applyTo" value="all"
                        checked={applyTo === 'all'} onChange={() => setApplyTo('all')}
                        className="peer appearance-none w-5 h-5 border-2 border-outline-variant rounded-full checked:border-primary cursor-pointer transition-colors"
                      />
                      <div className="absolute w-2.5 h-2.5 rounded-full bg-primary opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"></div>
                    </div>
                    <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">Tất cả bài đăng</span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
                      <input 
                        type="radio" name="applyTo" value="specific"
                        checked={applyTo === 'specific'} onChange={() => setApplyTo('specific')}
                        className="peer appearance-none w-5 h-5 border-2 border-outline-variant rounded-full checked:border-primary cursor-pointer transition-colors"
                      />
                      <div className="absolute w-2.5 h-2.5 rounded-full bg-primary opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"></div>
                    </div>
                    <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">Chỉ một số bài cụ thể</span>
                  </label>

                  {applyTo === 'specific' && (
                    <div className="pl-8 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-3 border border-dashed border-outline-variant rounded-lg bg-surface-container-high/50 text-center">
                        <span className="text-xs text-on-surface-variant">Chọn bài đăng...</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-6 border-t border-outline-variant bg-surface-container/50 flex gap-3 shrink-0">
              <button 
                onClick={() => setIsComposerOpen(false)}
                className="flex-1 py-3 rounded-xl border border-outline-variant text-on-surface font-bold text-sm hover:bg-surface-variant transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={() => setIsComposerOpen(false)}
                className="flex-[2] py-3 rounded-xl bg-primary text-on-primary font-bold text-sm shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:brightness-110 transition-all flex items-center justify-center gap-2"
              >
                Tạo kịch bản
              </button>
            </div>
          </div>
        </div>
      )}

      <AITrainingModal isOpen={isTrainingOpen} onClose={() => setIsTrainingOpen(false)} aiName="AI Bán Hàng" />
    </main>
  );
}
