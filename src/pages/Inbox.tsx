import { useState, useEffect, useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import {
  api, ApiError, formatCurrency, timeAgo, windowRemaining,
  type Conversation, type ConversationDetail,
} from '../lib/api';
import { useActivePage } from '../lib/ActivePage';
import { useNavigate } from 'react-router-dom';

/** Trạng thái hiển thị mà giao diện đang dùng cho chấm màu và nhãn. */
type DisplayStatus = 'waiting' | 'ai' | 'expiring' | 'expired' | 'done';

/**
 * Gộp trạng thái hội thoại và trạng thái cửa sổ 24 giờ thành một trạng thái
 * hiển thị. Cửa sổ sắp hết được ưu tiên vì đó là thứ khiến shop mất khách.
 */
function displayStatus(conv: Conversation): DisplayStatus {
  if (conv.status === 'done') return 'done';
  if (conv.window_state === 'expired') return 'expired';
  if (conv.window_state === 'closing') return 'expiring';
  if (conv.status === 'ai') return 'ai';
  return 'waiting';
}

export default function Inbox() {
  const navigate = useNavigate();
  const { accounts, activeAccountId, setActiveAccountId } = useActivePage();

  const [activeTab, setActiveTab] = useState('Tất cả');
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);

  /** Kênh đang xem trên thanh trên; mặc định theo trang đang chọn ở menu. */
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? accounts[0] ?? null;

  const TAB_STATUS: Record<string, string> = {
    'Tất cả': 'all',
    'Chờ tôi': 'waiting_human',
    'AI đang bán': 'ai',
    'Sắp hết giờ': 'expiring',
    'Đã xong': 'done',
  };

  const TABS = [
    'Tất cả',
    `Chờ tôi (${counts.waiting_human ?? 0})`,
    'AI đang bán',
    `Sắp hết giờ (${counts.expiring ?? 0})`,
    'Đã xong',
  ];

  const tabKey = (label: string) => label.replace(/\s*\(\d+\)$/, '');

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const status = TAB_STATUS[tabKey(activeTab)] ?? 'all';
      const [list, countData] = await Promise.all([
        api.inbox.conversations({
          accountId: activeAccount?.id,
          status,
          search: search.trim() || undefined,
        }),
        api.inbox.counts(),
      ]);
      setConversations(list.data);
      setCounts(countData.data);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không tải được hộp thư');
    } finally {
      setLoadingList(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id, activeTab, search]);

  useEffect(() => { loadList(); }, [loadList]);

  /** Chọn hội thoại đầu tiên khi đổi kênh hoặc đổi tab. */
  useEffect(() => {
    if (conversations.length === 0) { setSelectedId(''); setDetail(null); return; }
    if (!conversations.some((c) => c.id === selectedId)) setSelectedId(conversations[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  /** Nạp chi tiết hội thoại đang chọn. */
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoadingDetail(true);

    api.inbox.detail(selectedId)
      .then(({ data }) => { if (!cancelled) setDetail(data); })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof ApiError ? error.message : 'Không mở được hội thoại');
        }
      })
      .finally(() => { if (!cancelled) setLoadingDetail(false); });

    return () => { cancelled = true; };
  }, [selectedId]);

  /** Tự nạp lại danh sách mỗi 20 giây để tin mới hiện ra không cần bấm gì. */
  useEffect(() => {
    const timer = setInterval(() => { loadList(); }, 20_000);
    return () => clearInterval(timer);
  }, [loadList]);

  const handleSync = async () => {
    setSyncing(true);
    setErrorMessage('');
    try {
      await api.inbox.sync();
      await loadList();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Nạp lại thất bại');
    } finally {
      setSyncing(false);
    }
  };

  const handleSend = async () => {
    if (!detail || !draft.trim() || sending) return;
    setSending(true);
    setErrorMessage('');
    try {
      await api.inbox.send(detail.id, draft.trim());
      setDraft('');
      const { data } = await api.inbox.detail(detail.id);
      setDetail(data);
      await loadList();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không gửi được tin nhắn');
    } finally {
      setSending(false);
    }
  };

  /** Nhân viên tiếp quản: AI ngừng trả lời hội thoại này. */
  const handleTakeover = async () => {
    if (!detail) return;
    try {
      await api.inbox.setStatus(detail.id, 'human');
      const { data } = await api.inbox.detail(detail.id);
      setDetail(data);
      await loadList();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không tiếp quản được');
    }
  };

  /** Trả hội thoại lại cho AI. */
  const handleGiveBackToAi = async () => {
    if (!detail) return;
    try {
      await api.inbox.setStatus(detail.id, 'ai');
      const { data } = await api.inbox.detail(detail.id);
      setDetail(data);
      await loadList();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không trả lại cho AI được');
    }
  };

  const getPlatformConfig = (platform?: string) => {
    switch (platform) {
      case 'facebook': return { label: 'Messenger', short: 'FB', bg: 'bg-[#0084FF]', text: 'text-white' };
      case 'tiktok': return { label: 'TikTok', short: 'TT', bg: 'bg-white', text: 'text-black' };
      case 'instagram': return { label: 'Instagram', short: 'IG', bg: 'bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#962FBF]', text: 'text-white' };
      case 'telegram': return { label: 'Telegram', short: 'TG', bg: 'bg-[#229ED9]', text: 'text-white' };
      case 'threads': return { label: 'Threads', short: 'TH', bg: 'bg-black', text: 'text-white' };
      default: return { label: 'Tin nhắn', short: 'Web', bg: 'bg-primary', text: 'text-on-primary' };
    }
  };

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setShowCopyToast(true);
    setTimeout(() => setShowCopyToast(false), 2000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting': return 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)] animate-pulse';
      case 'ai': return 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]';
      case 'expiring': return 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]';
      case 'expired': return 'bg-red-500';
      case 'done': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'waiting': return 'Đang chờ xử lý';
      case 'ai': return 'AI đang tư vấn';
      case 'expiring': return 'Sắp hết 24h';
      case 'expired': return 'Quá hạn 24h';
      case 'done': return 'Đã xong';
      default: return '';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'waiting': return 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
      case 'ai': return 'bg-green-500/20 text-green-400 border border-green-500/30';
      case 'expiring': return 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/30';
      case 'expired': return 'bg-red-500/20 text-red-400 border border-red-500/30';
      case 'done': return 'bg-surface-variant text-on-surface-variant border border-outline-variant';
      default: return 'bg-surface-variant text-on-surface-variant border border-outline-variant';
    }
  };

  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedInfoMap, setExtractedInfoMap] = useState<Record<string, any>>({});

  /** Nhờ AI đọc lại hội thoại và bóc tách năm thông tin lên đơn. */
  const handleExtractInfo = async () => {
    if (!detail || isExtracting) return;
    setIsExtracting(true);
    setErrorMessage('');
    try {
      const { data } = await api.ai.extract(detail.id);
      setExtractedInfoMap((prev) => ({ ...prev, [detail.id]: data }));
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'AI chưa bóc tách được');
    } finally {
      setIsExtracting(false);
    }
  };

  /** Danh sách hội thoại đã chuyển sang hình dạng giao diện đang vẽ. */
  const filteredConversations = useMemo(
    () => conversations.map((conv) => ({
      id: conv.id,
      customerInitial: (conv.customer_name || '?').trim().charAt(0).toUpperCase(),
      customerName: conv.customer_name || 'Khách chưa có tên',
      platform: conv.platform,
      source: conv.origin === 'comment' ? 'Từ bình luận bài đăng' : 'Khách nhắn trực tiếp',
      status: displayStatus(conv),
      time: timeAgo(conv.last_message_at),
      lastMessage: conv.last_message || '(chưa có tin nhắn)',
      timeLeft: windowRemaining(conv.window_expires_at),
      unread: conv.unread_count,
      handoffReason: conv.handoff_reason,
      avatarUrl: conv.avatar_url,
    })),
    [conversations]
  );

  const selectedConvRaw = conversations.find((c) => c.id === selectedId) ?? null;

  /** Hội thoại đang mở, gộp chi tiết và tin nhắn theo hình dạng giao diện. */
  const selectedConv = useMemo(() => {
    if (!detail) return null;
    const status = displayStatus(detail);
    return {
      id: detail.id,
      customerInitial: (detail.customer_name || '?').trim().charAt(0).toUpperCase(),
      customerName: detail.customer_name || 'Khách chưa có tên',
      platform: detail.platform,
      source: detail.origin === 'comment' ? 'Từ bình luận bài đăng' : 'Khách nhắn trực tiếp',
      status,
      time: timeAgo(detail.last_message_at),
      timeLeft: windowRemaining(detail.window_expires_at),
      handoffReason: detail.handoff_reason,
      avatarUrl: detail.avatar_url,
      externalUrl: detail.external_url,
      canSend: detail.window_state !== 'expired',
      aiHandling: detail.status === 'ai',
      infoCollected: {
        name: detail.customer_name ?? 'Chưa có',
        phone: detail.phone ?? 'Chưa có',
        address: detail.address ?? 'Chưa có',
        product: 'Chưa có',
        quantity: 'Chưa có',
      },
      messages: detail.messages.map((m) => ({
        id: m.id,
        sender: m.sender_type === 'customer' ? 'customer' : 'shop',
        senderType: m.sender_type === 'ai' ? 'AI' : m.sender_type === 'customer' ? 'Khách' : m.sender_type === 'system' ? 'Hệ thống' : 'Nhân viên',
        text: m.content,
        time: new Date(m.sent_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        isHandoff: m.is_handoff,
      })),
    };
  }, [detail]);

  const getActiveInfo = () => {
    if (!selectedConv) return null;
    const extracted = extractedInfoMap[selectedConv.id];
    if (extracted) {
      return {
        name: extracted.name ?? selectedConv.infoCollected.name,
        phone: extracted.phone ?? selectedConv.infoCollected.phone,
        address: extracted.address ?? selectedConv.infoCollected.address,
        product: extracted.product ?? 'Chưa có',
        quantity: extracted.quantity ?? 'Chưa có',
      };
    }
    return selectedConv.infoCollected;
  };

  const activeInfo = getActiveInfo();
  const infoKeys = ['name', 'phone', 'address', 'product', 'quantity'];
  const collectedCount = activeInfo
    ? infoKeys.filter((k) => activeInfo[k as keyof typeof activeInfo] && activeInfo[k as keyof typeof activeInfo] !== 'Chưa có').length
    : 0;

  // --- Tạo đơn hàng từ hội thoại ---
  const [orderForm, setOrderForm] = useState({
    customerName: '', phone: '', address: '', product: '', quantity: 1, unitPrice: 0, note: '',
  });
  const [creatingOrder, setCreatingOrder] = useState(false);

  /** Mở biểu mẫu tạo đơn, điền sẵn thông tin AI đã thu thập. */
  const openOrderModal = () => {
    const info = getActiveInfo();
    setOrderForm({
      customerName: info?.name !== 'Chưa có' ? (info?.name ?? '') : '',
      phone: info?.phone !== 'Chưa có' ? (info?.phone ?? '') : '',
      address: info?.address !== 'Chưa có' ? (info?.address ?? '') : '',
      product: info?.product !== 'Chưa có' ? (info?.product ?? '') : '',
      quantity: Number(info?.quantity) > 0 ? Number(info?.quantity) : 1,
      unitPrice: 0,
      note: '',
    });
    setErrorMessage('');
    setIsOrderModalOpen(true);
  };

  const handleCreateOrder = async () => {
    if (!detail) return;
    if (!orderForm.product.trim()) {
      setErrorMessage('Hãy nhập tên sản phẩm.');
      return;
    }
    setCreatingOrder(true);
    setErrorMessage('');
    try {
      await api.orders.create({
        conversationId: detail.id,
        customerName: orderForm.customerName || undefined,
        phone: orderForm.phone || undefined,
        address: orderForm.address || undefined,
        product: orderForm.product.trim(),
        quantity: orderForm.quantity,
        unitPrice: orderForm.unitPrice,
        note: orderForm.note || undefined,
        closedBy: 'human',
      });
      setIsOrderModalOpen(false);
      await loadList();
      const { data } = await api.inbox.detail(detail.id);
      setDetail(data);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không tạo được đơn hàng');
    } finally {
      setCreatingOrder(false);
    }
  };

  return (
    <main className="flex flex-col w-full h-full bg-background overflow-hidden relative">
      {/* Toast Notification */}
      {showCopyToast && (
        <div className="fixed top-20 right-8 z-[100] bg-surface-container-high border border-primary/30 text-primary px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          <span className="font-bold text-sm">Đã sao chép số điện thoại</span>
        </div>
      )}

      {/* Top Menu Bar: Connected Accounts (Horizontal) */}
      <nav className="h-[52px] bg-background border-b border-outline-variant/50 flex items-center px-4 shrink-0 overflow-x-auto no-scrollbar gap-2 z-10">
        <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mr-1 shrink-0">Trang:</span>
        
        {accounts.map(acc => {
          const platformCfg = getPlatformConfig(acc.platform);
          const isActive = activeAccount?.id === acc.id;
          return (
            <button 
              key={acc.id}
              onClick={() => setActiveAccountId(acc.id)}
              className={clsx(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all border shrink-0 group",
                isActive 
                  ? "bg-primary/10 border-primary/30 text-primary shadow-[0_0_10px_rgba(0,229,255,0.05)]" 
                  : "bg-surface-container-lowest border-outline-variant/30 hover:bg-surface-container hover:border-outline-variant/50 text-on-surface-variant hover:text-on-surface"
              )}
            >
              <div className={clsx(
                "w-2 h-2 rounded-full shrink-0 shadow-sm",
                isActive ? platformCfg.bg : "bg-surface-variant group-hover:bg-on-surface-variant/50"
              )}></div>
              <span className="font-semibold text-xs whitespace-nowrap">{acc.display_name || acc.username}</span>
            </button>
          )
        })}

        <div className="w-[1px] h-4 bg-outline-variant/50 mx-1 shrink-0"></div>
        
        <button onClick={() => navigate('/connections')} className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-outline-variant/80 text-xs font-medium text-on-surface-variant hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all shrink-0">
          <span className="material-symbols-outlined text-[16px]">add</span>
          <span className="whitespace-nowrap">Thêm</span>
        </button>
      </nav>

      {/* Main Inbox Area (3 Panes left after removing the side menu) */}
      <div className="flex-1 flex flex-row w-full h-full overflow-hidden">
        
        {/* Pane 1: Conversation List */}
        <aside className="w-[320px] bg-surface-container-lowest border-r border-outline-variant/30 flex flex-col h-full flex-shrink-0 z-0">
          <div className="p-3 border-b border-outline-variant/30 shrink-0">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
              <input 
                type="text" 
                placeholder="Tìm khách hàng..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-background border border-outline-variant/50 rounded-lg pl-9 pr-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex overflow-x-auto border-b border-outline-variant/30 no-scrollbar shrink-0">
            {TABS.map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={clsx(
                  "whitespace-nowrap px-4 py-2.5 text-xs font-bold transition-colors relative",
                  activeTab === tab ? "text-primary" : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                {tab}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary shadow-[0_0_8px_rgba(0,229,255,0.8)]"></div>
                )}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5 no-scrollbar">
            {filteredConversations.length > 0 ? filteredConversations.map(conv => {
              const isSelected = selectedId === conv.id;
              return (
                <div 
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={clsx(
                    "p-3 rounded-lg flex gap-3 transition-all cursor-pointer relative overflow-hidden group",
                    isSelected ? "bg-surface-container-high border-none shadow-sm" : "hover:bg-surface-container-low border border-transparent"
                  )}
                >
                  {isSelected && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-md"></div>}
                  <div className="relative shrink-0 mt-0.5">
                    <div className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center font-bold text-on-surface">
                      {conv.customerInitial}
                    </div>
                    <div className={clsx("absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-surface-container-lowest", getStatusColor(conv.status))}></div>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span className={clsx("text-sm font-bold truncate", isSelected ? "text-primary" : "text-on-surface")}>
                        {conv.customerName}
                      </span>
                      <span className="text-[10px] text-on-surface-variant shrink-0">{conv.time}</span>
                    </div>
                    <p className="text-xs text-on-surface-variant truncate">{conv.lastMessage}</p>
                  </div>
                </div>
              )
            }) : (
              <div className="flex flex-col items-center justify-center h-full text-on-surface-variant/50 p-6 text-center space-y-2">
                  <span className="material-symbols-outlined text-4xl opacity-50">forum</span>
                  <p className="text-sm">Chưa có tin nhắn nào</p>
              </div>
            )}
          </div>
        </aside>

        {/* Pane 2: Chat Interface */}
        {selectedConv ? (
          <section className="flex-1 flex flex-col h-full min-w-[350px] bg-background">
            {/* Header */}
            <div className="h-16 border-b border-outline-variant/30 bg-surface-container-lowest px-4 flex items-center justify-between shrink-0">
              {/* Customer Info */}
              <div className="flex items-center gap-3 overflow-hidden pr-4">
                <div className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center font-bold text-on-surface shrink-0">
                  {selectedConv.customerInitial}
                </div>
                <div className="flex flex-col min-w-0">
                  <h3 className="text-sm font-bold text-on-surface truncate">
                    {selectedConv.customerName}
                  </h3>
                  <p className="text-[11px] text-on-surface-variant truncate">
                    {getPlatformConfig(selectedConv.platform).label} • {selectedConv.source}
                  </p>
                </div>
              </div>

              {/* AI Control */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-container rounded-md border border-outline-variant/50">
                  <div className={clsx("w-2 h-2 rounded-full", getStatusColor(selectedConv.status))}></div>
                  <span className="text-[11px] font-bold text-on-surface whitespace-nowrap">{getStatusText(selectedConv.status)}</span>
                </div>
                
                <div className="w-[1px] h-6 bg-outline-variant/50 mx-1"></div>
                
                {selectedConv.aiHandling ? (
                  <button onClick={handleTakeover} className="px-3 py-1.5 bg-error/10 text-error hover:bg-error hover:text-white font-bold text-xs rounded-md transition-colors flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">stop_circle</span>
                    <span className="hidden sm:inline">Dừng AI</span>
                  </button>
                ) : (
                  <button onClick={handleGiveBackToAi} className="px-3 py-1.5 bg-surface-container text-on-surface-variant hover:text-primary border border-outline-variant/50 font-bold text-xs rounded-md transition-colors flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                    <span className="hidden sm:inline">Trả cho AI</span>
                  </button>
                )}
                <button onClick={handleTakeover} className="px-3 py-1.5 bg-primary text-on-primary font-bold text-xs rounded-md hover:brightness-110 transition-colors shadow-sm flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">person</span>
                  <span className="hidden sm:inline">Người chat</span>
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-background relative custom-scrollbar">
              
              {/* Handoff Reason Banner inside chat */}
              {selectedConv.handoffReason && (
                <div className="mx-auto max-w-[80%] mb-4 bg-orange-400/10 border border-orange-400/30 text-orange-400 rounded-lg p-3 text-sm flex gap-3 items-start">
                  <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">warning</span>
                  <div>
                    <p className="font-bold mb-0.5">AI đã nhường quyền cho bạn</p>
                    <p className="text-orange-400/80 text-xs">Lý do: {selectedConv.handoffReason}</p>
                  </div>
                </div>
              )}

              <div className="text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant bg-surface-container-low px-3 py-1 rounded-full border border-outline-variant/30">Hôm nay</span>
              </div>
              
              {selectedConv.messages.map((msg: any) => {
                const isShop = msg.sender === 'shop';
                const isAI = isShop && msg.senderType === 'AI';
                
                return (
                  <div key={msg.id} className={clsx("flex flex-col w-full max-w-[85%]", isShop ? "ml-auto items-end" : "mr-auto items-start")}>
                    <div className="flex items-baseline gap-2 mb-1">
                      {isShop ? (
                        <>
                          <span className="text-[10px] text-on-surface-variant font-medium">{msg.time}</span>
                          <span className={clsx("text-[10px] font-bold uppercase tracking-wider", isAI ? "text-primary" : "text-secondary")}>{msg.senderType}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-[10px] font-bold text-on-surface uppercase tracking-wider">{msg.senderType}</span>
                          <span className="text-[10px] text-on-surface-variant font-medium">{msg.time}</span>
                        </>
                      )}
                    </div>
                    <div className={clsx(
                      "px-4 py-2.5 rounded-2xl relative shadow-sm",
                      isShop 
                        ? isAI 
                          ? "bg-surface-container-highest text-on-surface rounded-tr-sm border border-primary/20 before:absolute before:inset-0 before:rounded-2xl before:border before:border-primary/10 before:pointer-events-none before:shadow-[inset_0_0_15px_rgba(0,229,255,0.05)]" 
                          : "bg-primary text-on-primary rounded-tr-sm"
                        : "bg-surface-variant text-on-surface rounded-tl-sm border border-outline-variant/30"
                    )}>
                      {isAI && <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary shadow-[0_0_5px_rgba(0,229,255,0.8)]"></div>}
                      <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Composer */}
            <div className="p-4 bg-surface-container-lowest border-t border-outline-variant/30 z-10 shrink-0">
              {selectedConv.status === 'ai' && (
                <div className="mb-3 px-3 py-2 bg-primary/10 border border-primary/20 rounded-md flex items-center gap-2 text-xs text-primary">
                  <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                  <span className="font-medium">AI đang chat. Bạn gửi tin nhắn sẽ tự động lấy lại quyền điều khiển.</span>
                </div>
              )}
              
              <div className="bg-background rounded-xl border border-outline-variant/50 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all flex items-end p-1.5 shadow-sm">
                <button
                  onClick={handleExtractInfo}
                  disabled={isExtracting}
                  title="Nhờ AI bóc tách thông tin lên đơn từ hội thoại"
                  className="p-2 text-on-surface-variant hover:text-primary transition-colors shrink-0 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[20px]">{isExtracting ? 'sync' : 'add_circle'}</span>
                </button>
                <textarea 
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                  }}
                  disabled={!selectedConv.canSend || sending}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-on-surface placeholder:text-on-surface-variant/50 resize-none py-2 px-2 text-sm max-h-24 min-h-[40px] focus:outline-none custom-scrollbar disabled:cursor-not-allowed" 
                  placeholder={selectedConv.canSend ? 'Nhập tin nhắn…' : 'Đã quá 24 giờ, nền tảng không cho gửi tin nữa'} 
                  rows={1}
                ></textarea>
                <button
                  onClick={() => selectedConv.externalUrl && window.open(selectedConv.externalUrl, '_blank', 'noopener,noreferrer')}
                  disabled={!selectedConv.externalUrl}
                  title="Mở hội thoại trên nền tảng"
                  className="p-2 text-on-surface-variant hover:text-primary transition-colors shrink-0 disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-[20px]">open_in_new</span>
                </button>
                <button
                  onClick={handleSend}
                  disabled={!selectedConv.canSend || sending || !draft.trim()}
                  className="w-10 h-10 ml-1 bg-primary text-on-primary rounded-lg hover:brightness-110 transition-colors flex items-center justify-center shrink-0 shadow-[0_2px_10px_rgba(0,229,255,0.2)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[18px] ml-0.5">{sending ? 'sync' : 'send'}</span>
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="flex-1 flex flex-col h-full bg-background items-center justify-center text-on-surface-variant/50 min-w-[350px]">
            <span className="material-symbols-outlined text-6xl mb-4 opacity-50">forum</span>
            <p className="text-sm font-medium">Chọn một cuộc trò chuyện để xem</p>
          </section>
        )}

        {/* Pane 3: Customer Info (Right Panel) */}
        {selectedConv && (
          <aside className="w-[300px] bg-surface-container-lowest border-l border-outline-variant/30 flex flex-col h-full flex-shrink-0 z-0 overflow-y-auto no-scrollbar">
            <div className="flex-1 p-4 space-y-6">
              
              <div className="flex flex-col items-center text-center mt-2">
                <div className="w-16 h-16 rounded-full bg-surface-variant flex items-center justify-center font-bold text-2xl text-on-surface mb-3 border-2 border-background shadow-md relative">
                  {selectedConv.customerInitial}
                  <div className={clsx("absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-background", getPlatformConfig(selectedConv.platform).bg, getPlatformConfig(selectedConv.platform).text)}>
                    {getPlatformConfig(selectedConv.platform).short[0]}
                  </div>
                </div>
                <h3 className="font-headline-sm text-base font-bold text-on-surface">{selectedConv.customerName}</h3>
              </div>

              {/* Block 1: AI Collected Info */}
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h4 className="font-mono text-[10px] font-bold text-primary tracking-wider uppercase">Thu thập bởi AI</h4>
                  <button 
                    onClick={handleExtractInfo}
                    disabled={isExtracting}
                    className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/30 px-2 py-1 rounded hover:bg-primary/20 transition-colors disabled:opacity-50"
                  >
                    {isExtracting ? (
                      <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      <span className="material-symbols-outlined text-[12px]">magic_button</span>
                    )}
                    {isExtracting ? 'Đang đọc...' : 'Quét lại'}
                  </button>
                </div>
                <div className="bg-surface-container/50 rounded-xl border border-outline-variant/30 p-3 space-y-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-on-surface-variant">Họ tên</span>
                    <span className={clsx("text-sm font-medium", !activeInfo.name || activeInfo.name === 'Chưa có' ? 'text-on-surface-variant/40' : 'text-on-surface')}>{activeInfo.name || 'Chưa có'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-on-surface-variant">Số điện thoại</span>
                    <div className="flex items-center gap-2">
                      <span className={clsx("text-sm font-medium", !activeInfo.phone || activeInfo.phone === 'Chưa có' ? 'text-on-surface-variant/40' : 'text-on-surface')}>
                        {activeInfo.phone || 'Chưa có'}
                      </span>
                      {activeInfo.phone && activeInfo.phone !== 'Chưa có' && (
                        <button onClick={() => handleCopyPhone(activeInfo.phone)} className="text-on-surface-variant hover:text-primary transition-colors p-0.5" title="Sao chép">
                          <span className="material-symbols-outlined text-[14px]">content_copy</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-on-surface-variant">Địa chỉ</span>
                    <span className={clsx("text-sm font-medium", !activeInfo.address || activeInfo.address === 'Chưa có' ? 'text-on-surface-variant/40' : 'text-on-surface')}>{activeInfo.address || 'Chưa có'}</span>
                  </div>
                  
                  <div className="pt-3 border-t border-outline-variant/30">
                    <div className="flex justify-between text-[10px] font-bold text-on-surface mb-1.5">
                      <span>Tiến độ thu thập</span>
                      <span className="text-primary">{collectedCount}/5</span>
                    </div>
                    <div className="w-full bg-surface-variant rounded-full h-1 overflow-hidden">
                      <div 
                        className="bg-primary h-full rounded-full transition-all duration-500"
                        style={{ width: `${(collectedCount / 5) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Block 2: Actions */}
              <div className="flex flex-col gap-2">
                <button 
                  onClick={openOrderModal}
                  className="w-full py-2.5 text-xs font-bold bg-primary text-on-primary rounded-lg shadow-[0_4px_10px_rgba(0,229,255,0.2)] hover:brightness-110 transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                  Tạo đơn hàng
                </button>
                <button
                  onClick={() => selectedConv?.externalUrl
                    ? window.open(selectedConv.externalUrl, '_blank', 'noopener,noreferrer')
                    : setErrorMessage('Nền tảng chưa cung cấp đường dẫn cho hội thoại này.')}
                  className="w-full py-2.5 text-xs font-bold text-on-surface-variant bg-surface-container/50 border border-outline-variant/30 hover:text-on-surface hover:bg-surface-variant rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                  Xem trên nền tảng
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Auto-fill Order Modal */}
      {isOrderModalOpen && selectedConv && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-[600px] bg-surface-container-lowest rounded-xl border border-outline-variant/50 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-5 py-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-lowest">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">receipt_long</span>
                <h3 className="font-bold text-on-surface text-lg">Tạo Đơn Hàng Mới</h3>
              </div>
              <button onClick={() => setIsOrderModalOpen(false)} className="text-on-surface-variant hover:text-on-surface p-1 rounded-md hover:bg-surface-variant transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5 bg-background">
              <div className="flex items-center gap-3 px-4 py-3 bg-primary/10 border border-primary/20 rounded-lg text-primary">
                <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                <div>
                  <p className="text-sm font-bold mb-0.5">AI đã tự động điền thông tin</p>
                  <p className="text-xs text-primary/80">Dữ liệu được trích xuất từ cuộc trò chuyện với {selectedConv.customerName}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Họ tên khách hàng <span className="text-error">*</span></label>
                  <input type="text" value={orderForm.customerName} onChange={(e) => setOrderForm({ ...orderForm, customerName: e.target.value })} className="w-full bg-surface-container border border-outline-variant/50 rounded-lg px-3 py-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all" placeholder="Nhập họ tên..." />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Số điện thoại <span className="text-error">*</span></label>
                  <input type="text" value={orderForm.phone} onChange={(e) => setOrderForm({ ...orderForm, phone: e.target.value })} className="w-full bg-surface-container border border-outline-variant/50 rounded-lg px-3 py-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all" placeholder="Nhập SĐT..." />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Địa chỉ giao hàng <span className="text-error">*</span></label>
                <input type="text" value={orderForm.address} onChange={(e) => setOrderForm({ ...orderForm, address: e.target.value })} className="w-full bg-surface-container border border-outline-variant/50 rounded-lg px-3 py-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all" placeholder="Nhập địa chỉ chi tiết..." />
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-3 space-y-1.5">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Sản phẩm <span className="text-error">*</span></label>
                  <input type="text" value={orderForm.product} onChange={(e) => setOrderForm({ ...orderForm, product: e.target.value })} className="w-full bg-surface-container border border-outline-variant/50 rounded-lg px-3 py-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all" placeholder="Tên hoặc mã sản phẩm..." />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Số lượng</label>
                  <input type="number" min={1} value={orderForm.quantity} onChange={(e) => setOrderForm({ ...orderForm, quantity: Math.max(1, Number(e.target.value) || 1) })} className="w-full bg-surface-container border border-outline-variant/50 rounded-lg px-3 py-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all text-center" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Đơn giá (đ)</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={orderForm.unitPrice}
                    onChange={(e) => setOrderForm({ ...orderForm, unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full bg-surface-container border border-outline-variant/50 rounded-lg px-3 py-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all text-right"
                    placeholder="0"
                  />
                  <p className="text-[10px] text-on-surface-variant/70">
                    Tổng: {formatCurrency(orderForm.quantity * orderForm.unitPrice)}
                  </p>
                </div>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Ghi chú đơn hàng</label>
                <textarea rows={2} className="w-full bg-surface-container border border-outline-variant/50 rounded-lg px-3 py-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all custom-scrollbar" value={orderForm.note} onChange={(e) => setOrderForm({ ...orderForm, note: e.target.value })} placeholder="Ghi chú cho đơn vị vận chuyển hoặc dặn dò của khách..."></textarea>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-outline-variant/30 flex justify-between items-center bg-surface-container-lowest">
              <div className="text-xs text-on-surface-variant font-medium">
                Đơn hàng sẽ được chuyển sang tab Đơn Hàng
              </div>
              <div className="flex gap-3">
                <button onClick={() => setIsOrderModalOpen(false)} className="px-4 py-2 text-sm font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-variant rounded-lg transition-colors">
                  Hủy
                </button>
                <button
                  onClick={handleCreateOrder}
                  disabled={creatingOrder}
                  className="px-6 py-2 text-sm font-bold bg-primary text-on-primary rounded-lg shadow-[0_4px_10px_rgba(0,229,255,0.2)] hover:brightness-110 transition-all flex items-center gap-2 disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  {creatingOrder ? 'Đang lưu…' : 'Lưu Đơn & Báo Cáo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
