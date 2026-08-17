import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import AITrainingModal from '../components/AITrainingModal';
import {
  api, ApiError, POST_STATUS_LABELS,
  type Post, type PostStatus,
} from '../lib/api';
import { useActivePage } from '../lib/ActivePage';

/** Nhãn tab -> trạng thái trong database. */
const FILTER_TO_STATUS: Record<string, PostStatus> = {
  'Chờ duyệt': 'pending_approval',
  'Đã lên lịch': 'scheduled',
  'Đã đăng': 'published',
  'Bản nháp': 'draft',
};

export default function Content() {
  const { accounts, activeAccountId } = useActivePage();

  const [activeFilter, setActiveFilter] = useState('Chờ duyệt (0)');
  const [postMode, setPostMode] = useState<'manual' | 'auto'>('manual');
  const [showAutoConfirm, setShowAutoConfirm] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isTrainingOpen, setIsTrainingOpen] = useState(false);

  // Trạng thái ô soạn bài
  const [composerTopic, setComposerTopic] = useState('');
  const [composerGoal, setComposerGoal] = useState<'sales' | 'engagement' | 'announcement'>('sales');
  const [composerContent, setComposerContent] = useState('');
  const [composerMode, setComposerMode] = useState<'now' | 'schedule'>('now');
  const [aiOptions, setAiOptions] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingPostId, setEditingPostId] = useState<number | null>(null);

  const [dbPosts, setDbPosts] = useState<Post[]>([]);
  const [busyPostId, setBusyPostId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchPosts = useCallback(async () => {
    try {
      const { data } = await api.posts.list();
      setDbPosts(data);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không tải được danh sách bài');
    }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  /**
   * Chế độ đăng bài được lưu vào cấu hình AI, không giữ trong bộ nhớ trang.
   * Nếu chỉ giữ tại đây thì tải lại trang là mất, và tiến trình nền không
   * biết chủ shop có cho phép AI tự đăng hay không.
   */
  useEffect(() => {
    api.ai.config('content')
      .then(({ data }) => {
        if (data.config.settings?.autoPublish === true) setPostMode('auto');
      })
      .catch(() => { /* chưa có cấu hình thì dùng mặc định an toàn */ });
  }, []);

  const savePostMode = async (mode: 'manual' | 'auto') => {
    setPostMode(mode);
    try {
      const { data } = await api.ai.config('content');
      await api.ai.saveConfig('content', {
        systemPrompt: data.config.system_prompt,
        tone: data.config.tone,
        settings: { ...data.config.settings, autoPublish: mode === 'auto' },
      });
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không lưu được chế độ đăng bài');
    }
  };

  /** Kênh sẽ đăng: trang đang chọn, hoặc mọi kênh đăng được nếu đang xem tất cả. */
  const targetAccountIds = activeAccountId
    ? [activeAccountId]
    : accounts.filter((a) => a.connected).map((a) => a.id);

  const runAction = async (id: number, action: () => Promise<unknown>) => {
    setBusyPostId(id);
    setErrorMessage('');
    try {
      await action();
      await fetchPosts();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Thao tác thất bại');
    } finally {
      setBusyPostId(null);
    }
  };

  /** Duyệt rồi đăng thật lên nền tảng. */
  const handleApprove = (id: number) =>
    runAction(id, async () => {
      if (targetAccountIds.length === 0) {
        throw new ApiError('Chưa có kênh nào được kết nối để đăng bài.', 409);
      }
      await api.posts.update(id, { targetAccountIds });
      await api.posts.publish(id);
    });

  const handleSchedule = (id: number, current?: string | null) => {
    const suggestion = current
      ? new Date(current).toISOString().slice(0, 16)
      : new Date(Date.now() + 3600000).toISOString().slice(0, 16);
    const input = prompt(
      'Nhập thời gian đăng theo định dạng YYYY-MM-DDTHH:mm (giờ máy bạn):',
      suggestion
    );
    if (!input) return;
    const when = new Date(input);
    if (Number.isNaN(when.getTime())) {
      setErrorMessage('Thời gian không hợp lệ.');
      return;
    }
    if (when.getTime() <= Date.now()) {
      setErrorMessage('Thời gian hẹn đăng phải ở tương lai.');
      return;
    }
    return runAction(id, () =>
      api.posts.update(id, {
        status: 'scheduled',
        scheduledFor: when.toISOString(),
        targetAccountIds,
      })
    );
  };

  /** Huỷ lịch: đưa bài về chờ duyệt và xoá thời gian hẹn. */
  const handleCancelSchedule = (id: number) =>
    runAction(id, () =>
      api.posts.update(id, { status: 'pending_approval', scheduledFor: null })
    );

  const handleDelete = (id: number) => {
    if (!confirm('Bạn có chắc muốn xoá bài này?')) return;
    return runAction(id, () => api.posts.remove(id));
  };

  const handleEditPost = (post: Post) => {
    setEditingPostId(post.id);
    setComposerContent(post.content);
    setComposerTopic(post.ai_prompt ?? '');
    setAiOptions([]);
    setIsComposerOpen(true);
  };

  /** Mở bài đã đăng trên chính nền tảng. */
  const handleOpenOnPlatform = (post: Post) => {
    const url = Object.values(post.platform_urls ?? {}).find(
      (value) => typeof value === 'string' && value.startsWith('http')
    );
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else setErrorMessage('Nền tảng chưa trả về đường dẫn bài viết cho bài này.');
  };

  const handleGenerate = async () => {
    if (!composerTopic.trim()) {
      setErrorMessage('Hãy nhập chủ đề để AI viết bài.');
      return;
    }
    setIsGenerating(true);
    setErrorMessage('');
    try {
      const { options } = await api.ai.generatePost(composerTopic.trim(), composerGoal);
      setAiOptions(options);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'AI chưa viết được bài');
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * Lưu bài.
   *
   * "Đăng ngay" phải gọi Zernio thật rồi mới đánh dấu đã đăng. Bản cũ chỉ đổi
   * trạng thái sang "Đã đăng" mà không hề đăng, nên giao diện báo thành công
   * trong khi Fanpage không có bài nào.
   */
  const handleAcceptAiOption = async (optionContent: string) => {
    setErrorMessage('');
    try {
      const scheduledFor =
        composerMode === 'schedule' ? new Date(Date.now() + 86400000).toISOString() : null;

      let post: Post;
      if (editingPostId) {
        const result = await api.posts.update(editingPostId, {
          content: optionContent,
          targetAccountIds,
        });
        post = result.data;
      } else {
        const result = await api.posts.create({
          content: optionContent,
          status: composerMode === 'schedule' ? 'scheduled' : 'pending_approval',
          scheduledFor,
          targetAccountIds,
          aiGenerated: aiOptions.includes(optionContent),
          aiPrompt: composerTopic.trim() || undefined,
        });
        post = result.data;
      }

      // Đăng ngay: chỉ tự đăng khi chủ shop đã bật chế độ AI tự đăng.
      // Chế độ chờ duyệt thì bài nằm ở mục chờ duyệt, đúng như mô tả trên thẻ.
      if (composerMode === 'now' && postMode === 'auto') {
        if (targetAccountIds.length === 0) {
          throw new ApiError('Chưa có kênh nào được kết nối để đăng bài.', 409);
        }
        await api.posts.publish(post.id);
      }

      setIsComposerOpen(false);
      setAiOptions([]);
      setComposerTopic('');
      setComposerContent('');
      setEditingPostId(null);
      await fetchPosts();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không lưu được bài');
    }
  };

  const activeCounts = {
    pending: dbPosts.filter((p) => p.status === 'pending_approval').length,
    scheduled: dbPosts.filter((p) => p.status === 'scheduled').length,
    published: dbPosts.filter((p) => p.status === 'published').length,
    drafts: dbPosts.filter((p) => p.status === 'draft').length,
  };

  /** Bài đã đăng trong 7 ngày gần nhất. */
  const publishedThisWeek = dbPosts.filter(
    (p) => p.status === 'published' && p.published_at &&
      Date.now() - new Date(p.published_at).getTime() < 7 * 86400000
  ).length;

  /** Tương tác trung bình mỗi bài, tính từ số liệu thật của các bài đã đăng. */
  const avgEngagement = (() => {
    const withStats = dbPosts.filter((p) => p.status === 'published' && p.stats);
    if (withStats.length === 0) return 0;
    const total = withStats.reduce(
      (sum, p) => sum + (p.stats.likes ?? 0) + (p.stats.comments ?? 0) + (p.stats.shares ?? 0),
      0
    );
    return Math.round(total / withStats.length);
  })();

  const FILTERS = [
    `Chờ duyệt (${activeCounts.pending})`,
    `Đã lên lịch (${activeCounts.scheduled})`,
    'Đã đăng',
    'Bản nháp'
  ];

  const filteredPosts = useMemo(() => {
    const key = Object.keys(FILTER_TO_STATUS).find((label) => activeFilter.startsWith(label));
    const status = key ? FILTER_TO_STATUS[key] : 'draft';
    return dbPosts.filter((post) => post.status === status);
  }, [activeFilter, dbPosts]);

  const getStatusColor = (status: PostStatus) => {
    switch (status) {
      case 'pending_approval': return 'text-yellow-500 bg-yellow-500/20 border-yellow-500/30';
      case 'scheduled': return 'text-blue-500 bg-blue-500/20 border-blue-500/30';
      case 'published': return 'text-green-500 bg-green-500/20 border-green-500/30';
      case 'publishing': return 'text-primary bg-primary/20 border-primary/30';
      case 'failed': return 'text-error bg-error/20 border-error/30';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
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
              onClick={() => savePostMode('manual')}
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
              <span className="font-headline-sm text-3xl font-bold text-on-surface">{publishedThisWeek}</span>
            </div>
          </div>
          {activeCounts.published > publishedThisWeek && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-green-400 bg-green-400/10 self-start px-2 py-1 rounded-md mt-auto">
              <span className="material-symbols-outlined text-[14px]">trending_up</span>
              {activeCounts.published} bài tổng cộng
            </div>
          )}
        </div>

        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between group hover:border-primary/50 transition-colors h-[140px]">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-purple-500/10 blur-2xl rounded-full group-hover:bg-purple-500/20 transition-colors"></div>
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">TƯƠNG TÁC TRUNG BÌNH</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-sm text-3xl font-bold text-on-surface">{avgEngagement}</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">
              {activeCounts.published > 0 ? 'Lượt trên mỗi bài' : 'Chưa có bài nào được đăng'}
            </p>
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
                {POST_STATUS_LABELS[post.status].toUpperCase()}
              </span>
              <div className="flex gap-2">
                {post.status === 'pending_approval' && (
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

                {post.status === 'published' && post.stats && (
                  <div className="flex items-center gap-4 text-xs font-bold text-on-surface pt-3 border-t border-outline-variant/50">
                    <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px] text-primary">thumb_up</span> {post.stats.likes ?? 0}</span>
                    <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px] text-primary">chat_bubble</span> {post.stats.comments ?? 0}</span>
                    <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px] text-primary">share</span> {post.stats.shares ?? 0}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 bg-surface-container/50 border-t border-outline-variant/50 flex gap-2 shrink-0 mt-auto">
              {post.status === 'pending_approval' && (
                <>
                  <button onClick={() => handleApprove(post.id)} disabled={busyPostId === post.id} className="flex-1 py-2 bg-primary text-on-primary font-bold text-xs rounded-lg hover:brightness-110 transition-all shadow-sm disabled:opacity-60">{busyPostId === post.id ? 'Đang đăng…' : 'Duyệt và đăng'}</button>
                  <button onClick={() => handleEditPost(post)} className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50">Sửa</button>
                  <button onClick={() => handleDelete(post.id)} className="w-9 shrink-0 flex items-center justify-center bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors border border-error/20">
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </>
              )}
              {post.status === 'scheduled' && (
                <>
                  <button onClick={() => handleSchedule(post.id, post.scheduled_for)} className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50">Đổi lịch</button>
                  <button onClick={() => handleCancelSchedule(post.id)} className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50">Hủy lịch</button>
                </>
              )}
              {post.status === 'published' && (
                <>
                  <button onClick={() => handleOpenOnPlatform(post)} className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50">Xem trên nền tảng</button>
                  <button onClick={() => handleOpenOnPlatform(post)} className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50">Xem bình luận</button>
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
                    onClick={handleGenerate}
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
