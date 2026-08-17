import React, { useState, useMemo, useEffect } from 'react';
import { clsx } from 'clsx';
import { mockPosts } from '../data/mockApi';
import AITrainingModal from '../components/AITrainingModal';

export default function Content() {
  const [activeFilter, setActiveFilter] = useState('Chờ duyệt (0)');
  const [postMode, setPostMode] = useState<'manual' | 'auto'>('manual');
  const [showAutoConfirm, setShowAutoConfirm] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isTrainingOpen, setIsTrainingOpen] = useState(false);
  
  // Composer state
  const [composerTopic, setComposerTopic] = useState('');
  const [composerGoal, setComposerGoal] = useState<'sales' | 'engagement' | 'announcement'>('sales');
  const [composerContent, setComposerContent] = useState('');
  const [composerMode, setComposerMode] = useState<'now' | 'schedule'>('now');
  const [aiOptions, setAiOptions] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const [dbPosts, setDbPosts] = useState<any[]>([]);

  const fetchPosts = async () => {
    try {
      const response = await fetch('/api/posts');
      const data = await response.json();
      if (data.success) {
        setDbPosts(data.data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleApprove = async (id: string) => {
    await fetch(`/api/posts/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Đã đăng' })
    });
    fetchPosts();
  };

  const handleSchedule = async (id: string) => {
    const hours = prompt('Nhập số giờ đếm ngược để đăng (ví dụ: 2):', '2');
    if (!hours) return;
    const scheduleTime = new Date(Date.now() + parseInt(hours) * 3600000);
    await fetch(`/api/posts/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Đã lên lịch', scheduleTime: scheduleTime.toISOString() })
    });
    fetchPosts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xoá bài này?')) return;
    await fetch(`/api/posts/${id}`, { method: 'DELETE' });
    fetchPosts();
  };

  const handleAcceptAiOption = async (optionContent: string) => {
    await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: optionContent,
        status: composerMode === 'now' ? 'Đã đăng' : (postMode === 'auto' ? 'Đã lên lịch' : 'Chờ duyệt'),
        scheduleTime: composerMode === 'schedule' ? new Date(Date.now() + 86400000).toISOString() : null
      })
    });
    setIsComposerOpen(false);
    setAiOptions([]);
    setComposerTopic('');
    setComposerContent('');
    fetchPosts();
  };

  const activeCounts = {
    pending: dbPosts.filter(p => p.status === 'Chờ duyệt').length,
    scheduled: dbPosts.filter(p => p.status === 'Đã lên lịch').length,
    published: dbPosts.filter(p => p.status === 'Đã đăng').length,
    drafts: dbPosts.filter(p => p.status === 'Bản nháp').length,
  };

  const FILTERS = [
    `Chờ duyệt (${activeCounts.pending})`,
    `Đã lên lịch (${activeCounts.scheduled})`,
    'Đã đăng',
    'Bản nháp'
  ];


  const filteredPosts = useMemo(() => {
    let filterStatus = '';
    if (activeFilter.includes('Chờ duyệt')) filterStatus = 'Chờ duyệt';
    else if (activeFilter.includes('Đã lên lịch')) filterStatus = 'Đã lên lịch';
    else if (activeFilter.includes('Đã đăng')) filterStatus = 'Đã đăng';
    else filterStatus = 'Bản nháp';

    return dbPosts.filter(post => post.status === filterStatus);
  }, [activeFilter, dbPosts]);

  

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Chờ duyệt': return 'text-yellow-500 bg-yellow-500/20 border-yellow-500/30';
      case 'Đã lên lịch': return 'text-blue-500 bg-blue-500/20 border-blue-500/30';
      case 'Đã đăng': return 'text-green-500 bg-green-500/20 border-green-500/30';
      case 'Bản nháp': return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
      default: return 'text-on-surface bg-surface-variant border-outline-variant';
    }
  };

  const handleAutoModeSelect = () => {
    if (postMode === 'manual') {
      setShowAutoConfirm(true);
    }
  };

  const confirmAutoMode = () => {
    setPostMode('auto');
    setShowAutoConfirm(false);
  };

  const generateAIPost = async () => {
    if (!composerTopic) return;
    setIsGenerating(true);
    try {
      const response = await fetch('/api/ai/generate-post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          topic: composerTopic,
          goal: composerGoal
        })
      });
      
      const data = await response.json();
      if (data.success && data.options) {
        setAiOptions(data.options);
      } else {
        console.error("AI Generation failed:", data.error);
        alert("Lỗi khi tạo bài viết: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error calling AI API:", error);
      alert("Không thể kết nối đến máy chủ AI.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="flex-1  p-6 md:p-8 max-w-7xl mx-auto w-full relative    bg-background">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-headline-sm text-3xl font-bold text-on-surface tracking-tight">AI Viết - Đăng Bài</h1>
            <span className="font-mono text-xs font-bold tracking-wider text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full uppercase">
              {activeCounts.pending} BÀI CHỜ DUYỆT
            </span>
          </div>
          <p className="text-on-surface-variant text-sm">AI tự viết bài, bạn duyệt hoặc để AI đăng tự động</p>
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
            Tạo bài mới
          </button>
        </div>
      </div>

      {/* Row 1: Mode Selection Card */}
      <div className="bg-surface-container/30 border-2 border-primary/40 rounded-2xl p-6 mb-8 relative overflow-hidden group hover:border-primary/60 transition-colors shadow-[0_0_30px_rgba(0,229,255,0.05)]">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-bl-full -mr-20 -mt-20 blur-3xl pointer-events-none"></div>
        <div className="flex flex-col lg:flex-row lg:items-center gap-8 relative z-10">
          <div className="flex-1">
            <span className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-2 block">CHẾ ĐỘ ĐĂNG BÀI</span>
            <h2 className="text-xl font-bold text-on-surface mb-2">{postMode === 'manual' ? 'AI đang chờ bạn duyệt' : 'AI đang tự động đăng bài'}</h2>
            <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">
              {postMode === 'manual' 
                ? 'AI viết xong sẽ đưa vào mục chờ duyệt.\nBài chỉ lên sóng khi bạn bấm duyệt.'
                : 'AI sẽ tự viết và tự động lên lịch/đăng bài.\nBạn có thể xem lại trong mục Đã lên lịch hoặc Đã đăng.'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 shrink-0 lg:w-[500px]">
            <div 
              onClick={() => setPostMode('manual')}
              className={clsx(
                "flex-1 p-4 rounded-xl border cursor-pointer transition-all",
                postMode === 'manual' 
                  ? "bg-primary/10 border-primary text-primary shadow-[0_0_15px_rgba(0,229,255,0.2)]" 
                  : "bg-surface-container/50 border-outline-variant hover:border-primary/50 text-on-surface-variant"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={clsx("font-bold text-sm", postMode === 'manual' ? "text-primary" : "text-on-surface")}>Chờ tôi duyệt</span>
                {postMode === 'manual' && <span className="material-symbols-outlined text-[18px]">check_circle</span>}
              </div>
              <p className="text-xs opacity-80">An toàn hơn, bạn kiểm soát mọi bài</p>
              {postMode === 'manual' && <span className="inline-block mt-3 text-[10px] font-bold px-2 py-0.5 bg-primary/20 rounded-sm uppercase tracking-wider">ĐANG ĐƯỢC CHỌN</span>}
            </div>

            <div 
              onClick={handleAutoModeSelect}
              className={clsx(
                "flex-1 p-4 rounded-xl border cursor-pointer transition-all",
                postMode === 'auto' 
                  ? "bg-primary/10 border-primary text-primary shadow-[0_0_15px_rgba(0,229,255,0.2)]" 
                  : "bg-surface-container/50 border-outline-variant hover:border-primary/50 text-on-surface-variant"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={clsx("font-bold text-sm", postMode === 'auto' ? "text-primary" : "text-on-surface")}>AI tự đăng luôn</span>
                {postMode === 'auto' && <span className="material-symbols-outlined text-[18px]">check_circle</span>}
              </div>
              <p className="text-xs opacity-80">Nhanh hơn, không cần bạn can thiệp</p>
              {postMode === 'auto' && <span className="inline-block mt-3 text-[10px] font-bold px-2 py-0.5 bg-primary/20 rounded-sm uppercase tracking-wider">ĐANG ĐƯỢC CHỌN</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors h-[140px]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-yellow-500/10 blur-2xl rounded-full group-hover:bg-yellow-500/20 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">CHỜ DUYỆT</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-3xl font-bold text-on-surface">{activeCounts.pending}</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">Cần bạn xem qua</p>
          </div>
        </div>

        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors h-[140px]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/10 blur-2xl rounded-full group-hover:bg-blue-500/20 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">ĐÃ LÊN LỊCH</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-3xl font-bold text-on-surface">{activeCounts.scheduled}</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">Sẽ tự đăng đúng giờ</p>
          </div>
        </div>

        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors h-[140px]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/10 blur-2xl rounded-full group-hover:bg-primary/20 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">ĐÃ ĐĂNG TUẦN NÀY</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-3xl font-bold text-on-surface">{activeCounts.published}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-green-400 bg-green-400/10 self-start px-2 py-1 rounded-md mt-auto">
            <span className="material-symbols-outlined text-[14px]">trending_up</span>
            +4 so với tuần trước
          </div>
        </div>

        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors h-[140px]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-purple-500/10 blur-2xl rounded-full group-hover:bg-purple-500/20 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">TƯƠNG TÁC TRUNG BÌNH</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-3xl font-bold text-on-surface">248</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">Lượt trên mỗi bài</p>
          </div>
        </div>
      </div>

      {/* Row 3: Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {FILTERS.map(filter => {
          const isActive = activeFilter === filter;
          return (
            <button 
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={clsx(
                "px-4 py-2 rounded-full text-sm font-medium transition-colors border",
                isActive 
                  ? "bg-primary text-on-primary border-primary shadow-[0_0_10px_rgba(0,229,255,0.2)]" 
                  : "bg-surface-container/30 text-on-surface-variant border-outline-variant hover:bg-surface-container hover:text-on-surface"
              )}
            >
              {filter}
            </button>
          );
        })}
      </div>

      {/* Row 4: Posts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredPosts.map(post => (
          <div key={post.id} className="bg-surface-container/30 border border-outline-variant rounded-2xl overflow-hidden flex flex-col group hover:border-primary/30 transition-colors shadow-sm h-full">
            {/* Top Bar */}
            <div className="p-4 flex items-center justify-between border-b border-outline-variant/50">
              <span className={clsx("px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider border", getStatusColor(post.status))}>
                {post.status.toUpperCase()}
              </span>
              <div className="flex gap-2">
                {post.status === 'Chờ duyệt' && (
                  <>
                    <button onClick={() => handleApprove(post.id)} className="text-green-500 hover:bg-green-500/10 p-1 rounded-md transition-colors" title="Duyệt đăng">
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    </button>
                    <button onClick={() => handleSchedule(post.id)} className="text-blue-500 hover:bg-blue-500/10 p-1 rounded-md transition-colors" title="Lên lịch">
                      <span className="material-symbols-outlined text-[18px]">schedule</span>
                    </button>
                  </>
                )}
                <button onClick={() => handleDelete(post.id)} className="text-error hover:bg-error/10 p-1 rounded-md transition-colors" title="Xóa">
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            </div>

            {/* Image Placeholder */}
            {(post.platforms === 'has_image') && (
              <div className="h-[180px] min-h-[180px] max-h-[180px] flex-none w-full relative overflow-hidden bg-surface-variant flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-br from-surface-variant to-surface-container-high opacity-50"></div>
                <span className="material-symbols-outlined text-4xl text-on-surface-variant opacity-20">image</span>
              </div>
            )}

            {/* Content */}
            <div className="p-5 flex-1 flex flex-col">
              <p className="text-sm text-on-surface leading-relaxed line-clamp-4 mb-4">
                {post.content}
              </p>
              
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant/80">
                  <span className="material-symbols-outlined text-[14px] text-primary/80">auto_awesome</span>
                  {`AI viết lúc ${new Date(post.created_at).toLocaleTimeString('vi-VN')} ngày ${new Date(post.created_at).toLocaleDateString('vi-VN')}`}
                </div>
                
                <div className="flex items-center gap-1.5 text-xs font-bold text-on-surface">
                  <span className="material-symbols-outlined text-[14px]">schedule</span>
                  {(post.scheduled_for ? `Đăng lúc: ${new Date(post.scheduled_for).toLocaleTimeString('vi-VN')} ${new Date(post.scheduled_for).toLocaleDateString('vi-VN')}` : 'Chưa đặt lịch')}
                </div>

                {post.status === 'Đã đăng' && null && (
                  <div className="flex items-center gap-4 text-xs font-bold text-on-surface pt-3 border-t border-outline-variant/50">
                    <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px] text-primary">thumb_up</span> {null.likes}</span>
                    <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px] text-primary">chat_bubble</span> {null.comments}</span>
                    <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px] text-primary">share</span> {null.shares}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 bg-surface-container/50 border-t border-outline-variant/50 flex gap-2 shrink-0 mt-auto">
              {post.status === 'Chờ duyệt' && (
                <>
                  <button className="flex-1 py-2 bg-primary text-on-primary font-bold text-xs rounded-lg hover:brightness-110 transition-all shadow-sm">Duyệt và đăng</button>
                  <button onClick={() => setIsComposerOpen(true)} className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50">Sửa</button>
                  <button className="w-9 shrink-0 flex items-center justify-center bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors border border-error/20">
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </>
              )}
              {post.status === 'Đã lên lịch' && (
                <>
                  <button className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50">Đổi lịch</button>
                  <button className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50">Hủy lịch</button>
                </>
              )}
              {post.status === 'Đã đăng' && (
                <>
                  <button className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50">Xem trên Facebook</button>
                  <button className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50">Xem bình luận</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredPosts.length === 0 && (
        <div className="py-20 text-center flex flex-col items-center border border-dashed border-outline-variant rounded-2xl bg-surface-container/10">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-3 opacity-50">article</span>
          <p className="text-on-surface-variant font-medium">Không có bài đăng nào trong mục này</p>
        </div>
      )}

      {/* Centered Composer Panel */}
      {isComposerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div 
            className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => { setIsComposerOpen(false); setAiOptions([]); }}
          ></div>
          <div className="relative w-full max-w-[640px] max-h-[90vh] bg-surface-container-high border border-primary/30 rounded-2xl shadow-[0_0_40px_rgba(0,229,255,0.1)] flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-outline-variant flex items-center justify-between bg-surface-container/50 shrink-0">
              <h2 className="font-headline-sm text-xl font-bold text-on-surface">Soạn bài đăng</h2>
              <button 
                onClick={() => setIsComposerOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-variant text-on-surface hover:bg-outline-variant transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
              
              {/* Block 1: NHỜ AI VIẾT */}
              <div>
                <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-3">NHỜ AI VIẾT</h3>
                <div className="bg-surface-container rounded-xl p-4 border border-outline-variant space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-2">Bạn muốn viết về gì?</label>
                    <input 
                      type="text" 
                      value={composerTopic}
                      onChange={(e) => setComposerTopic(e.target.value)}
                      placeholder="Ví dụ: giới thiệu sản phẩm mới, thông báo khuyến mãi cuối tuần..."
                      className="w-full bg-surface-container-high border border-outline-variant rounded-lg p-3 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => setComposerGoal('sales')}
                      className={clsx("px-3 py-1.5 rounded-full text-xs font-bold transition-colors border", composerGoal === 'sales' ? "bg-primary/20 text-primary border-primary/40" : "bg-surface-variant text-on-surface-variant border-outline-variant hover:bg-surface-container-high")}
                    >Bán hàng</button>
                    <button 
                      onClick={() => setComposerGoal('engagement')}
                      className={clsx("px-3 py-1.5 rounded-full text-xs font-bold transition-colors border", composerGoal === 'engagement' ? "bg-primary/20 text-primary border-primary/40" : "bg-surface-variant text-on-surface-variant border-outline-variant hover:bg-surface-container-high")}
                    >Tăng tương tác</button>
                    <button 
                      onClick={() => setComposerGoal('announcement')}
                      className={clsx("px-3 py-1.5 rounded-full text-xs font-bold transition-colors border", composerGoal === 'announcement' ? "bg-primary/20 text-primary border-primary/40" : "bg-surface-variant text-on-surface-variant border-outline-variant hover:bg-surface-container-high")}
                    >Thông báo</button>
                  </div>
                  <button 
                    onClick={generateAIPost}
                    disabled={isGenerating}
                    className="w-full py-2.5 bg-primary/10 text-primary border border-primary/30 rounded-lg font-bold text-sm hover:bg-primary/20 transition-colors flex items-center justify-center gap-2"
                  >
                    {isGenerating ? (
                      <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                    )}
                    Nhờ AI viết
                  </button>

                  {/* AI Output Options */}
                  {aiOptions.length > 0 && (
                    <div className="mt-4 space-y-3">
                      <p className="text-xs font-bold text-on-surface-variant uppercase">Chọn một phương án:</p>
                      {aiOptions.map((opt, idx) => (
                        <div key={idx} className="p-3 bg-surface-container-highest border border-outline-variant rounded-lg group">
                          <p className="text-sm text-on-surface mb-3 leading-relaxed">{opt}</p>
                          <button 
                            onClick={() => {
                              setComposerContent(opt);
                              setAiOptions([]);
                            }}
                            className="w-full py-1.5 bg-surface-variant text-on-surface font-bold text-xs rounded-md hover:bg-primary hover:text-on-primary transition-colors"
                          >
                            Dùng bài này
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Block 2: NỘI DUNG BÀI ĐĂNG */}
              <div>
                <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-3">NỘI DUNG BÀI ĐĂNG</h3>
                <div className="relative">
                  <textarea 
                    rows={10}
                    value={composerContent}
                    onChange={(e) => setComposerContent(e.target.value)}
                    placeholder="Nội dung bài viết sẽ hiển thị trên Fanpage..."
                    className="w-full bg-surface-container rounded-xl border border-outline-variant p-4 text-sm text-on-surface leading-relaxed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all resize-none "
                  ></textarea>
                  <span className="absolute bottom-3 right-4 text-xs font-mono text-on-surface-variant">{composerContent.length} ký tự</span>
                </div>
              </div>

              {/* Block 3: ẢNH VÀ VIDEO */}
              <div>
                <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-3">ẢNH VÀ VIDEO</h3>
                <div className="border-2 border-dashed border-outline-variant rounded-xl p-8 flex flex-col items-center justify-center bg-surface-container/30 hover:bg-surface-container/50 hover:border-primary/50 transition-colors cursor-pointer group">
                  <div className="w-12 h-12 rounded-full bg-surface-variant flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-on-surface-variant">upload_file</span>
                  </div>
                  <span className="text-sm font-medium text-on-surface-variant">Kéo thả ảnh vào đây hoặc bấm để chọn</span>
                </div>
                {/* Fake selected images row */}
                <div className="flex gap-3 mt-4">
                  <div className="w-20 h-20 rounded-lg bg-surface-variant border border-outline-variant relative group overflow-hidden">
                    <img src="https://images.unsplash.com/photo-1511920170033-f8396924c348?w=150&q=80" alt="thumb" className="w-full h-full object-cover opacity-80" />
                    <button className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error">
                      <span className="material-symbols-outlined text-[12px] text-white">close</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Block 4: THỜI GIAN ĐĂNG */}
              <div>
                <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-3">THỜI GIAN ĐĂNG</h3>
                <div className="bg-surface-container rounded-xl p-4 border border-outline-variant space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center w-5 h-5">
                      <input 
                        type="radio" 
                        name="schedule" 
                        className="peer appearance-none w-5 h-5 border-2 border-outline-variant rounded-full checked:border-primary cursor-pointer transition-colors"
                        checked={composerMode === 'now'}
                        onChange={() => setComposerMode('now')}
                      />
                      <div className="absolute w-2.5 h-2.5 rounded-full bg-primary opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"></div>
                    </div>
                    <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">Đăng ngay</span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center w-5 h-5">
                      <input 
                        type="radio" 
                        name="schedule" 
                        className="peer appearance-none w-5 h-5 border-2 border-outline-variant rounded-full checked:border-primary cursor-pointer transition-colors"
                        checked={composerMode === 'schedule'}
                        onChange={() => setComposerMode('schedule')}
                      />
                      <div className="absolute w-2.5 h-2.5 rounded-full bg-primary opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"></div>
                    </div>
                    <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">Hẹn giờ</span>
                  </label>

                  {composerMode === 'schedule' && (
                    <div className="pl-8 flex gap-3">
                      <input type="date" className="bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none" />
                      <input type="time" className="bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none" />
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
                Lưu nháp
              </button>
              <button 
                onClick={() => setIsComposerOpen(false)}
                className="flex-[2] py-3 rounded-xl bg-primary text-on-primary font-bold text-sm shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:brightness-110 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">send</span> Đăng bài
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto Mode Confirmation Dialog */}
      {showAutoConfirm && (
        <>
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60]"></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface-container-high border border-yellow-500/50 rounded-2xl p-6 shadow-2xl z-[70] w-[400px] max-w-[90vw] animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center mb-4 mx-auto">
              <span className="material-symbols-outlined text-yellow-500 text-2xl">warning</span>
            </div>
            <h3 className="text-lg font-bold text-on-surface text-center mb-2">Bật chế độ AI tự đăng?</h3>
            <p className="text-sm text-on-surface-variant text-center mb-6 leading-relaxed">
              AI sẽ tự viết và đăng bài lên Fanpage của bạn mà không cần bạn duyệt trước. Bạn vẫn xem lại và xóa bài sau khi đã đăng.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowAutoConfirm(false)}
                className="flex-1 py-2.5 rounded-lg border border-outline-variant text-on-surface font-bold text-sm hover:bg-surface-variant transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={confirmAutoMode}
                className="flex-1 py-2.5 rounded-lg bg-yellow-500 text-black font-bold text-sm shadow-lg hover:brightness-110 transition-all"
              >
                Tôi hiểu, bật chế độ này
              </button>
            </div>
          </div>
        </>
      )}

      <AITrainingModal isOpen={isTrainingOpen} onClose={() => setIsTrainingOpen(false)} aiName="AI Viết - Đăng Bài" />
    </main>
  );
}
