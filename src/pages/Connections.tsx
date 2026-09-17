import React, { useState, useRef, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { api, ApiError, type Platform, type SocialAccount } from '../lib/api';
import { useActivePage } from '../lib/ActivePage';

// Mỗi lượt kết nối chọn một trang. Chưa phải hạn mức theo gói.
const MOI_LUOT_MOT_TRANG = 1;

export default function Connections() {
  const { reload: reloadActivePages } = useActivePage();

  const [connectStep, setConnectStep] = useState(0); // 0 = đóng, 1-4 = các bước
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  /*
   * Nhịp hỏi máy chủ trong lúc chờ cấp quyền. Giữ trong ref chứ không trong
   * state: phải dừng được cả khi người dùng rời trang giữa chừng, nếu không nó
   * chạy ngầm mãi và tiếp tục đốt hạn mức gọi Zernio.
   */
  const oauthTimer = useRef<number | null>(null);
  const accountsBeforeOAuth = useRef(0);
  /**
   * Trang lấy từ Facebook, CHƯA kết nối — khách chọn cái nào thì mới tạo kênh.
   * Khác hẳn `accounts` vốn là các kênh đã kết nối rồi.
   */
  const [pagesToSelect, setPagesToSelect] = useState<
    Array<{ id: string; name: string; username: string | null; category: string | null }>
  >([]);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);

  const [catalog, setCatalog] = useState<{ social: Platform[]; ads: Platform[]; communication: Platform[] }>({
    social: [], ads: [], communication: [],
  });
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  /** Tài khoản vừa nối xong của đúng nền tảng đang chọn. */
  const justConnected = selectedPlatform
    ? accounts.find((a) => a.platform === selectedPlatform.platformKey && a.connected)
    : undefined;
  const justConnectedName =
    justConnected?.display_name || justConnected?.username || 'tài khoản của bạn';
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  /** Lần tải gần nhất có thất bại không. Dùng để không khoe "mọi thứ tốt" khi chưa có dữ liệu. */
  const [taiThatBai, setTaiThatBai] = useState(false);
  const [syncing, setSyncing] = useState(false);
  /** Báo việc vừa làm xong. Đổi Trang là việc có hậu quả nên phải nói ra. */
  const [tinBao, setTinBao] = useState('');

  const load = useCallback(async () => {
    try {
      const [platforms, accountList] = await Promise.all([
        api.connections.platforms(),
        api.connections.accounts(),
      ]);
      setCatalog(platforms.data);
      setAccounts(accountList.data);
      setTaiThatBai(false);
      setErrorMessage('');
    } catch (error) {
      setTaiThatBai(true);
      setErrorMessage(error instanceof ApiError ? error.message : 'Không tải được danh sách kênh');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Kéo lại danh sách tài khoản từ Zernio rồi làm mới màn hình. */
  const handleSync = async () => {
    setSyncing(true);
    setErrorMessage('');
    try {
      await api.connections.sync();
      await load();
      await reloadActivePages();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Đồng bộ thất bại');
    } finally {
      setSyncing(false);
    }
  };

  /*
   * Đổi Trang cho kênh Facebook.
   *
   * Nút cũ ở đây ghi "Thêm trang từ tài khoản này" và chạy lại toàn bộ luồng
   * cấp quyền. Nhưng nhà cung cấp KHÔNG thêm — họ ghi đè lên kết nối đang có.
   * Đã xảy ra thật: bấm nút đó để thêm Trang thứ hai thì Trang đầu bị đá ra,
   * kênh giữ nguyên mã cũ, chỉ đổi tên và đổi Trang đang gắn, và hộp thư của
   * Trang cũ tắt ngay lập tức (đo được: 2 hội thoại -> 0).
   *
   * Muốn chạy hai Trang bán hàng thì phải hai tài khoản riêng. Các bên hàng
   * đầu cũng hướng dẫn tách bài theo Trang, và Meta thì phạt nội dung trùng.
   */
  const [doiTrangMo, setDoiTrangMo] = useState(false);
  const [kenhDangDoi, setKenhDangDoi] = useState<{ id: string; ten: string } | null>(null);
  const [dsTrang, setDsTrang] = useState<Array<{ id: string; name: string; fan_count?: number }>>([]);
  const [trangDangGan, setTrangDangGan] = useState<string | null>(null);
  const [dangTaiTrang, setDangTaiTrang] = useState(false);
  const [dangDoi, setDangDoi] = useState(false);

  const moDoiTrang = async (accountId: string, tenKenh: string) => {
    setKenhDangDoi({ id: accountId, ten: tenKenh });
    setDoiTrangMo(true);
    setDangTaiTrang(true);
    setErrorMessage('');
    try {
      const { data } = await api.connections.accountPages(accountId);
      setDsTrang(data.pages);
      setTrangDangGan(data.selectedPageId);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không đọc được danh sách Trang');
      setDoiTrangMo(false);
    } finally {
      setDangTaiTrang(false);
    }
  };

  const doiSangTrang = async (pageId: string, tenTrang: string) => {
    if (!kenhDangDoi) return;
    const tenCu = dsTrang.find((t) => t.id === trangDangGan)?.name ?? 'Trang hiện tại';
    if (!window.confirm(
      `Chuyển sang "${tenTrang}"?\n\n` +
      `"${tenCu}" sẽ NGỪNG nhận tin nhắn và bình luận ngay lập tức. ` +
      `Một tài khoản chỉ bán hàng được trên một Trang.\n\n` +
      `Muốn chạy cả hai Trang cùng lúc thì tạo thêm một tài khoản riêng cho Trang kia.`
    )) return;

    setDangDoi(true);
    setErrorMessage('');
    try {
      const kq = await api.connections.switchPage(kenhDangDoi.id, pageId);
      setTinBao(kq.message ?? 'Đã đổi Trang.');
      setDoiTrangMo(false);
      await load();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không đổi được Trang');
    } finally {
      setDangDoi(false);
    }
  };

  const handleDisconnectAccount = async (platformId: string) => {
    const target = accounts.filter((a) => a.platform === platformId);
    if (target.length === 0) return;
    if (!window.confirm(`Ngắt kết nối ${target.length} tài khoản của kênh này?`)) return;
    try {
      for (const account of target) await api.connections.disconnect(account.id);
      await load();
      await reloadActivePages();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không ngắt kết nối được');
    }
  };

  const handleDisconnectPage = async (accountId: string) => {
    if (!window.confirm('Ngắt kết nối trang này?')) return;
    try {
      await api.connections.disconnect(accountId);
      await load();
      await reloadActivePages();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không ngắt kết nối được');
    }
  };

  const allPlatforms = [...catalog.social, ...catalog.ads, ...catalog.communication];
  const connectedPlatformCount = allPlatforms.filter((c) => c.connected).length;
  const connectablePlatformCount = allPlatforms.filter((c) => c.connectable).length;
  const activePageCount = accounts.filter((a) => a.connected && a.platform !== 'metaads').length;

  /**
   * Trạng thái sức khoẻ chung, suy ra từ dữ liệu thật thay vì ô chọn thủ công.
   * danger: có kênh mất kết nối. warning: có token sắp hết hạn trong 7 ngày.
   */
  const bannerState: 'normal' | 'warning' | 'danger' = (() => {
    if (accounts.some((a) => a.needs_reconnection || !a.connected)) return 'danger';
    const soon = Date.now() + 7 * 86400000;
    if (accounts.some((a) => a.token_expires_at && new Date(a.token_expires_at).getTime() < soon)) {
      return 'warning';
    }
    return 'normal';
  })();

  /** Gom tài khoản theo kênh để dựng khối "Tài khoản đã kết nối". */
  const accountsByPlatform: Record<string, SocialAccount[]> = {};
  for (const account of accounts) {
    (accountsByPlatform[account.platform] ??= []).push(account);
  }

  const liveConnectedAccounts = Object.entries(accountsByPlatform).map(([platform, list]) => {
    const channel = allPlatforms.find((c) => c.platformKey === platform)
      ?? allPlatforms.find((c) => c.id === 'fb_ads' && platform === 'metaads');
    return {
      id: platform + '_acc',
      platformId: platform,
      platformName: channel?.name ?? platform,
      platformIcon: channel?.icon ?? 'public',
      accountName: list[0].display_name || list[0].username,
      connectionDate: new Date(list[0].last_synced_at ?? Date.now()).toLocaleDateString('vi-VN'),
      expiryDate: list[0].token_expires_at
        ? new Date(list[0].token_expires_at).toLocaleDateString('vi-VN')
        : 'Không giới hạn',
      status: list.some((a) => a.needs_reconnection)
        ? 'Mất kết nối'
        : list.every((a) => a.connected) ? 'Đang hoạt động' : 'Mất kết nối',
      permissions: [
        { name: 'Đăng bài', granted: channel?.canPost ?? false },
        { name: 'Đọc và trả lời tin nhắn', granted: channel?.canDm ?? false },
        { name: 'Đọc và trả lời bình luận', granted: channel?.canComment ?? false },
      ],
      pages: list.map((a) => ({
        id: a.id,
        name: a.display_name || a.username,
        avatar: a.profile_picture
          ?? 'https://ui-avatars.com/api/?name=' + encodeURIComponent(a.display_name || a.username) + '&background=random',
        status: a.needs_reconnection ? 'Mất kết nối' : a.connected ? 'Đang hoạt động' : 'Mất kết nối',
        messagesProcessed: 0,
        commentsReplied: 0,
      })),
    };
  });

  const liveSocialChannels = catalog.social;
  const liveAdChannels = catalog.ads;
  const liveCommChannels = catalog.communication;

  /**
   * Danh sách cho bước chọn Trang.
   *
   * Sau khi cấp quyền, đây là các Trang Facebook trả về mà khách CHƯA kết nối —
   * chọn xong mới tạo kênh. Facebook chỉ trả id/tên/hạng mục ở bước này, chưa
   * có ảnh đại diện hay số người theo dõi, nên hai ô đó để trống thay vì bịa số.
   *
   * Khi không có phiên chọn nào đang chờ thì quay về hiển thị các kênh đã nối,
   * để màn hình vẫn dùng được cho việc xem lại.
   */
  const newlyConnectedPages = pagesToSelect.length > 0
    ? pagesToSelect.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: 'https://ui-avatars.com/api/?name=' + encodeURIComponent(p.name) + '&background=random',
        // Facebook chưa trả số người theo dõi ở bước này, nên hiện hạng mục
        // Trang — thông tin thật và đủ để khách nhận ra đúng Trang của mình.
        subtitle: p.category ?? 'Trang Facebook',
        connected: accounts.some((a) => a.connected && a.display_name === p.name),
      }))
    : (selectedPlatform?.platformKey
        ? accounts.filter((a) => a.platform === selectedPlatform.platformKey)
        : []
      ).map((a) => ({
        id: a.id,
        name: a.display_name || a.username,
        avatar: a.profile_picture
          ?? 'https://ui-avatars.com/api/?name=' + encodeURIComponent(a.display_name || a.username) + '&background=random',
        subtitle: a.followers_count != null
          ? `${a.followers_count.toLocaleString('vi-VN')} người theo dõi`
          : 'Trang Facebook',
        connected: a.connected,
      }));

  /**
   * Mã truy cập chỉ dùng cho luồng nhập mã. Sau khi xác minh, mọi kênh Zernio
   * hỗ trợ đều kết nối qua OAuth nên bước này không còn được dùng tới.
   */
  const accessCode = 'ZRN-' + (selectedPlatform?.id ?? '').toUpperCase().padEnd(6, 'X').slice(0, 6);

  const topGridRef = useRef<HTMLDivElement>(null);

  const handleOpenConnect = (platform?: Platform) => {
    setErrorMessage('');
    if (platform) {
      setSelectedPlatform(platform);
      setConnectStep(2);
    } else {
      setSelectedPlatform(null);
      setConnectStep(1);
    }
    setLoginSuccess(false);
    setSelectedPages([]);
  };

  /**
   * Mở luồng cấp quyền THẬT của nền tảng.
   *
   * Chuyển thẳng trang, KHÔNG mở cửa sổ con.
   *
   * Bản trước dùng window.open. Chủ shop báo "không thấy cửa sổ nào hiện ra":
   * trình duyệt chặn im lặng và vẫn trả về một đối tượng, nên mã tưởng đã mở
   * rồi ngồi chờ một cửa sổ không tồn tại — màn hình quay vô tận.
   *
   * Chuyển thẳng trang thì không có gì để chặn. Cấp quyền xong Zernio đưa
   * trình duyệt về /connections?connect=select, và màn hình này tự mở lại đúng
   * bước chọn Trang nhờ dữ liệu đã cất ở máy chủ.
   */
  const handleStartOAuth = async () => {
    if (!selectedPlatform) return;
    if (!selectedPlatform.connectable) {
      setErrorMessage(selectedPlatform.capabilityNote ?? 'Kênh này chưa kết nối được.');
      return;
    }

    setIsLoggingIn(true);
    setErrorMessage('');

    try {
      const { url } = await api.connections.connectUrl(selectedPlatform.platformKey!);
      window.location.href = url;
    } catch (error) {
      setIsLoggingIn(false);
      setErrorMessage(error instanceof ApiError ? error.message : 'Không lấy được liên kết cấp quyền');
    }
  };

  /**
   * Một lần kiểm tra: đã cấp quyền xong chưa?
   *
   * Hỏi bảng tạm của chính mình, không gọi Zernio — nên dò dày cũng không đụng
   * vào hạn mức 60 lượt/phút dùng chung với bot trả lời khách. Chỉ khi thật sự
   * có phiên đang chờ thì máy chủ mới hỏi Facebook một lần để lấy danh sách.
   */
  const checkForPendingSelection = async (): Promise<boolean> => {
    const { data } = await api.connections.pendingSelection();
    if (data.waiting || data.pages.length === 0) return false;

    // Dựng lại nền tảng đang kết nối. Thiếu bước này thì khối bước 3 không có
    // gì để vẽ và hộp thoại hiện ra trắng trơn.
    const channel = [...catalog.social, ...catalog.ads, ...catalog.communication]
      .find((c) => c.platformKey === data.platform);
    if (channel) setSelectedPlatform(channel);

    setPagesToSelect(data.pages);
    setSelectedPages([]);
    setLoginSuccess(true);
    setConnectStep(3);
    return true;
  };

  /** Khách tự bấm khi đã cấp quyền xong, không phải ngồi chờ hết nhịp. */
  const handleCheckNow = async () => {
    setErrorMessage('');
    try {
      const found = await checkForPendingSelection();
      if (found) {
        setIsLoggingIn(false);
      } else {
        setErrorMessage(
          'Chưa nhận được kết quả cấp quyền. Vui lòng kiểm tra lại xem bạn đã cấp quyền cho ' +
            'Trang trong cửa sổ Facebook, rồi bấm kiểm tra lại.'
        );
      }
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không kiểm tra được');
    }
  };

  /**
   * Chốt các Trang khách đã chọn — bước thật sự tạo kênh trên Zernio.
   */
  const handleConfirmPages = async () => {
    if (selectedPages.length === 0) return;
    setIsLoggingIn(true);
    setErrorMessage('');
    try {
      const { data } = await api.connections.selectPages(selectedPages);
      // Kéo kênh vừa tạo về database của mình rồi mới sang bước cuối.
      const result = await api.connections.sync();
      setAccounts(result.data);
      await load();
      await reloadActivePages();
      setPagesToSelect([]);

      if (data.failed.length > 0) {
        setErrorMessage(
          `Có ${data.failed.length} Trang không kết nối được: ${data.failed[0].error}`
        );
      }
      setConnectStep(4);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không kết nối được Trang đã chọn');
    } finally {
      setIsLoggingIn(false);
    }
  };

  /*
   * Ghi nhận việc vừa quay về từ Facebook.
   *
   * Chỉ ĐỌC tín hiệu rồi cất vào state, chưa xử lý gì. Lý do: lúc này danh mục
   * kênh chưa tải xong, mà bước chọn Trang cần biết đang kết nối nền tảng nào
   * mới vẽ được. Bản trước xử lý luôn tại đây nên dựng lại nền tảng thất bại và
   * hộp thoại hiện ra RỖNG — đúng thứ chủ shop gặp.
   */
  const [vuaQuayVe, setVuaQuayVe] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ket_qua = params.get('connect');
    if (!ket_qua) return;

    window.history.replaceState({}, '', '/connections');

    if (ket_qua === 'error') {
      setErrorMessage(params.get('message') ?? 'Cấp quyền chưa hoàn tất. Vui lòng thử lại.');
      return;
    }
    setVuaQuayVe(ket_qua);
  }, []);

  /*
   * Xử lý thật, chỉ chạy khi danh mục kênh đã có.
   */
  useEffect(() => {
    if (vuaQuayVe !== 'select') return;
    const daTaiDanhMuc = catalog.social.length > 0;
    if (!daTaiDanhMuc) return;

    setVuaQuayVe(null);

    (async () => {
      try {
        const { data } = await api.connections.pendingSelection();

        // Không cần chọn gì thêm: kênh đã được tạo, chỉ việc kéo về.
        if (data.waiting || data.pages.length === 0) {
          const result = await api.connections.sync();
          setAccounts(result.data);
          await load();
          await reloadActivePages();
          return;
        }

        const channel = [...catalog.social, ...catalog.ads, ...catalog.communication]
          .find((c) => c.platformKey === data.platform);

        if (!channel) {
          setErrorMessage(
            `Đã cấp quyền xong nhưng hệ thống chưa nhận ra nền tảng "${data.platform}".`
          );
          return;
        }

        setSelectedPlatform(channel);
        setPagesToSelect(data.pages);
        setSelectedPages([]);
        setLoginSuccess(true);
        setConnectStep(3);
      } catch (error) {
        setErrorMessage(
          error instanceof ApiError ? error.message : 'Không lấy được danh sách Trang'
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vuaQuayVe, catalog]);

  const handleFinishConnection = async () => {
    await load();
    await reloadActivePages();
    setConnectStep(0);
    setLoginSuccess(false);
    setSelectedPages([]);
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

  /**
   * Băng thông báo lỗi.
   *
   * Trước đây màn hình này có 20 chỗ đặt thông báo lỗi và KHÔNG chỗ nào hiển
   * thị. Mọi thất bại đều bị nuốt im lặng: khách bấm, không có gì xảy ra, cũng
   * không biết vì sao. Đó là lý do lỗi kết nối trông giống như treo máy.
   */
  const errorBanner = errorMessage ? (
    <div className="flex items-start gap-3 text-sm text-error bg-error/10 border border-error/30 rounded-xl px-4 py-3">
      <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
      <span className="flex-1 leading-relaxed">{errorMessage}</span>
      {taiThatBai && (
        <button
          onClick={() => { setLoading(true); load(); }}
          className="shrink-0 px-3 py-1 rounded-lg border border-error/40 font-bold hover:bg-error/10 transition-colors"
        >
          Thử lại
        </button>
      )}
      <button
        onClick={() => setErrorMessage('')}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        title="Đóng"
      >
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>
  ) : null;

  return (
    <main className="flex-1   p-8 bg-background relative  ">

      {errorBanner && <div className="mb-6">{errorBanner}</div>}

      {tinBao && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-surface-container border border-primary/30">
          <span className="material-symbols-outlined text-primary shrink-0">info</span>
          <span className="flex-1 leading-relaxed text-sm text-on-surface">{tinBao}</span>
          <button onClick={() => setTinBao('')} className="text-on-surface-variant hover:text-on-surface shrink-0" aria-label="Đóng">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/*
        * Hộp đổi Trang.
        *
        * Cố tình nói rõ hậu quả ngay trên màn hình, không giấu xuống hộp xác
        * nhận: đổi Trang là tắt hộp thư của Trang cũ.
        */}
      {doiTrangMo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70">
          <div className="bg-surface-container-high border border-outline-variant rounded-2xl w-full max-w-[560px] max-h-[85vh] overflow-y-auto p-6">
            <h3 className="text-lg font-bold text-on-surface mb-1">Đổi Trang bán hàng</h3>
            <p className="text-sm text-on-surface-variant mb-4">
              Tài khoản <span className="text-on-surface font-bold">{kenhDangDoi?.ten}</span> chỉ bán hàng được trên
              {' '}<span className="text-on-surface font-bold">một Trang</span> tại một thời điểm.
            </p>

            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-orange-400/10 border border-orange-400/30 mb-5">
              <span className="material-symbols-outlined text-orange-400 text-[20px] shrink-0">warning</span>
              <p className="text-sm text-on-surface leading-relaxed">
                Đổi sang Trang khác thì Trang đang chọn <span className="font-bold">ngừng nhận tin nhắn và bình luận ngay</span>.
                Muốn chạy cả hai Trang cùng lúc, hãy tạo thêm một tài khoản riêng cho Trang kia.
              </p>
            </div>

            {dangTaiTrang ? (
              <p className="text-sm text-on-surface-variant py-8 text-center">Đang đọc danh sách Trang…</p>
            ) : (
              <div className="flex flex-col gap-2 mb-6">
                {dsTrang.map((t) => {
                  const dangGan = t.id === trangDangGan;
                  return (
                    <div
                      key={t.id}
                      className={`flex items-center gap-3 p-4 rounded-xl border ${dangGan ? 'bg-primary/5 border-primary' : 'bg-surface-container border-outline-variant'}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-on-surface truncate">{t.name}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          {dangGan ? 'Đang bán trên Trang này' : `${t.fan_count ?? 0} người theo dõi`}
                        </p>
                      </div>
                      {dangGan ? (
                        <span className="text-xs font-bold text-primary shrink-0 px-3 py-1.5">ĐANG DÙNG</span>
                      ) : (
                        <button
                          onClick={() => doiSangTrang(t.id, t.name)}
                          disabled={dangDoi}
                          className="shrink-0 px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-bold rounded-lg text-sm transition-colors disabled:opacity-50"
                        >
                          {dangDoi ? 'Đang đổi…' : 'Chuyển sang đây'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setDoiTrangMo(false)}
                className="px-5 py-2.5 bg-surface-container border border-outline-variant text-on-surface font-bold rounded-xl hover:bg-surface-variant transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-headline-sm text-3xl font-bold text-on-surface tracking-tight">Kết nối</h1>
            <span className="font-mono text-xs font-bold tracking-wider text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full uppercase">
              {connectedPlatformCount}/{connectablePlatformCount} KÊNH ĐÃ KẾT NỐI
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

      <div ref={topGridRef} />

      {/* Row 1: Status Banners */}
      <div className="mb-8">
        {bannerState === 'normal' && !taiThatBai && (
          <div className="bg-surface-container/30 border border-primary/30 shadow-[0_0_20px_rgba(0,229,255,0.05)] rounded-2xl p-5 flex items-center gap-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[80px] -z-10 rounded-full"></div>
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center shrink-0 border border-primary/20">
              <span className="material-symbols-outlined text-primary text-[24px]">shield</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-on-surface mb-0.5">Tất cả kết nối đang hoạt động tốt</h3>
              <p className="text-sm text-on-surface-variant font-medium">AI đang chạy trên {activePageCount} trang</p>
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
            <button onClick={handleSync} disabled={syncing} className="shrink-0 px-5 py-2.5 bg-yellow-500 text-[#18181B] font-bold rounded-xl shadow-[0_4px_15px_rgba(234,179,8,0.3)] hover:scale-105 transition-transform whitespace-nowrap disabled:opacity-60 disabled:hover:scale-100">
              {syncing ? 'Đang kiểm tra…' : 'Kiểm tra lại kết nối'}
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
            <button className="shrink-0 px-5 py-2.5 bg-error text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(239,68,68,0.3)] hover:scale-105 transition-transform whitespace-nowrap" onClick={handleSync} disabled={syncing}>
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
              {liveSocialChannels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => {
                    if (channel.connected) {
                      topGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } else {
                      handleOpenConnect(channel);
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
              {liveAdChannels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => {
                    if (channel.connected) {
                      topGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } else {
                      handleOpenConnect(channel);
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
              {liveCommChannels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => {
                    if (channel.connected) {
                      topGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } else {
                      handleOpenConnect(channel);
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
        
        {liveConnectedAccounts.map(account => (
          <div key={account.id} className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6 flex flex-col hover:border-primary/30 transition-colors group relative overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between mb-6 pb-6 border-b border-outline-variant/50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-surface-variant rounded-full flex items-center justify-center shrink-0 border border-outline-variant/50 group-hover:scale-105 transition-transform">
                  <span className="material-symbols-outlined text-on-surface-variant text-[24px]">{account.platformIcon}</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-on-surface mb-0.5">{account.platformName} — {account.accountName}</h3>
                  {/*
                    * Nói đúng thứ đang xảy ra.
                    *
                    * "Đang quản lý N trang" đếm số KÊNH, mà kênh Facebook thì
                    * chỉ phục vụ được MỘT Trang tại một thời điểm. Câu cũ làm
                    * ai cũng tưởng gom thêm Trang được.
                    */}
                  <p className="text-sm text-on-surface-variant font-medium">
                    {account.platformId === 'facebook'
                      ? <>Đang bán trên <span className="text-on-surface font-bold">{account.accountName}</span> · Kết nối ngày {account.connectionDate}</>
                      : <>Đang quản lý {account.pages.length} kênh · Kết nối ngày {account.connectionDate}</>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={clsx("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border", getStatusColor(account.status))}>
                  <span className={clsx("w-1.5 h-1.5 rounded-full", getStatusDot(account.status))}></span>
                  {account.status}
                </span>
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
                </div>
              ))}
            </div>

            {/* Footer Buttons */}
            <div className="mt-auto flex gap-3">
              {account.platformId === 'facebook' ? (
                <button
                  onClick={() => moDoiTrang(account.pages[0]?.id ?? '', account.accountName)}
                  disabled={!account.pages[0]}
                  className="flex-1 py-2.5 px-4 bg-surface-container border border-outline-variant text-on-surface font-bold rounded-xl hover:bg-surface-variant transition-colors disabled:opacity-50">
                  Đổi sang Trang khác
                </button>
              ) : (
                <button
                  onClick={() => handleOpenConnect(allPlatforms.find((c) => c.platformKey === account.platformId) ?? null!)}
                  className="flex-1 py-2.5 px-4 bg-surface-container border border-outline-variant text-on-surface font-bold rounded-xl hover:bg-surface-variant transition-colors">
                  Nối lại tài khoản này
                </button>
              )}
              <button onClick={() => handleDisconnectAccount(account.platformId)} className="flex-1 py-2.5 px-4 bg-surface-container border border-error/50 text-error font-bold rounded-xl hover:bg-error/10 hover:border-error transition-colors">
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
            
            {errorBanner && <div className="px-6 pt-6">{errorBanner}</div>}

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
              {/*
                Lưới an toàn: từ bước 2 trở đi mọi nhánh đều cần selectedPlatform.
                Thiếu nó thì trước đây hộp thoại hiện ra TRẮNG TRƠN, không chữ
                không nút — chủ shop không biết đang xảy ra chuyện gì. Thà nói
                thẳng là chưa dựng lại được và cho đường quay lại.
              */}
              {connectStep > 1 && !selectedPlatform && (
                <div className="text-center py-8">
                  <span className="material-symbols-outlined text-[40px] text-on-surface-variant opacity-40">help</span>
                  <h2 className="text-xl font-bold text-on-surface mt-4 mb-2">Chưa dựng lại được bước đang dở</h2>
                  <p className="text-sm text-on-surface-variant mb-6 max-w-[380px] mx-auto leading-relaxed">
                    Phiên cấp quyền vẫn còn hiệu lực. Vui lòng bấm nút bên dưới để mở lại
                    danh sách Trang cần chọn.
                  </p>
                  <button
                    onClick={handleCheckNow}
                    className="py-3 px-8 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform"
                  >
                    Mở lại danh sách Trang
                  </button>
                </div>
              )}

              {connectStep === 1 && (
                <>
                  <h2 className="text-2xl font-bold text-on-surface mb-6">Bạn muốn kết nối nền tảng nào?</h2>
                  <div className="space-y-10">
                    <div>
                      <h3 className="font-mono text-sm font-bold tracking-wider text-on-surface-variant uppercase mb-4">MẠNG XÃ HỘI</h3>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                        {liveSocialChannels.map((channel) => (
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
                        {liveAdChannels.map((channel) => (
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
                        {liveCommChannels.map((channel) => (
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
    <span className="text-3xl font-mono font-bold text-on-surface tracking-widest">{accessCode}</span>
    <button
      onClick={() => { navigator.clipboard.writeText(accessCode); setErrorMessage(''); }}
      title="Sao chép mã"
      className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-variant text-on-surface hover:bg-surface-variant/80 transition-colors"
    >
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
                        { icon: 'api', name: `Truy cập API ${selectedPlatform.name}`, desc: 'Cho phép hệ thống kết nối và trao đổi dữ liệu với tài khoản của bạn.' },
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
                    {/*
                      Lúc đang chờ, nút này KHÔNG bị khoá. Bản trước khoá nút và
                      quay mãi: cấp quyền xong rồi mà màn hình vẫn quay, bấm gì
                      cũng không được, không có đường thoát nào ngoài tải lại
                      trang. Nay bấm vào là kiểm tra ngay lập tức.
                    */}
                    {!loginSuccess ? (
                      <button 
                        onClick={isLoggingIn ? handleCheckNow : handleStartOAuth}
                        className="w-full py-3.5 px-4 bg-primary text-on-primary font-bold text-lg rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                      >
                        {isLoggingIn ? (
                          <>
                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            Đang chuyển sang Facebook…
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
                        Đã đăng nhập: {justConnectedName}
                      </div>
                    )}
                  </div>
                </>
              )}

              {connectStep === 3 && selectedPlatform && selectedPlatform.connectionType === 'oauth_with_selection' && (
                <>
                  <h2 className="text-2xl font-bold text-on-surface mb-2">Chọn {selectedPlatform.selectionLabel} muốn kết nối</h2>
                  <p className="text-on-surface-variant font-medium leading-relaxed mb-6">
                    Đã tìm thấy {newlyConnectedPages.length} {selectedPlatform.selectionLabel?.toLowerCase()} từ tài khoản vừa cấp quyền. Mỗi {selectedPlatform.selectionLabel?.toLowerCase()} kết nối tính là một lượt trong gói của bạn.
                  </p>

                  <div className="space-y-3 mb-6">
                    {newlyConnectedPages.map(page => (
                      <label key={page.id} className={clsx("flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer", page.connected ? "bg-surface-variant/50 border-outline-variant/30 opacity-70" : selectedPages.includes(page.id) ? "bg-primary/5 border-primary shadow-[0_0_10px_rgba(0,229,255,0.1)]" : "bg-surface-container border-outline-variant hover:border-outline")}>
                        <div className="flex-1 flex items-center gap-4">
                          <img src={page.avatar} alt={page.name} className="w-12 h-12 rounded-full object-cover border border-outline-variant/50" />
                          <div>
                            <div className="text-base font-bold text-on-surface mb-0.5">{page.name}</div>
                            <div className="text-sm text-on-surface-variant">{page.subtitle}</div>
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
                                if (selectedPages.length < MOI_LUOT_MOT_TRANG) {
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
                    {/*
                      * Nói đúng thứ đang thật sự xảy ra.
                      *
                      * Trước đây chỗ này ghi "Gói của bạn còn 1 lượt kết nối" /
                      * "Gói của bạn đã hết lượt" — cả hai đều gắn cứng số 1 và
                      * chẳng liên quan gì tới gói dịch vụ. Máy chủ hiện KHÔNG
                      * chặn theo gói; con số 1 ở đây chỉ là mỗi lượt kết nối
                      * chọn một trang. Hứa theo gói trong khi không có gì chặn
                      * là nói sai với người trả tiền.
                      *
                      * Khi nào hạn mức theo gói được thực thi ở máy chủ thì
                      * thay MOI_LUOT_MOT_TRANG bằng số còn lại thật của gói.
                      */}
                    {selectedPages.length >= MOI_LUOT_MOT_TRANG ? (
                      <div className="text-sm font-medium text-on-surface-variant flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px]">info</span>
                        Muốn thêm trang nữa thì kết nối thêm một lượt
                      </div>
                    ) : (
                      <div className="text-sm font-medium text-on-surface-variant">
                        Mỗi lượt kết nối chọn <span className="text-on-surface font-bold">{MOI_LUOT_MOT_TRANG}</span> trang
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
                      disabled={selectedPages.length === 0 || isLoggingIn}
                      onClick={handleConfirmPages}
                      className="py-3 px-8 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none"
                    >
                      {isLoggingIn ? 'Đang kết nối Trang…' : 'Tiếp tục'}
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
                        <div className="text-lg font-bold text-on-surface">{selectedPlatform.name} — {justConnectedName}</div>
                      </div>
                    </div>
                    
                    {selectedPlatform.connectionType === 'oauth_with_selection' && (
                      <div>
                        <div className="text-sm text-on-surface-variant mb-4">Các {selectedPlatform.selectionLabel?.toLowerCase()} sẽ được kết nối:</div>
                        <div className="space-y-3">
                          {newlyConnectedPages.filter(p => selectedPages.includes(p.id)).map(page => (
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
                      onClick={handleFinishConnection}
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