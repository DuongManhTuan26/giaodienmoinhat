import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { clsx } from 'clsx';
import AITrainingModal from '../components/AITrainingModal';
import AutoPilotPanel from '../components/AutoPilotPanel';
import {
  api, ApiError, POST_STATUS_LABELS,
  type Post, type PostStatus, type MediaItem,
} from '../lib/api';
import { useActivePage } from '../lib/ActivePage';
import { gioiHanChatNhat, kenhMacDinh, tinhKenhSeDang, type CheDoKenh } from '../lib/gioi-han-kenh';
import ChonKenhDang from '../components/ChonKenhDang';
import { MAU_PHONG_CACH } from '../lib/phong-cach-anh';

/** Nhãn tab -> trạng thái trong database. */
const FILTER_TO_STATUS: Record<string, PostStatus> = {
  'Chờ duyệt': 'pending_approval',
  'Đã lên lịch': 'scheduled',
  'Đã đăng': 'published',
  'Bản nháp': 'draft',
};

/**
 * Hai trạng thái KHÔNG thuộc tab nào ở trên: 'publishing' (đang đăng, hoặc đã
 * gửi đi mà chưa rõ kết quả) và 'failed' (đăng lỗi).
 *
 * Trước đây bài rơi vào hai trạng thái này biến mất khỏi màn hình: không tab
 * nào chứa, chủ shop không thấy, không biết bài mình vừa bấm đăng đi đâu.
 * Gom vào một tab riêng chỉ hiện khi thật sự có bài như vậy.
 */
