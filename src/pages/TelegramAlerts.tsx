import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { api, ApiError, timeAgo } from '../lib/api';

/** Khoá sự kiện trong database <-> nhãn hiển thị. */
const EVENT_KEYS = {
  new_order: 'Đơn hàng mới',
  handoff: 'Khách cần người hỗ trợ',
  near_24h: 'Sắp hết 24 giờ',
  daily_summary: 'Tổng kết ngày',
  weekly_summary: 'Tổng kết tuần',
  post_published: 'Bài đã đăng',
  new_comment: 'Bình luận mới',
  ads_budget: 'Cảnh báo ngân sách quảng cáo',
} as const;

interface LogRow {
  id: number;
  kind: string;
  content: string;
  status: string;
  error: string | null;
  created_at: string;
}

export default function TelegramAlerts() {
  const [isConnected, setIsConnected] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [chatId, setChatId] = useState('');
  const [botTokenInput, setBotTokenInput] = useState('');
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [events, setEvents] = useState<Record<string, boolean>>({});
  const [dailySummaryTime, setDailySummaryTime] = useState('20:00');

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.settings.telegram();
      setHasToken(data.hasToken);
      setChatId(data.chatId);
      setIsConnected(data.enabled && data.hasToken && Boolean(data.chatId));
      setVerifiedAt(data.verifiedAt);
      setLogs(data.logs);
      setEvents(data.events ?? {});
      if (typeof data.events?.dailySummaryTime === 'string') {
        setDailySummaryTime(data.events.dailySummaryTime as unknown as string);
      }
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không tải được cấu hình Telegram');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Bật/tắt một loại thông báo và lưu ngay. */
  const setEvent = async (key: string, value: boolean) => {
    const next = { ...events, [key]: value };
    setEvents(next);
    try {
      await api.settings.saveTelegram({ enabled: isConnected, events: next });
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không lưu được cài đặt');
      await load();
    }
  };

  const eventOn = (key: string) => events[key] !== false;

  /** Lưu Bot Token và Chat ID rồi gửi tin thử để xác nhận. */
  const handleConnect = async () => {
    if (!botTokenInput.trim() && !hasToken) {
      setErrorMessage('Hãy dán Bot Token lấy từ @BotFather.');
      return;
    }
    if (!chatId.trim()) {
      setErrorMessage('Hãy nhập Chat ID. Nhắn /start cho bot rồi lấy Chat ID từ @userinfobot.');
      return;
    }

    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      await api.settings.saveTelegram({
        botToken: botTokenInput.trim() || undefined,
        chatId: chatId.trim(),
        enabled: true,
        events,
      });
      await api.settings.testTelegram();
      setBotTokenInput('');
      setNotice('Đã gửi tin nhắn thử. Kiểm tra Telegram của bạn.');
      await load();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không kết nối được Telegram');
    } finally {
      setBusy(false);
    }
  };

  const handleSendTest = async () => {
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      await api.settings.testTelegram();
      setNotice('Đã gửi tin nhắn thử. Kiểm tra Telegram của bạn.');
      await load();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không gửi được tin thử');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Ngắt kết nối: chỉ tắt gửi thông báo, giữ nguyên Bot Token đã lưu để
   * bật lại không phải lấy token mới từ BotFather.
   */
  const handleDisconnect = async () => {
    if (!confirm('Ngắt kết nối Telegram? Hệ thống sẽ ngừng gửi thông báo.')) return;
    setBusy(true);
    try {
      await api.settings.saveTelegram({ enabled: false, events });
      await load();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không ngắt kết nối được');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    // Gửi lại là gửi một tin kiểm tra mới; tin cũ đã thất bại không lưu
    // nguyên văn nội dung động nên không tái tạo được y hệt.
    await handleSendTest();
  };

  /** Lịch sử gửi, chuyển sang hình dạng bảng đang vẽ. */
  const KIND_LABELS: Record<string, string> = {
    new_order: 'Đơn hàng',
    handoff: 'Cần xử lý',
    daily_summary: 'Tổng kết',
    test: 'Kiểm tra',
    general: 'Thông báo',
  };

  const displayLogs = logs.map((log) => ({
    id: log.id,
    time: new Date(log.created_at).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }),
    type: KIND_LABELS[log.kind] ?? 'Thông báo',
    content: log.content,
    status: log.status === 'sent' ? 'Đã gửi' : 'Gửi lỗi',
    error: log.error,
  }));

  // Trạng thái từng loại thông báo, dùng cho các công tắc trên giao diện
  const warnNear24h = eventOn('near_24h');
  const setWarnNear24h = (v: boolean) => setEvent('near_24h', v);
  const dailySummary = eventOn('daily_summary');
  const setDailySummary = (v: boolean) => setEvent('daily_summary', v);
  const weeklySummary = events.weekly_summary === true;
  const setWeeklySummary = (v: boolean) => setEvent('weekly_summary', v);
  const postPublished = events.post_published === true;
  const setPostPublished = (v: boolean) => setEvent('post_published', v);
  const newComment = events.new_comment === true;
  const setNewComment = (v: boolean) => setEvent('new_comment', v);
  const adsBudgetWarn = eventOn('ads_budget');
  const setAdsBudgetWarn = (v: boolean) => setEvent('ads_budget', v);

  return (
    <main className="flex-1   p-8 bg-background space-y-8  ">
      
      {/* HEADER */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-3xl font-black text-on-surface tracking-tight">Cảnh báo Telegram</h1>
          <span className={clsx(
            "font-mono text-[10px] font-bold tracking-wider px-2 py-0.5 rounded uppercase border",
            isConnected
              ? "text-primary bg-primary/10 border-primary/30"
              : "text-on-surface-variant bg-surface-variant border-outline-variant"
          )}>{isConnected ? 'ĐÃ KẾT NỐI' : 'CHƯA KẾT NỐI'}</span>
        </div>
        <p className="text-on-surface-variant text-sm">Nhận thông báo đơn hàng và cảnh báo ngay trên điện thoại</p>
      </div>

      {errorMessage && (
        <div className="text-sm text-error bg-error/10 border border-error/30 rounded-xl px-4 py-3">{errorMessage}</div>
      )}
      {notice && (
        <div className="text-sm text-green-400 bg-green-400/10 border border-green-400/30 rounded-xl px-4 py-3">{notice}</div>
      )}

      {/* HÀNG 1: THẺ TRẠNG THÁI KẾT NỐI */}
      <div className="space-y-4">
        {isConnected && (
        <div className="bg-surface-container/30 border border-primary/50 shadow-[0_0_20px_rgba(0,229,255,0.1)] rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[80px] -z-10 rounded-full"></div>
          
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-[#2AABEE]/10 rounded-full flex items-center justify-center shrink-0 border border-[#2AABEE]/30">
              <span className="material-symbols-outlined text-[#2AABEE] text-[32px]">send</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-on-surface">Đã kết nối</h2>
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
              </div>
              <p className="text-on-surface-variant font-medium mb-0.5">Chat ID: <span className="text-on-surface font-bold">{chatId || '(chưa có)'}</span></p>
              <p className="text-xs text-on-surface-variant/70">{verifiedAt ? `Đã xác nhận ${new Date(verifiedAt).toLocaleDateString('vi-VN')}` : 'Chưa gửi tin thử để xác nhận'}</p>
            </div>
          </div>

          <div className="flex gap-3 w-full md:w-auto">
            <button className="flex-1 md:flex-none px-5 py-2.5 bg-surface-container border border-outline-variant text-on-surface font-bold rounded-xl hover:bg-surface-variant transition-colors" onClick={handleSendTest} disabled={busy}>
              Gửi tin thử
            </button>
            <button className="flex-1 md:flex-none px-5 py-2.5 bg-surface-container border border-error/50 text-error font-bold rounded-xl hover:bg-error/10 hover:border-error transition-colors" onClick={handleDisconnect} disabled={busy}>
              Ngắt kết nối
            </button>
          </div>
        </div>

        )}

        {!isConnected && (
        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6 flex flex-col gap-5">
          <div className="flex items-center gap-5 flex-1">
            <div className="w-16 h-16 bg-surface-variant rounded-full flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-on-surface-variant text-[32px]">send</span>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-on-surface mb-1">Chưa kết nối</h2>
              <p className="text-on-surface-variant text-sm mb-4">Kết nối Telegram để nhận thông báo đơn hàng ngay lập tức</p>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-x-6 gap-y-2 text-sm font-medium text-on-surface-variant">
                <span className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-surface-variant flex items-center justify-center text-xs font-bold text-on-surface shrink-0">1</span> Nhắn <b className="text-on-surface">/newbot</b> cho <b className="text-on-surface">@BotFather</b> để lấy Bot Token</span>
                <span className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-surface-variant flex items-center justify-center text-xs font-bold text-on-surface shrink-0">2</span> Nhắn <b className="text-on-surface">/start</b> cho bot vừa tạo</span>
                <span className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-surface-variant flex items-center justify-center text-xs font-bold text-on-surface shrink-0">3</span> Lấy Chat ID từ <b className="text-on-surface">@userinfobot</b></span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Bot Token</label>
              <input
                type="password"
                value={botTokenInput}
                onChange={(e) => setBotTokenInput(e.target.value)}
                placeholder={hasToken ? '••••••  (đã lưu, để trống nếu không đổi)' : '123456789:ABCdef...'}
                className="w-full bg-surface-container border border-outline-variant/50 rounded-lg px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Chat ID</label>
              <input
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="Ví dụ: 123456789 hoặc -1001234567890"
                className="w-full bg-surface-container border border-outline-variant/50 rounded-lg px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all font-mono"
              />
            </div>
          </div>

          <button className="w-full md:w-auto md:self-start px-8 py-3 bg-[#2AABEE] text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(42,171,238,0.4)] hover:scale-105 transition-transform flex items-center justify-center gap-2 shrink-0 disabled:opacity-60 disabled:hover:scale-100" onClick={handleConnect} disabled={busy}>
            <span className="material-symbols-outlined text-[20px]">link</span>
            {busy ? 'Đang kết nối…' : 'Kết nối và gửi tin thử'}
          </button>
        </div>
        )}
      </div>

      {/* HÀNG 2: HAI NHÓM THÔNG BÁO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Cột trái */}
        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-on-surface">Thông báo quan trọng</h2>
            <span className="font-mono text-[10px] font-bold tracking-wider text-error bg-error/10 border border-error/20 px-2 py-0.5 rounded uppercase">LUÔN GỬI NGAY LẬP TỨC</span>
          </div>

          <div className="space-y-4 flex-1">
            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-outline-variant/50">
              <div>
                <div className="font-bold text-on-surface mb-1">AI chốt được đơn hàng</div>
                <div className="text-sm text-on-surface-variant">Gửi ngay tên khách, số điện thoại và chi tiết đơn</div>
              </div>
              <div className="w-12 h-6 bg-primary rounded-full relative opacity-50 cursor-not-allowed">
                <div className="w-4 h-4 bg-on-primary rounded-full absolute right-1 top-1 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[12px] text-primary">lock</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-outline-variant/50">
              <div>
                <div className="font-bold text-on-surface mb-1">Khách cần người thật xử lý</div>
                <div className="text-sm text-on-surface-variant">Khách khiếu nại, đòi gặp người, hoặc AI không xử lý được</div>
              </div>
              <div className="w-12 h-6 bg-primary rounded-full relative opacity-50 cursor-not-allowed">
                <div className="w-4 h-4 bg-on-primary rounded-full absolute right-1 top-1 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[12px] text-primary">lock</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-outline-variant/50 hover:border-primary/50 transition-colors">
              <div>
                <div className="font-bold text-on-surface mb-1">Sắp hết 24 giờ nhắn tin</div>
                <div className="text-sm text-on-surface-variant">Báo trước 2 giờ để bạn kịp chốt khách</div>
              </div>
              <button onClick={() => setWarnNear24h(!warnNear24h)} className={clsx("w-12 h-6 rounded-full relative transition-colors duration-200", warnNear24h ? "bg-primary" : "bg-surface-variant")}>
                <div className={clsx("w-4 h-4 rounded-full absolute top-1 transition-transform duration-200", warnNear24h ? "bg-on-primary translate-x-7" : "bg-on-surface-variant translate-x-1")}></div>
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-outline-variant/50">
              <div>
                <div className="font-bold text-on-surface mb-1">Mất kết nối Fanpage</div>
                <div className="text-sm text-on-surface-variant">Token hết hạn, AI ngừng hoạt động</div>
              </div>
              <div className="w-12 h-6 bg-primary rounded-full relative opacity-50 cursor-not-allowed">
                <div className="w-4 h-4 bg-on-primary rounded-full absolute right-1 top-1 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[12px] text-primary">lock</span>
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs text-on-surface-variant/70 mt-6 pt-4 border-t border-outline-variant/50">
            Ba mục bị khóa là những việc bạn buộc phải biết ngay, nếu bỏ lỡ có thể mất khách hoặc mất tiền.
          </p>
        </div>

        {/* Cột phải */}
        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-on-surface">Thông báo thường</h2>
            <span className="font-mono text-[10px] font-bold tracking-wider text-on-surface-variant bg-surface-variant border border-outline-variant px-2 py-0.5 rounded uppercase">CÓ THỂ TẮT NẾU THẤY PHIỀN</span>
          </div>

          <div className="space-y-4 flex-1">
            <div className="flex flex-col p-4 rounded-xl bg-surface-container-low border border-outline-variant/50 hover:border-primary/50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold text-on-surface">Tổng kết cuối ngày</div>
                <button onClick={() => setDailySummary(!dailySummary)} className={clsx("w-12 h-6 rounded-full relative transition-colors duration-200", dailySummary ? "bg-primary" : "bg-surface-variant")}>
                  <div className={clsx("w-4 h-4 rounded-full absolute top-1 transition-transform duration-200", dailySummary ? "bg-on-primary translate-x-7" : "bg-on-surface-variant translate-x-1")}></div>
                </button>
              </div>
              <div className="text-sm text-on-surface-variant mb-3">Số đơn, doanh thu, tỷ lệ chốt trong ngày</div>
              {dailySummary && (
                <div className="flex items-center gap-3 mt-auto">
                  <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">LÚC</span>
                  <input type="time" value={dailySummaryTime} onChange={e => setDailySummaryTime(e.target.value)} className="bg-surface-container border border-outline-variant rounded-lg px-2 py-1 text-sm text-on-surface focus:outline-none focus:border-primary" />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-outline-variant/50 hover:border-primary/50 transition-colors">
              <div>
                <div className="font-bold text-on-surface mb-1">Tổng kết cuối tuần</div>
                <div className="text-sm text-on-surface-variant">So sánh với tuần trước</div>
              </div>
              <button onClick={() => setWeeklySummary(!weeklySummary)} className={clsx("w-12 h-6 rounded-full relative transition-colors duration-200", weeklySummary ? "bg-primary" : "bg-surface-variant")}>
                <div className={clsx("w-4 h-4 rounded-full absolute top-1 transition-transform duration-200", weeklySummary ? "bg-on-primary translate-x-7" : "bg-on-surface-variant translate-x-1")}></div>
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-outline-variant/50 hover:border-primary/50 transition-colors">
              <div>
                <div className="font-bold text-on-surface mb-1">Bài đăng đã lên sóng</div>
                <div className="text-sm text-on-surface-variant">Báo mỗi khi bài theo lịch được đăng</div>
              </div>
              <button onClick={() => setPostPublished(!postPublished)} className={clsx("w-12 h-6 rounded-full relative transition-colors duration-200", postPublished ? "bg-primary" : "bg-surface-variant")}>
                <div className={clsx("w-4 h-4 rounded-full absolute top-1 transition-transform duration-200", postPublished ? "bg-on-primary translate-x-7" : "bg-on-surface-variant translate-x-1")}></div>
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-outline-variant/50 hover:border-primary/50 transition-colors">
              <div>
                <div className="font-bold text-on-surface mb-1">Có khách mới bình luận</div>
                <div className="text-sm text-on-surface-variant">Có thể rất nhiều thông báo nếu bài viral</div>
              </div>
              <button onClick={() => setNewComment(!newComment)} className={clsx("w-12 h-6 rounded-full relative transition-colors duration-200", newComment ? "bg-primary" : "bg-surface-variant")}>
                <div className={clsx("w-4 h-4 rounded-full absolute top-1 transition-transform duration-200", newComment ? "bg-on-primary translate-x-7" : "bg-on-surface-variant translate-x-1")}></div>
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-outline-variant/50 hover:border-primary/50 transition-colors">
              <div>
                <div className="font-bold text-on-surface mb-1">Cảnh báo chi tiêu quảng cáo</div>
                <div className="text-sm text-on-surface-variant">Báo khi chiến dịch sắp hết ngân sách</div>
              </div>
              <button onClick={() => setAdsBudgetWarn(!adsBudgetWarn)} className={clsx("w-12 h-6 rounded-full relative transition-colors duration-200", adsBudgetWarn ? "bg-primary" : "bg-surface-variant")}>
                <div className={clsx("w-4 h-4 rounded-full absolute top-1 transition-transform duration-200", adsBudgetWarn ? "bg-on-primary translate-x-7" : "bg-on-surface-variant translate-x-1")}></div>
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* HÀNG 3: XEM TRƯỚC TIN NHẮN */}
      <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6">
        <h2 className="text-lg font-bold text-on-surface mb-6">Tin nhắn Telegram sẽ trông thế nào</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
          {/* Khung 1 */}
          <div className="bg-[#18222d] border border-outline-variant/30 rounded-2xl rounded-tl-sm p-4 text-[#e4e4e5] font-mono text-sm leading-relaxed shadow-lg relative">
            <div className="absolute -left-2 top-0 w-4 h-4 bg-[#18222d] border-l border-t border-outline-variant/30 rotate-[-45deg] translate-y-1 translate-x-1 -z-10"></div>
            <div>
              <span className="text-xl leading-none mr-2">🎉</span><span className="font-bold text-white text-base">ĐƠN HÀNG MỚI</span><br/><br/>
              Khách: <span className="text-white font-medium">Nguyễn Thị Hoa</span><br/>
              Số điện thoại: <span className="text-[#3390ec] font-medium">0987 123 456</span><br/>
              Sản phẩm: <span className="text-white">Sản phẩm A</span><br/>
              Số lượng: <span className="text-white">2</span><br/>
              Tổng tiền: <span className="text-white font-bold">900.000 đ</span><br/>
              Địa chỉ: <span className="text-white/60 italic">(khách chưa cung cấp)</span><br/><br/>
              <span className="text-xs text-white/50">AI chốt lúc 14:19</span><br/>
              <a href="#" className="text-[#3390ec] hover:underline block mt-2">Xem chi tiết đơn hàng</a>
            </div>
          </div>

          {/* Khung 2 */}
          <div className="bg-[#18222d] border border-outline-variant/30 rounded-2xl rounded-tl-sm p-4 text-[#e4e4e5] font-mono text-sm leading-relaxed shadow-lg relative">
            <div className="absolute -left-2 top-0 w-4 h-4 bg-[#18222d] border-l border-t border-outline-variant/30 rotate-[-45deg] translate-y-1 translate-x-1 -z-10"></div>
            <div>
              <span className="text-xl leading-none mr-2">🔔</span><span className="font-bold text-white text-base">CẦN BẠN XỬ LÝ</span><br/><br/>
              Khách: <span className="text-white font-medium">Trần Thị Mai</span><br/>
              Lý do: <span className="text-white">Khách khiếu nại giao hàng</span><br/>
              Tin nhắn cuối: <span className="text-[#3390ec] bg-[#3390ec]/10 px-1 rounded">'Đơn tôi đặt 3 hôm rồi sao chưa thấy ship?'</span><br/><br/>
              <span className="text-xs text-[#ff595a]">Đã chờ 18 phút</span><br/>
              <a href="#" className="text-[#3390ec] hover:underline block mt-2">Mở đoạn chat</a>
            </div>
          </div>
        </div>
        
        <p className="text-xs text-on-surface-variant/70 text-center">Bấm vào liên kết trong tin nhắn sẽ mở thẳng đúng đơn hàng hoặc đoạn chat đó</p>
      </div>

      {/* HÀNG 4: LỊCH SỬ THÔNG BÁO */}
      <div className="bg-surface-container/30 border border-outline-variant rounded-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-outline-variant/50">
          <h2 className="text-lg font-bold text-on-surface">Thông báo gần đây</h2>
        </div>
        <div className="overflow-x-auto ">
          <table className="w-full min-w-[700px] text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-high/50 border-b border-outline-variant/50 text-xs font-bold font-mono text-on-surface-variant uppercase tracking-wider">
                <th className="p-4 w-40 font-bold">Thời gian</th>
                <th className="p-4 w-32 font-bold">Loại</th>
                <th className="p-4 font-bold">Nội dung</th>
                <th className="p-4 w-32 font-bold">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {displayLogs.map((item) => (
                <tr key={item.id} className="hover:bg-surface-container/50 transition-colors group">
                  <td className="p-4 text-sm text-on-surface-variant font-medium whitespace-nowrap">{item.time}</td>
                  <td className="p-4">
                    <span className={clsx(
                      "inline-flex items-center justify-center px-2.5 py-1 text-[11px] font-bold rounded-full uppercase tracking-wider",
                      item.type === "Đơn hàng" && "bg-green-500/10 text-green-500 border border-green-500/20",
                      item.type === "Cần xử lý" && "bg-orange-500/10 text-orange-500 border border-orange-500/20",
                      item.type === "Tổng kết" && "bg-blue-500/10 text-blue-500 border border-blue-500/20",
                      item.type === "Cảnh báo" && "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20",
                    )}>
                      {item.type}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-on-surface font-medium truncate max-w-[300px]" title={item.content}>
                    {item.content}
                  </td>
                  <td className="p-4">
                    {item.status === "Đã gửi" ? (
                      <span className="text-sm font-bold text-on-surface-variant flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span> Đã gửi
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-error flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px]">error</span> Gửi lỗi
                        </span>
                        <button onClick={handleResend} disabled={busy} className="text-xs font-bold text-primary hover:underline bg-primary/10 px-2 py-0.5 rounded border border-primary/20 disabled:opacity-50" title={item.error ?? undefined}>
                          Gửi lại
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </main>
  );
}