const CAN_XU_LY: PostStatus[] = ['publishing', 'failed'];

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
  /*
   * Chọn kênh NGAY TRONG hộp soạn bài, và chọn trước khi viết.
   *
   * Trước đây kênh đích lấy ngầm theo ô chọn trang ở thanh trên — chủ shop
   * không hề biết bài sẽ bay đi đâu. Bài 40 và 41 vì thế gửi sang TikTok trong
   * khi chủ shop tưởng đang đăng lên Fanpage.
   */
  const [dangTaoAnh, setDangTaoAnh] = useState(false);
  /*
   * Phong cách vẽ ảnh do chủ shop điều khiển, đổi lúc nào cũng được.
   *
   * Bản trước tôi ép sẵn "ảnh chụp đời thường, bối cảnh Việt Nam" trong mã, và
   * ảnh ra phẳng lì không hút mắt. Phong cách là việc của người bán, không
   * phải của người viết mã.
   */
  const [phongCachAnh, setPhongCachAnh] = useState('');
  const [phongCachDaLuu, setPhongCachDaLuu] = useState('');
  const [dangLuuPhongCach, setDangLuuPhongCach] = useState(false);
  /** Ảnh mẫu: AI vẽ lại chính ảnh đó theo phong cách mới, giữ nguyên chủ thể. */
  const [anhMauChon, setAnhMauChon] = useState('');
  const [dangTaiAnhMau, setDangTaiAnhMau] = useState(false);
  const oPhongCachRef = useRef<HTMLTextAreaElement>(null);
  const anhMauInputRef = useRef<HTMLInputElement>(null);
  const [tienAnh, setTienAnh] = useState(0);
  const [cheDoKenh, setCheDoKenh] = useState<CheDoKenh>('tu-chon');
  const [kenhTuChon, setKenhTuChon] = useState<string[]>([]);
  const [composerMode, setComposerMode] = useState<'now' | 'schedule'>('now');
  /*
   * Ngày và giờ hẹn đăng.
   *
   * Hai ô này trước đây KHÔNG nối vào đâu cả — gõ gì cũng không ai đọc, còn mã
   * thì hẹn cứng "sau 24 giờ". Chủ shop chọn 8 giờ sáng mai mà bài lại hẹn vào
   * đúng giờ này ngày mai.
   */
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [aiOptions, setAiOptions] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  /*
   * Giữ cả bài đang sửa, không chỉ mã bài.
   *
   * Bài ĐÃ ĐĂNG sửa khác hẳn bài chưa đăng: nền tảng chỉ cho đổi phần chữ,
   * không cho đổi ảnh. Phải biết trạng thái mới hiện đúng nút và đúng lời nhắc.
   */
  const [baiDangSua, setBaiDangSua] = useState<Post | null>(null);
  const [dangGoBai, setDangGoBai] = useState(false);
  const [composerMedia, setComposerMedia] = useState<MediaItem[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  /*
   * Khoá nút trong lúc đang gửi.
   *
   * Thiếu chốt này đã gây hậu quả thật: đăng bài mất vài giây gọi sang Zernio,
   * màn hình KHÔNG báo gì, chủ shop tưởng nút kẹt nên bấm liên tục — mỗi lần
   * bấm tạo một bài mới. Kết quả: 18 bài trong hai giây, 17 bài lỗi.
   */
  const [dangGuiBai, setDangGuiBai] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  // Nạp phong cách vẽ ảnh đã lưu, để ô trong hộp soạn bài có sẵn nội dung.
  useEffect(() => {
    api.ai
      .imageStyle()
      .then(({ data }) => {
        setPhongCachAnh(data.phongCach);
        setPhongCachDaLuu(data.phongCach);
      })
      .catch(() => {
        /* Không nạp được thì để trống, máy chủ vẫn có phong cách mặc định. */
      });
  }, []);

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
    const truoc = postMode;
    setPostMode(mode);
    try {
      /*
       * Ghi thẳng một khoá, không đọc-rồi-ghi-đè cả bản ghi.
       *
       * Cách cũ tải cấu hình về rồi PUT lại toàn bộ: nếu chủ shop đang lưu lời
       * vai trò ở màn hình Vai trò AI cùng lúc thì bên nào ghi sau sẽ xoá
       * công của bên kia.
       */
      await api.ai.patchSettings('content', { autoPublish: mode === 'auto' });
    } catch (error) {
      // Không lưu được thì trả thẻ về đúng sự thật, đừng để nó sáng giả.
      setPostMode(truoc);
      setErrorMessage(error instanceof ApiError ? error.message : 'Không lưu được chế độ đăng bài');
    }
  };

  /** Kênh sẽ đăng: trang đang chọn, hoặc mọi kênh đăng được nếu đang xem tất cả. */
  const targetAccountIds = activeAccountId
    ? [activeAccountId]
    : accounts.filter((a) => a.connected).map((a) => a.id);

  /* Kênh đăng được: chỉ những kênh đang thật sự kết nối. */
  const kenhKetNoi = accounts.filter((a) => a.connected);

  /** Đang gõ phong cách của riêng mình, không phải một mẫu dựng sẵn. */
  const laPhongCachRieng = !MAU_PHONG_CACH.some((m) => m.mota === phongCachAnh);

  /* Kênh mà bài trong hộp soạn sẽ thật sự lên — do chính hộp soạn quyết định. */
  const kenhSeDang = tinhKenhSeDang(kenhKetNoi, cheDoKenh, kenhTuChon);
  const targetAccountIdsSoanBai = kenhSeDang.map((a) => a.id);
  const daChonKenh = kenhSeDang.length > 0;

  /*
   * Giới hạn lấy theo kênh KHÓ TÍNH NHẤT trong số đang chọn.
   *
   * Hệ thống gửi một lệnh chung cho mọi kênh: một kênh từ chối là cả lệnh
   * hỏng, các kênh còn lại cũng không nhận được gì.
   */
  const gioiHan = gioiHanChatNhat(kenhSeDang.map((a) => a.platform));
  const soKyTu = composerContent.trim().length;
  const vuotGioiHan = gioiHan !== null && soKyTu > gioiHan.soKyTu;

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
      'Nhập thời gian đăng theo định dạng YYYY-MM-DDTHH:mm (theo giờ trên máy bạn):',
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

  /*
   * Gieo lựa chọn kênh khi mở hộp soạn.
   *
   * Đang đứng ở một trang cụ thể thì mặc định đúng trang đó, đang ở "Tất cả
   * trang" thì mặc định mọi kênh. Chủ shop vẫn đổi lại được ngay trong hộp.
   */
  const gieoChonKenh = () => {
    setCheDoKenh('tu-chon');
    // Đang đứng ở một trang cụ thể thì đúng trang đó; ngược lại lấy kênh chính
    // (Fanpage và Instagram) — nơi khách nhắn tin và ra đơn.
    setKenhTuChon(activeAccountId ? [activeAccountId] : kenhMacDinh(kenhKetNoi));
  };

  const moHopSoanBai = () => {
    gieoChonKenh();
    setIsComposerOpen(true);
  };

  const doiChonKenh = (id: string) => {
    setKenhTuChon((truoc) =>
      truoc.includes(id) ? truoc.filter((x) => x !== id) : [...truoc, id]
    );
  };

  const handleEditPost = (post: Post) => {
    setEditingPostId(post.id);
    setBaiDangSua(post);
    gieoChonKenh();
    setComposerContent(post.content);
    setComposerTopic(post.ai_prompt ?? '');
    setComposerMedia(Array.isArray(post.media) ? post.media : []);
    setAiOptions([]);
    setIsComposerOpen(true);
  };

  /** Mở bài đã đăng trên chính nền tảng. */
  const handleOpenOnPlatform = (post: Post) => {
    const url = Object.values(post.platform_urls ?? {}).find(
      (value) => typeof value === 'string' && value.startsWith('http')
    );
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else setErrorMessage('Chưa có đường dẫn bài viết trên nền tảng.');
  };

  /**
   * Tải ảnh/video lên Zernio.
   *
   * Tải từng tệp một chứ không song song: chủ shop chọn nhiều ảnh từ điện thoại
   * là chuyện thường, và mỗi lần tải là một lượt gọi Zernio — bắn cùng lúc sẽ
   * ăn vào hạn mức tốc độ dùng chung với việc trả lời khách.
   */
  const handleFilesChosen = async (files: FileList | File[]) => {
    const chosen = Array.from(files);
    if (chosen.length === 0) return;

    setErrorMessage('');
    setUploadingCount(chosen.length);

    try {
      for (const file of chosen) {
        const item = await api.posts.uploadMedia(file);
        setComposerMedia((current) => [...current, item]);
        setUploadingCount((count) => count - 1);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : 'Không tải được ảnh lên',
      );
    } finally {
      setUploadingCount(0);
    }
  };

  /**
   * Hỏi lại nền tảng về một bài đang treo.
   *
   * KHÔNG phải nút đăng lại. Bài treo là bài "chưa rõ kết quả" — có thể đã lên
   * Fanpage rồi mà mình chưa biết. Bấm đăng lại ở trạng thái đó là cách chắc
   * chắn nhất để có hai bài giống hệt nhau.
   */
  const handleRecheck = (id: number) =>
    runAction(id, async () => {
      const { data } = await api.posts.recheck(id);
      if (!data.found) {
        setErrorMessage(data.message ?? 'Bài chưa lên nền tảng, bạn có thể đăng lại.');
      }
    });

  /**
   * Thời điểm hẹn đăng, lấy từ ĐÚNG hai ô chủ shop chọn.
   *
   * Trả về null nếu chọn "đăng ngay". Ném lỗi nếu chọn hẹn giờ mà thiếu hoặc
   * chọn vào quá khứ — thà báo rõ còn hơn âm thầm hẹn sai giờ.
   */
  const layThoiDiemHen = (): string | null => {
    if (composerMode !== 'schedule') return null;
    if (!scheduleDate || !scheduleTime) {
      throw new ApiError('Vui lòng chọn cả ngày và giờ đăng.', 400);
    }
    const khi = new Date(`${scheduleDate}T${scheduleTime}`);
    if (Number.isNaN(khi.getTime())) {
      throw new ApiError('Ngày giờ không hợp lệ.', 400);
    }
    if (khi.getTime() <= Date.now()) {
      throw new ApiError('Thời gian hẹn đăng phải ở tương lai.', 400);
    }
    return khi.toISOString();
  };

  /**
   * Lưu bài từ ô soạn.
   *
   * Trước đây hai nút "Lưu nháp" và "Đăng bài" cùng chỉ gọi
   * setIsComposerOpen(false) — tức là ĐÓNG HỘP THOẠI và vứt hết. Chủ shop bấm
   * "Đăng bài", hộp đóng lại, Fanpage không có gì, database cũng không có gì.
   *
   * "Đăng bài" chính là sự đồng ý của chủ shop, nên nó đăng thật (hoặc giao
   * lịch cho Zernio), không đưa vào hàng chờ duyệt — hàng chờ duyệt là để cho
   * bài do AI tự viết ở chế độ tự động.
   */
  const luuBaiTuOSoan = async (dang: boolean) => {
    // Chặn lần bấm thứ hai khi lần đầu chưa xong.
    if (dangGuiBai) return;

    const noiDung = composerContent.trim();
    if (!noiDung) {
      setErrorMessage('Chưa có nội dung bài viết. Vui lòng dùng AI để viết, hoặc tự nhập nội dung.');
      return;
    }

    setErrorMessage('');
    setDangGuiBai(true);
    try {
      /*
       * Bài ĐÃ ĐĂNG: cập nhật thẳng phần chữ ra nền tảng.
       *
       * Không đi qua đường tạo bài mới, nếu không Fanpage sẽ có hai bài trùng.
       * Ảnh thì nền tảng không cho đổi — muốn đổi ảnh phải gỡ bài rồi đăng lại.
       */
      if (baiDangSua?.status === 'published' && editingPostId) {
        await api.posts.updateOnPlatform(editingPostId, noiDung);
        setIsComposerOpen(false);
        setEditingPostId(null);
        setBaiDangSua(null);
        setComposerContent('');
        setComposerMedia([]);
        setTienAnh(0);
        setAnhMauChon('');
        await fetchPosts();
        return;
      }

      const scheduledFor = dang ? layThoiDiemHen() : null;

      if (dang && targetAccountIdsSoanBai.length === 0) {
        setErrorMessage('Vui lòng chọn ít nhất một kênh để đăng bài.');
        return;
      }

      // Vượt giới hạn của kênh khó tính nhất thì nền tảng sẽ từ chối CẢ LỆNH,
      // không kênh nào nhận được bài. Chặn ngay ở đây thay vì để hỏng rồi mới báo.
      if (dang && vuotGioiHan && gioiHan) {
        setErrorMessage(
          `Nội dung dài ${soKyTu.toLocaleString('vi-VN')} ký tự, vượt giới hạn ` +
            `${gioiHan.soKyTu.toLocaleString('vi-VN')} ký tự của ${gioiHan.ten}. ${gioiHan.lyDo} ` +
            `Vui lòng rút ngắn nội dung, hoặc bỏ chọn ${gioiHan.ten} ở Bước 1.`
        );
        return;
      }

      const { data: post } = editingPostId
        ? await api.posts.update(editingPostId, {
            content: noiDung,
            targetAccountIds: targetAccountIdsSoanBai,
            media: composerMedia,
            scheduledFor,
            status: dang ? (scheduledFor ? 'scheduled' : 'pending_approval') : 'draft',
          })
        : await api.posts.create({
            content: noiDung,
            status: dang ? (scheduledFor ? 'scheduled' : 'pending_approval') : 'draft',
            scheduledFor,
            targetAccountIds: targetAccountIdsSoanBai,
            media: composerMedia,
            aiGenerated: aiOptions.includes(noiDung),
            aiPrompt: composerTopic.trim() || undefined,
          });

      // Gửi sang Zernio: đăng ngay, hoặc giao lịch cho Zernio tự đăng đúng giờ.
      if (dang) await api.posts.publish(post.id);

      setIsComposerOpen(false);
      setAiOptions([]);
      setComposerTopic('');
      setComposerContent('');
      setComposerMedia([]);
      setScheduleDate('');
      setScheduleTime('');
      setEditingPostId(null);
      setBaiDangSua(null);
      setTienAnh(0);
      setAnhMauChon('');
      await fetchPosts();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : 'Không lưu được bài viết'
      );
    } finally {
      setDangGuiBai(false);
    }
  };

  /*
   * Nhờ AI vẽ ảnh minh hoạ cho bài.
   *
   * Mỗi ảnh tốn tiền thật (khoảng 0,04 USD một lượt) nên chỉ chạy khi chủ shop
   * bấm, không bao giờ tự chạy ngầm. Ảnh vẽ xong nằm chung danh sách với ảnh
   * chủ shop tự tải lên, xoá được như nhau.
   */
  const nhoAiVeAnh = async () => {
    if (dangTaoAnh) return;
    const noiDung = composerContent.trim();
    if (!noiDung && !anhMauChon) {
      setErrorMessage('Cần nội dung bài viết hoặc ảnh mẫu để AI biết vẽ gì.');
      return;
    }
    setErrorMessage('');
    setDangTaoAnh(true);
    try {
      const { data } = await api.ai.generateImage({
        content: noiDung,
        style: phongCachAnh.trim() || undefined,
        sample: anhMauChon || undefined,
      });
      setComposerMedia((truoc) => [...truoc, { url: data.url, type: data.type }]);
      setTienAnh((truoc) => truoc + (data.costUsd ?? 0));
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'AI chưa tạo được ảnh');
    } finally {
      setDangTaoAnh(false);
    }
  };

  /*
   * Gỡ bài khỏi nền tảng để sửa lại rồi đăng mới.
   *
   * Đây là cách DUY NHẤT để thay ảnh của bài đã đăng, vì nền tảng không cho
   * đổi ảnh. Gỡ rồi mất hết lượt thích và bình luận đã có, nên phải hỏi trước.
   */
  const goBaiVeNhap = async (post: Post) => {
    if (dangGoBai) return;
    if (
      !confirm(
        'Gỡ bài này khỏi nền tảng để sửa lại?\n\n' +
          'Bài sẽ biến mất khỏi trang, mất hết lượt thích và bình luận đã có. ' +
          'Nội dung và ảnh vẫn giữ lại trong ứng dụng để bạn sửa rồi đăng mới.'
      )
    ) {
      return;
    }
    setDangGoBai(true);
    setErrorMessage('');
    try {
      const { data } = await api.posts.unpublish(post.id);
      await fetchPosts();
      handleEditPost(data);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không gỡ được bài trên nền tảng');
    } finally {
      setDangGoBai(false);
    }
  };

  /*
   * Tải ảnh mẫu cho AI — RIÊNG hẳn với ảnh đăng kèm bài.
   *
   * Hai việc khác nhau hoàn toàn: ảnh mẫu chỉ để AI nhìn rồi vẽ lại, KHÔNG bao
   * giờ lên nền tảng. Bản trước tôi bắt dùng chung danh sách ảnh của bài, tức
   * là muốn cho AI xem ảnh thì buộc phải đăng luôn ảnh đó.
   */
  const taiAnhMau = async (file: File) => {
    setErrorMessage('');
    setDangTaiAnhMau(true);
    try {
      const item = await api.posts.uploadMedia(file);
      setAnhMauChon(item.url);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không tải được ảnh mẫu lên');
    } finally {
      setDangTaiAnhMau(false);
    }
  };

  const luuPhongCachAnh = async () => {
    if (dangLuuPhongCach) return;
    setDangLuuPhongCach(true);
    setErrorMessage('');
    try {
      await api.ai.saveImageStyle(phongCachAnh.trim());
      setPhongCachDaLuu(phongCachAnh.trim());
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không lưu được phong cách ảnh');
    } finally {
      setDangLuuPhongCach(false);
    }
  };

  const handleGenerate = async () => {
    if (!composerTopic.trim()) {
      setErrorMessage('Vui lòng nhập chủ đề để AI viết bài.');
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
      // Dùng đúng giờ chủ shop chọn. Bản trước hẹn cứng "sau 24 giờ" bất kể
      // họ chọn gì, nên bài luôn lên sai thời điểm.
      const scheduledFor = layThoiDiemHen();

      let post: Post;
      if (editingPostId) {
        const result = await api.posts.update(editingPostId, {
          content: optionContent,
          targetAccountIds,
          media: composerMedia,
        });
        post = result.data;
      } else {
        const result = await api.posts.create({
          content: optionContent,
          status: composerMode === 'schedule' ? 'scheduled' : 'pending_approval',
          scheduledFor,
          targetAccountIds,
          media: composerMedia,
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
      setComposerMedia([]);
      setEditingPostId(null);
      setBaiDangSua(null);
      setTienAnh(0);
      setAnhMauChon('');
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
    canXuLy: dbPosts.filter((p) => CAN_XU_LY.includes(p.status)).length,
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
    'Bản nháp',
    // Chỉ hiện khi có bài đang treo hoặc lỗi, để không thêm tab thừa lúc mọi
    // thứ bình thường.
    ...(activeCounts.canXuLy > 0 ? [`Cần xử lý (${activeCounts.canXuLy})`] : []),
  ];

  const filteredPosts = useMemo(() => {
    if (activeFilter.startsWith('Cần xử lý')) {
      return dbPosts.filter((post) => CAN_XU_LY.includes(post.status));
    }
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

  /*
   * Bấm đồng ý trong hộp xác nhận thì phải LƯU, không chỉ đổi màu thẻ.
   *
   * Bản cũ chỉ gọi setPostMode('auto'): thẻ sáng lên "ĐANG ĐƯỢC CHỌN" nhưng
   * không có gì xuống máy chủ, nên tải lại trang là mất, và phía máy chủ vẫn
   * đinh ninh chủ shop đang ở chế độ chờ duyệt. Nhánh "Chờ tôi duyệt" thì lại
   * lưu đúng — chỉ mỗi nhánh này bị bỏ quên.
   */
  const confirmAutoMode = () => {
    setShowAutoConfirm(false);
    void savePostMode('auto');
  };


  return (
    <main className="flex-1  p-6 md:p-8 max-w-7xl mx-auto w-full relative    bg-background">

      {/* Lỗi của các thao tác ngoài hộp soạn bài: đăng lại, xoá, duyệt, tải danh sách. */}
      {errorMessage && !isComposerOpen && (
        <div className="mb-6 flex items-start gap-2 text-sm text-error bg-error/10 border border-error/30 rounded-xl px-4 py-3">
          <span className="material-symbols-outlined text-[18px] mt-0.5 shrink-0">error</span>
          <span className="leading-relaxed flex-1">{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage('')}
            className="text-error/70 hover:text-error shrink-0"
            aria-label="Đóng thông báo lỗi"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

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
            <span className="material-symbols-outlined text-[18px]">badge</span>
            Vai trò AI
          </button>
          <button 
            onClick={moHopSoanBai}
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

      {/* Lịch AI tự viết và tự đăng — phần làm cho thẻ "AI tự đăng luôn" ở trên
          nói đúng sự thật. Thẻ đó chỉ quyết định có bỏ bước duyệt hay không khi
          chủ shop TỰ soạn bài; còn việc AI tự làm theo lịch thì cài ở đây. */}
      <AutoPilotPanel onSaved={fetchPosts} />

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
                  <button onClick={() => handleEditPost(post)} className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50">Sửa</button>
                </>
              )}
              {post.status === 'published' && (
                <div className="flex flex-col gap-2 w-full">
                  <div className="flex gap-2">
                    <button onClick={() => handleOpenOnPlatform(post)} className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50">Xem trên nền tảng</button>
                    <button onClick={() => handleOpenOnPlatform(post)} className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50">Xem bình luận</button>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEditPost(post)} className="flex-1 py-2 bg-primary/10 text-primary font-bold text-xs rounded-lg hover:bg-primary/20 transition-colors border border-primary/30">Sửa chữ</button>
                    <button
                      onClick={() => goBaiVeNhap(post)}
                      disabled={dangGoBai}
                      title="Nền tảng không cho đổi ảnh của bài đã đăng. Gỡ bài rồi đăng lại là cách duy nhất."
                      className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50 disabled:opacity-60"
                    >
                      {dangGoBai ? 'Đang gỡ…' : 'Gỡ để sửa ảnh'}
                    </button>
                  </div>
                </div>
              )}

              {/* Bản nháp trước đây không có một nút nào — mở ra rồi bỏ đó. */}
              {post.status === 'draft' && (
                <>
                  <button onClick={() => handleApprove(post.id)} disabled={busyPostId === post.id} className="flex-1 py-2 bg-primary text-on-primary font-bold text-xs rounded-lg hover:brightness-110 transition-all disabled:opacity-60">{busyPostId === post.id ? 'Đang đăng…' : 'Đăng ngay'}</button>
                  <button onClick={() => handleEditPost(post)} className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50">Sửa</button>
                  <button onClick={() => handleDelete(post.id)} className="w-9 shrink-0 flex items-center justify-center bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors border border-error/20">
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </>
              )}
              {/*
                Bài đang treo: CHỈ cho kiểm tra lại, tuyệt đối không có nút đăng
                lại — bài có thể đã lên Fanpage rồi mà mình chưa biết.
              */}
              {post.status === 'publishing' && (
                <button onClick={() => handleRecheck(post.id)} disabled={busyPostId === post.id} className="flex-1 py-2 bg-primary text-on-primary font-bold text-xs rounded-lg hover:brightness-110 transition-all disabled:opacity-60">
                  {busyPostId === post.id ? 'Đang kiểm tra…' : 'Kiểm tra kết quả thật'}
                </button>
              )}
              {post.status === 'failed' && (
                <>
                  <button onClick={() => handleRecheck(post.id)} disabled={busyPostId === post.id} className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50">Kiểm tra lại</button>
                  <button onClick={() => handleApprove(post.id)} disabled={busyPostId === post.id} className="flex-1 py-2 bg-primary text-on-primary font-bold text-xs rounded-lg hover:brightness-110 transition-all disabled:opacity-60">Đăng lại</button>
                  <button onClick={() => handleEditPost(post)} className="flex-1 py-2 bg-surface-variant text-on-surface font-bold text-xs rounded-lg hover:bg-outline-variant transition-colors border border-outline-variant/50">Sửa</button>
                  <button onClick={() => handleDelete(post.id)} className="w-9 shrink-0 flex items-center justify-center bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors border border-error/20">
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
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
              <h2 className="font-headline-sm text-xl font-bold text-on-surface">
                {baiDangSua?.status === 'published' ? 'Sửa bài đã đăng' : 'Soạn bài đăng'}
              </h2>
              <button 
                onClick={() => setIsComposerOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-variant text-on-surface hover:bg-outline-variant transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
              
              {/*
                Bài đã đăng thì không chọn lại kênh được nữa, và nền tảng chỉ
                cho sửa phần chữ. Nói rõ ngay từ đầu thay vì để chủ shop sửa ảnh
                xong mới phát hiện không lưu được.
              */}
              {baiDangSua?.status === 'published' ? (
                <div className="bg-surface-container rounded-xl p-4 border border-primary/40">
                  <p className="text-sm font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-primary">edit_note</span>
                    Đang sửa bài đã lên sóng
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
                    Nền tảng chỉ cho sửa phần chữ của bài đã đăng, không cho đổi ảnh và không cho
                    đổi kênh. Muốn thay ảnh, quay ra bấm <b className="text-on-surface">Gỡ để sửa ảnh</b>,
                    bài sẽ về bản nháp để bạn sửa rồi đăng lại.
                  </p>
                </div>
              ) : (
              <>
              {/*
                BƯỚC 1 — CHỌN KÊNH ĐĂNG.

                Dùng chung đúng một component với lịch AI tự đăng, để hai nơi
                hành xử y hệt nhau thay vì mỗi nơi một kiểu.
              */}
              <ChonKenhDang
                nhan="BƯỚC 1 · CHỌN KÊNH ĐĂNG"
                kenhKetNoi={kenhKetNoi}
                cheDo={cheDoKenh}
                onDoiCheDo={setCheDoKenh}
                kenhTuChon={kenhTuChon}
                onDoiKenh={doiChonKenh}
                kenhSeDang={kenhSeDang}
                gioiHan={gioiHan}
              />

              {/* Phần viết bài chỉ mở ra sau khi đã chọn kênh. */}
              {!daChonKenh && (
                <p className="text-sm text-on-surface-variant flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">lock</span>
                  Chọn kênh ở Bước 1 để bắt đầu viết bài.
                </p>
              )}

              </>
              )}

              {/* Bài đã đăng vẫn phải sửa được chữ; bài mới thì phải chọn kênh trước. */}
              {(baiDangSua?.status === 'published' || daChonKenh) && (
              <>
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
                  <span
                    className={`absolute bottom-3 right-4 text-xs font-mono ${
                      vuotGioiHan ? 'text-error font-bold' : 'text-on-surface-variant'
                    }`}
                  >
                    {soKyTu.toLocaleString('vi-VN')}
                    {gioiHan ? ` / ${gioiHan.soKyTu.toLocaleString('vi-VN')}` : ''} ký tự
                  </span>
                </div>
                {vuotGioiHan && gioiHan && (
                  <p className="text-xs text-error mt-2 leading-relaxed">
                    Nội dung vượt {(soKyTu - gioiHan.soKyTu).toLocaleString('vi-VN')} ký tự so với
                    {' '}giới hạn {gioiHan.soKyTu.toLocaleString('vi-VN')} ký tự của {gioiHan.ten}.
                    {' '}Vui lòng rút ngắn nội dung, hoặc bỏ chọn {gioiHan.ten} ở Bước 1.
                  </p>
                )}
              </div>

              {baiDangSua?.status !== 'published' && (
              <>
              {/*
                Hai việc khác nhau, để thành hai khối riêng.

                Bản trước tôi nhét ô tải ảnh đăng bài xuống tận dưới, nằm ngay
                cạnh ô tải ảnh mẫu cho AI — hai ô tải ảnh sát nhau, ai nhìn cũng
                loạn.
              */}
              {/* Block 3A: ảnh và video sẽ ĐĂNG LÊN cùng bài */}
              <div>
                <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-3">ẢNH VÀ VIDEO ĐĂNG KÈM BÀI</h3>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleFilesChosen(e.target.files);
                    // Xoá giá trị để chọn lại đúng tệp đó lần nữa vẫn kích hoạt.
                    e.target.value = '';
                  }}
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files.length > 0) handleFilesChosen(e.dataTransfer.files);
                  }}
                  className="border-2 border-dashed border-outline-variant rounded-xl p-8 flex flex-col items-center justify-center bg-surface-container/30 hover:bg-surface-container/50 hover:border-primary/50 transition-colors cursor-pointer group"
                >
                  <div className="w-12 h-12 rounded-full bg-surface-variant flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-on-surface-variant">
                      {uploadingCount > 0 ? 'progress_activity' : 'upload_file'}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-on-surface-variant">
                    {uploadingCount > 0
                      ? `Đang tải lên… còn ${uploadingCount} tệp`
                      : 'Kéo thả ảnh vào đây hoặc bấm để chọn'}
                  </span>
                </div>

                {composerMedia.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {composerMedia.map((item, index) => (
                      <div key={item.url} className="relative group aspect-square rounded-xl overflow-hidden border border-outline-variant bg-surface-container">
                        {item.type === 'image' || item.type === 'gif' ? (
                          <img src={item.url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                            <span className="material-symbols-outlined text-on-surface-variant">
                              {item.type === 'video' ? 'movie' : 'description'}
                            </span>
                            <span className="text-[10px] font-mono text-on-surface-variant uppercase">{item.type}</span>
                          </div>
                        )}
                        <button
                          onClick={() => setComposerMedia((current) => current.filter((_, i) => i !== index))}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-surface-container-high/90 border border-outline-variant flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:border-error hover:text-error"
                          title="Bỏ tệp này"
                        >
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Block 3B: AI vẽ ảnh — không có gì ở đây tự lên nền tảng */}
              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase">AI VẼ ẢNH MINH HOẠ</h3>
                  <button
                    type="button"
                    onClick={nhoAiVeAnh}
                    disabled={
                      dangTaoAnh || (!composerContent.trim() && !anhMauChon)
                    }
                    title={
                      !composerContent.trim() && !anhMauChon
                        ? 'Cần nội dung bài viết hoặc ảnh mẫu'
                        : undefined
                    }
                    className="shrink-0 px-3 py-1.5 rounded-lg border border-primary/50 bg-primary/10 text-primary text-xs font-bold flex items-center gap-1.5 hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className={clsx('material-symbols-outlined text-[16px]', dangTaoAnh && 'animate-spin')}>
                      {dangTaoAnh ? 'progress_activity' : 'auto_awesome'}
                    </span>
                    {dangTaoAnh ? 'Đang vẽ ảnh…' : 'Nhờ AI vẽ ảnh'}
                  </button>
                </div>
                <p className="text-xs text-on-surface-variant mb-3 leading-relaxed">
                  Ảnh AI vẽ xong sẽ tự vào mục đăng kèm bài ở trên. Ảnh không có chữ, không có
                  tên thương hiệu và không có huy hiệu chứng nhận, để tránh quảng cáo sai sự thật.
                  {tienAnh > 0 && ` Đã dùng ${tienAnh.toFixed(3)} USD cho ảnh trong bài này.`}
                </p>
                <div className="bg-surface-container rounded-xl p-4 border border-outline-variant mb-3 space-y-3">
                  <label className="block text-xs font-bold text-on-surface">
                    Phong cách ảnh — bạn tự viết, AI vẽ đúng theo
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {MAU_PHONG_CACH.map((m) => (
                      <button
                        key={m.ten}
                        type="button"
                        onClick={() => setPhongCachAnh(m.mota)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                          phongCachAnh === m.mota
                            ? 'border-primary bg-primary/15 text-primary'
                            : 'border-outline-variant bg-surface text-on-surface-variant hover:border-primary/50'
                        }`}
                      >
                        {m.ten}
                      </button>
                    ))}
                    {/*
                      Bấm vào đây là xoá trắng ô bên dưới để chủ shop tự gõ, thay
                      vì phải xoá tay đoạn mẫu đang có sẵn.
                    */}
                    <button
                      type="button"
                      onClick={() => {
                        setPhongCachAnh('');
                        oPhongCachRef.current?.focus();
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        laPhongCachRieng
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-outline-variant bg-surface text-on-surface-variant hover:border-primary/50'
                      }`}
                    >
                      Phong cách tuỳ chỉnh
                    </button>
                  </div>
                  <textarea
                    ref={oPhongCachRef}
                    rows={3}
                    value={phongCachAnh}
                    onChange={(e) => setPhongCachAnh(e.target.value)}
                    placeholder="Ví dụ: ảnh quảng cáo sang trọng, nền tối, ánh sáng viền, màu vàng đồng…"
                    className="w-full bg-surface rounded-lg border border-outline-variant p-3 text-sm text-on-surface leading-relaxed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all resize-none"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-on-surface-variant leading-relaxed flex-1">
                      Phong cách này dùng cho mọi ảnh. Đổi lúc nào cũng được.
                    </p>
                    <button
                      type="button"
                      onClick={luuPhongCachAnh}
                      disabled={dangLuuPhongCach || phongCachAnh.trim() === phongCachDaLuu.trim()}
                      className="shrink-0 px-3 py-1.5 rounded-lg border border-outline text-on-surface text-xs font-bold hover:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {dangLuuPhongCach
                        ? 'Đang lưu…'
                        : phongCachAnh.trim() === phongCachDaLuu.trim()
                          ? 'Đã là mặc định'
                          : 'Lưu làm mặc định'}
                    </button>
                  </div>
                </div>

                <div className="bg-surface-container rounded-xl p-4 border border-outline-variant mb-3 space-y-2">
                  <label className="block text-xs font-bold text-on-surface">
                    Ảnh mẫu cho AI — không đăng lên bài
                  </label>
                  <input
                    ref={anhMauInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) taiAnhMau(f);
                      e.target.value = '';
                    }}
                  />
                  {anhMauChon ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={anhMauChon}
                        alt=""
                        className="w-16 h-16 rounded-lg object-cover border-2 border-primary shrink-0"
                      />
                      <button
                        type="button"
                        onClick={() => anhMauInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface text-xs font-bold hover:border-primary transition-colors"
                      >
                        Đổi ảnh khác
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnhMauChon('')}
                        className="px-3 py-1.5 rounded-lg border border-error/30 bg-error/10 text-error text-xs font-bold hover:bg-error/20 transition-colors"
                      >
                        Bỏ ảnh mẫu
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => anhMauInputRef.current?.click()}
                      disabled={dangTaiAnhMau}
                      className="w-full py-3 rounded-lg border border-dashed border-outline-variant text-on-surface-variant text-xs font-bold hover:border-primary/50 hover:text-on-surface transition-colors disabled:opacity-60"
                    >
                      {dangTaiAnhMau ? 'Đang tải ảnh mẫu…' : 'Tải ảnh mẫu lên'}
                    </button>
                  )}
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Ảnh này chỉ để AI nhìn rồi vẽ lại theo phong cách trên, giữ nguyên sản phẩm.
                    Nó không được đăng lên nền tảng.
                  </p>
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
                      <input
                        type="date"
                        value={scheduleDate}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                      />
                      <input
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>

              </>
              )}
              </>
              )}

            </div>

            {/* Footer */}
            {/*
              Báo lỗi phải nằm SÁT hai cái nút.

              Trước đây setErrorMessage được gọi ở 19 chỗ trong trang này mà
              không có một chỗ nào hiển thị ra. Chủ shop bấm "Đăng bài", nền
              tảng từ chối, bài ghi 'failed' trong database — còn màn hình thì
              không đổi gì cả, trông y như nút không ăn. Đã xảy ra thật với bài
              40 và 41: TikTok từ chối vì nội dung 648 ký tự quá mức 90.
            */}
            {errorMessage && (
              <div className="px-6 pt-4 shrink-0">
                <div className="flex items-start gap-2 text-sm text-error bg-error/10 border border-error/30 rounded-xl px-4 py-3">
                  <span className="material-symbols-outlined text-[18px] mt-0.5 shrink-0">error</span>
                  <span className="leading-relaxed">{errorMessage}</span>
                </div>
              </div>
            )}

            <div className="p-6 border-t border-outline-variant bg-surface-container/50 flex gap-3 shrink-0">
              {/*
                Bài đã đăng thì không có khái niệm lưu nháp.

                Đừng dùng thuộc tính hidden: lớp flex-1 đặt display:flex và ghi
                đè luôn hidden, nút vẫn hiện ra như thường.
              */}
              {baiDangSua?.status !== 'published' && (
              <button
                onClick={() => luuBaiTuOSoan(false)}
                disabled={dangGuiBai}
                className="flex-1 py-3 rounded-xl border border-outline-variant text-on-surface font-bold text-sm hover:bg-surface-variant transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Lưu nháp
              </button>
              )}
              <button 
                onClick={() => luuBaiTuOSoan(true)}
                // Khoá khi chưa chọn kênh hoặc nội dung vượt giới hạn của kênh
                // khó tính nhất — gửi đi cũng chỉ hỏng cả lệnh.
                disabled={
                  dangGuiBai ||
                  (baiDangSua?.status !== 'published' && (!daChonKenh || vuotGioiHan))
                }
                title={
                  !daChonKenh
                    ? 'Chọn kênh ở Bước 1 trước khi đăng'
                    : vuotGioiHan && gioiHan
                      ? `Nội dung vượt giới hạn ${gioiHan.soKyTu.toLocaleString('vi-VN')} ký tự của ${gioiHan.ten}`
                      : undefined
                }
                className="flex-[2] py-3 rounded-xl bg-primary text-on-primary font-bold text-sm shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <span className={clsx("material-symbols-outlined text-[20px]", dangGuiBai && "animate-spin")}>
                  {dangGuiBai ? 'progress_activity' : 'send'}
                </span>
                {dangGuiBai
                  ? 'Đang gửi lên Fanpage…'
                  : baiDangSua?.status === 'published'
                    ? 'Cập nhật bài đã đăng'
                    : composerMode === 'schedule' ? 'Hẹn giờ đăng' : 'Đăng bài'}
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

      <AITrainingModal kind="content" isOpen={isTrainingOpen} onClose={() => setIsTrainingOpen(false)} aiName="AI Viết - Đăng Bài" />
    </main>
  );
}
