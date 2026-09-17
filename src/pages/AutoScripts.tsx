import React, { useState, useEffect, useCallback, useRef } from 'react';
import { clsx } from 'clsx';
import { api, ApiError, type AiDocument, type SalesStage, type TuChuConfig } from '../lib/api';
import { useActivePage } from '../lib/ActivePage';
import {
  toFileArray, doiCoTep, napTepChu, napTepAnh, NHAN_VAN_BAN, NHAN_ANH,
} from '../lib/aiDocuments';
import {
  AI_TONES, REQUIRED_INFO, HANDOFF_RULE_LABELS, SUGGESTED_TEST_PROMPTS,
} from '../lib/aiTraining';

interface ScriptRow {
  id: number;
  name: string;
  keywords: string[];
  exclude_keywords: string[];
  match_type: string;
  ignore_typo: boolean;
  message: string;
  public_reply_enabled: boolean;
  public_reply_text: string | null;
  delay_seconds: number;
  public_reply_delay_seconds: number;
  message_variations: string[];
  public_reply_variations: string[];
  apply_to: string;
  is_active: boolean;
  /** FALSE = kịch bản chỉ trả lời công khai, không mở Messenger. */
  send_dm: boolean;
  stats: Record<string, unknown>;
  account_name: string | null;
  platform: string | null;
}

/**
 * Ô nhập các phiên bản khác của một câu.
 *
 * Tối đa 5, đúng giới hạn Zernio. Dùng chung cho tin nhắn riêng và câu trả lời
 * công khai nên hai chỗ hành xử giống hệt nhau.
 */
function VariationEditor({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold text-on-surface-variant w-8 shrink-0">
            #{index + 2}
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => {
              const next = [...values];
              next[index] = e.target.value;
              onChange(next);
            }}
            placeholder={placeholder}
            className="flex-1 bg-surface-container-high border border-outline-variant rounded-lg p-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
          />
          <button
            onClick={() => onChange(values.filter((_, i) => i !== index))}
            className="w-8 h-8 rounded-lg border border-outline-variant text-on-surface-variant hover:border-error hover:text-error transition-colors flex items-center justify-center shrink-0"
            title="Bỏ câu này"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      ))}

      {values.length < 5 && (
        <button
          onClick={() => onChange([...values, ''])}
          className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Thêm một cách nói khác ({values.length + 1}/5)
        </button>
      )}
    </div>
  );
}

export default function AutoScripts() {
  const { accounts, activeAccountId } = useActivePage();

  /*
   * Hai phần tách hẳn nhau, không phải một hộp thoại có nút chọn.
   *
   *  'cmt' — Trả lời bình luận: một câu công khai dưới bình luận. Không dùng AI,
   *          không có hội thoại, không có gì để huấn luyện.
   *  'dm'  — Tin nhắn Messenger: mở cuộc trò chuyện riêng. TOÀN BỘ phần AI nằm
   *          ở đây — sáu bước bán hàng, vai trò, tài liệu, quy tắc nhường người.
   *          Không thứ nào trong số đó liên quan tới trả lời bình luận.
   */
  const [tab, setTab] = useState<'cmt' | 'dm'>('cmt');
  const [scripts, setScripts] = useState<ScriptRow[]>([]);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // Biểu mẫu kịch bản
  const [scriptName, setScriptName] = useState('');
  const [keywords, setKeywords] = useState<string[]>(['giá', 'bao nhiêu', 'inbox']);
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newExcludeKeyword, setNewExcludeKeyword] = useState('');
  const [matchType, setMatchType] = useState('word');
  const [ignoreTypo, setIgnoreTypo] = useState(true);
  const [message, setMessage] = useState('Xin chào! Đây là trợ lý tự động của shop. Em thấy mình quan tâm sản phẩm, em tư vấn ngay cho mình nhé!');
  const [publicReplyEnabled, setPublicReplyEnabled] = useState(true);
  const [publicReplyText, setPublicReplyText] = useState('Em đã nhắn tin riêng cho mình rồi nhé!');
  const [delay, setDelay] = useState(30);
  const [publicReplyDelay, setPublicReplyDelay] = useState(0);
  /*
   * Các phiên bản khác của lời nhắn.
   *
   * Zernio cho tối đa 5, và nói rõ lý do: gửi y hệt một câu cho hàng trăm người
   * là mẫu Meta phát hiện được. Mỗi lần gửi hệ thống rút ngẫu nhiên một câu.
   */
  const [messageVariations, setMessageVariations] = useState<string[]>([]);
  const [publicReplyVariations, setPublicReplyVariations] = useState<string[]>([]);
  const [stats, setStats] = useState<{
    activeScripts: number;
    postsCovered: number;
    firstDmSent: number;
    customersReplied: number;
    replyRate: number | null;
    ordersClosed: number;
    ordersDelta: number;
  } | null>(null);
  const [applyTo, setApplyTo] = useState('all');
  /*
   * Loại kịch bản.
   *
   * 'cmt'  — chỉ trả lời công khai dưới bình luận. Một câu nói ra rồi thôi.
   * 'dm'   — nhắn riêng vào Messenger, mở ra cả một cuộc bán hàng do AI dẫn
   *          theo các bước cấu hình ở tab Huấn luyện.
   * Trước đây chỉ có một loại, luôn làm cả hai việc cùng lúc.
   */
  const [loaiKichBan, setLoaiKichBan] = useState<'cmt' | 'dm'>('dm');

  // Tab huấn luyện AI bán hàng
  const [systemPrompt, setSystemPrompt] = useState('');
  const [tone, setTone] = useState('friendly');
  const [documents, setDocuments] = useState<AiDocument[]>([]);
  const [aiModel, setAiModel] = useState('');
  const [rules, setRules] = useState<Record<string, { enabled: boolean; config: Record<string, unknown> }>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  /** Nạp tài liệu ngay tại khối "Tài liệu AI được dùng", không qua hộp thoại. */
  const tepChuRef = useRef<HTMLInputElement>(null);
  const tepAnhRef = useRef<HTMLInputElement>(null);
  const [dangNap, setDangNap] = useState(false);
  const [baoNap, setBaoNap] = useState('');
  /** Các bước bán hàng qua Messenger — phần "kịch bản" thật sự của hội thoại. */
  const [buoc, setBuoc] = useState<SalesStage[]>([]);
  const [luuBuoc, setLuuBuoc] = useState(false);
  const [baoBuoc, setBaoBuoc] = useState('');
  /** Chế độ tự chủ: AI tự chốt, tự lên đơn, không chờ người. */
  const [tuChu, setTuChu] = useState<TuChuConfig | null>(null);
  const [luuTuChu, setLuuTuChu] = useState(false);
  const [baoTuChu, setBaoTuChu] = useState('');

  // Khung thử AI
  const [testInput, setTestInput] = useState('');
  const [testReply, setTestReply] = useState<{ reply: string; model: string; cost: number } | null>(null);
  const [testing, setTesting] = useState(false);

  const loadScripts = useCallback(async () => {
    try {
      const [list, summary] = await Promise.all([
        api.settings.autoScripts(),
        api.settings.autoScriptStats(),
      ]);
      setScripts(list.data);
      setStats(summary.data);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không tải được kịch bản');
    }
  }, []);

  const loadTraining = useCallback(async () => {
    try {
      const [config, handoff, stages, autonomy] = await Promise.all([
        api.ai.config('sales'),
        api.ai.handoffRules(),
        api.ai.salesStages(),
        api.ai.salesAutonomy(),
      ]);
      setBuoc(stages.data.stages);
      setTuChu(autonomy.data.config);
      setSystemPrompt(config.data.config.system_prompt);
      setTone(config.data.config.tone || 'friendly');
      setDocuments(config.data.documents);
      setAiModel(config.data.model);
      setRules(
        Object.fromEntries(
          handoff.data.map((r) => [r.rule_key, { enabled: r.enabled, config: r.config }])
        )
      );
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không tải được cấu hình AI');
    }
  }, []);

  useEffect(() => { loadScripts(); loadTraining(); }, [loadScripts, loadTraining]);

  const scriptsCmt = scripts.filter((x) => x.send_dm === false);
  const scriptsDm = scripts.filter((x) => x.send_dm !== false);
  const dsHienThi = tab === 'cmt' ? scriptsCmt : scriptsDm;
  const activeScriptCount = dsHienThi.filter((x) => x.is_active).length;

  const resetForm = () => {
    setEditingId(null);
    setScriptName('');
    setKeywords(['giá', 'bao nhiêu', 'inbox']);
    setExcludeKeywords([]);
    setMatchType('word');
    setIgnoreTypo(true);
    setMessage('Xin chào! Đây là trợ lý tự động của shop. Em thấy mình quan tâm sản phẩm, em tư vấn ngay cho mình nhé!');
    setPublicReplyEnabled(true);
    setPublicReplyText('Em đã nhắn tin riêng cho mình rồi nhé!');
    setDelay(30);
    setPublicReplyDelay(0);
    setMessageVariations([]);
    setPublicReplyVariations([]);
    setApplyTo('all');
    setLoaiKichBan('dm');
  };

  /*
   * Loại kịch bản do TAB quyết định, không phải một nút chọn trong hộp thoại.
   * Đang ở phần Trả lời bình luận thì tạo ra kịch bản trả lời bình luận, không
   * có cách nào lẫn sang Messenger.
   */
  const openComposer = () => {
    resetForm();
    setLoaiKichBan(tab === 'cmt' ? 'cmt' : 'dm');
    setErrorMessage('');
    setIsComposerOpen(true);
  };

  const openEditor = (script: ScriptRow) => {
    setEditingId(script.id);
    setScriptName(script.name);
    setKeywords(script.keywords ?? []);
    setExcludeKeywords(script.exclude_keywords ?? []);
    setMatchType(script.match_type);
    setIgnoreTypo(script.ignore_typo);
    setMessage(script.message);
    setPublicReplyEnabled(script.public_reply_enabled);
    setPublicReplyText(script.public_reply_text ?? '');
    // Kịch bản cũ không có cột này thì coi như loại nhắn riêng, đúng hành vi cũ.
    setLoaiKichBan(script.send_dm === false ? 'cmt' : 'dm');
    setDelay(script.delay_seconds);
    setPublicReplyDelay(script.public_reply_delay_seconds ?? 0);
    setMessageVariations(script.message_variations ?? []);
    setPublicReplyVariations(script.public_reply_variations ?? []);
    setApplyTo(script.apply_to);
    setErrorMessage('');
    setIsComposerOpen(true);
  };

  const handleSaveScript = async () => {
    if (!scriptName.trim()) { setErrorMessage('Vui lòng đặt tên cho kịch bản.'); return; }
    if (matchType !== 'all' && keywords.length === 0) {
      setErrorMessage('Phải có ít nhất một từ khoá kích hoạt, hoặc chọn "Bắt mọi bình luận".'); return;
    }
    if (loaiKichBan === 'dm' && !message.trim()) {
      setErrorMessage('Vui lòng nhập nội dung tin nhắn sẽ gửi cho khách.'); return;
    }
    if (loaiKichBan === 'cmt' && !publicReplyText.trim()) {
      setErrorMessage('Vui lòng nhập câu trả lời công khai dưới bình luận.'); return;
    }

    setBusy(true);
    setErrorMessage('');
    try {
      const payload = {
        name: scriptName.trim(),
        keywords,
        excludeKeywords,
        matchType,
        ignoreTypo,
        sendDm: loaiKichBan === 'dm',
        message: message.trim(),
        // Kịch bản chỉ trả lời bình luận thì bắt buộc bật trả lời công khai —
        // nếu không nó bắt được bình luận rồi chẳng làm gì cả.
        publicReplyEnabled: loaiKichBan === 'cmt' ? true : publicReplyEnabled,
        publicReplyText: publicReplyText.trim(),
        delaySeconds: delay,
        publicReplyDelaySeconds: publicReplyDelay,
        messageVariations,
        publicReplyVariations,
        applyTo,
        socialAccountId: activeAccountId ?? undefined,
      };
      if (editingId) await api.settings.updateAutoScript(editingId, payload);
      else await api.settings.createAutoScript(payload);
      setIsComposerOpen(false);
      resetForm();
      await loadScripts();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không lưu được kịch bản');
    } finally {
      setBusy(false);
    }
  };

  const toggleScriptStatus = async (id: number) => {
    const script = scripts.find((s) => s.id === id);
    if (!script) return;
    // Cập nhật ngay trên giao diện để bấm không bị trễ, sai thì nạp lại từ server.
    setScripts((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: !s.is_active } : s)));
    try {
      await api.settings.updateAutoScript(id, { isActive: !script.is_active });
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không đổi được trạng thái');
      await loadScripts();
    }
  };

  const handleDeleteScript = async (id: number) => {
    if (!confirm('Xoá kịch bản này?')) return;
    try {
      await api.settings.removeAutoScript(id);
      await loadScripts();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không xoá được kịch bản');
    }
  };

  const handleAddKeyword = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newKeyword.trim()) {
      e.preventDefault();
      setKeywords([...keywords, newKeyword.trim()]);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (indexToRemove: number) => {
    setKeywords(keywords.filter((_, index) => index !== indexToRemove));
  };

  const handleAddExcludeKeyword = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newExcludeKeyword.trim()) {
      e.preventDefault();
      setExcludeKeywords([...excludeKeywords, newExcludeKeyword.trim()]);
      setNewExcludeKeyword('');
    }
  };

  const handleRemoveExcludeKeyword = (indexToRemove: number) => {
    setExcludeKeywords(excludeKeywords.filter((_, index) => index !== indexToRemove));
  };

  // --- Tab huấn luyện ---

  const handleSaveTraining = async () => {
    setBusy(true);
    setErrorMessage('');
    try {
      await api.ai.saveConfig('sales', { systemPrompt, tone });
      setSavedAt(new Date().toLocaleTimeString('vi-VN'));
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không lưu được cấu hình');
    } finally {
      setBusy(false);
    }
  };

  /** Nạp tệp chữ. Tệp nào trình duyệt không đọc được thì nói thẳng tên tệp. */
  const napChu = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const chon = e.target.files;
    if (tepChuRef.current) tepChuRef.current.value = '';
    if (!chon || chon.length === 0) return;

    setErrorMessage('');
    setBaoNap('');
    setDangNap(true);
    try {
      const kq = await napTepChu('sales', toFileArray(chon));
      if (kq.daNap.length) {
        setDocuments((truoc) => [...kq.daNap, ...truoc]);
        setBaoNap(`Đã nạp ${kq.daNap.map((d) => d.filename).join(', ')}.`);
      }
      if (kq.boQua.length) {
        setErrorMessage(
          `Chưa đọc được nội dung của: ${kq.boQua.join(', ')}. ` +
            `AI học từ chữ, nên hãy lưu thành .txt rồi tải lên, hoặc dùng nút Ảnh chụp.`
        );
      } else if (kq.loi) {
        setErrorMessage(kq.loi);
      }
    } finally {
      setDangNap(false);
    }
  };

  /**
   * Nạp ảnh: máy chủ đọc chữ trong ảnh rồi lưu phần chữ đó, nên một bảng giá
   * chụp bằng điện thoại dùng được y như tệp .txt. Đọc ảnh tốn vài giây và tốn
   * tiền gọi AI, nên khoá nút lại trong lúc chờ.
   */
  const napAnh = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const chon = e.target.files;
    if (tepAnhRef.current) tepAnhRef.current.value = '';
    if (!chon || chon.length === 0) return;

    setErrorMessage('');
    setBaoNap('');
    setDangNap(true);
    try {
      const kq = await napTepAnh('sales', toFileArray(chon));
      if (kq.daNap.length) {
        setDocuments((truoc) => [...kq.daNap, ...truoc]);
        setBaoNap(`Đã đọc xong ${kq.daNap.map((d) => d.filename).join(', ')} và lưu phần chữ trong ảnh.`);
      }
      if (kq.boQua.length) setErrorMessage(`${kq.boQua.join(', ')} không phải ảnh.`);
      else if (kq.loi) setErrorMessage(kq.loi);
    } finally {
      setDangNap(false);
    }
  };

  const doiTuChu = (phan: Partial<TuChuConfig>) => {
    setTuChu((truoc) => (truoc ? { ...truoc, ...phan } : truoc));
    setBaoTuChu('');
  };

  const luuCheDoTuChu = async () => {
    if (!tuChu || luuTuChu) return;
    setErrorMessage('');
    setLuuTuChu(true);
    try {
      const { data } = await api.ai.saveSalesAutonomy(tuChu);
      setTuChu(data.config);
      /*
       * Nói rõ đã cứu bao nhiêu hội thoại.
       *
       * Bật tự chủ mà không thấy gì đổi thì chủ shop tưởng công tắc hỏng —
       * trong khi thứ họ cần biết là những khách đang bị bỏ đã được AI nhận lại.
       */
      setBaoTuChu(
        data.hoiThoaiDaCuu && data.hoiThoaiDaCuu > 0
          ? `Đã lưu. AI nhận lại ${data.hoiThoaiDaCuu} hội thoại đang chờ người thật.`
          : 'Đã lưu chế độ tự chủ'
      );
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không lưu được chế độ tự chủ');
    } finally {
      setLuuTuChu(false);
    }
  };

  const doiBuoc = (id: string, phan: Partial<SalesStage>) => {
    setBuoc((truoc) => truoc.map((b) => (b.id === id ? { ...b, ...phan } : b)));
    setBaoBuoc('');
  };

  /** Xoá một bước. Giữ lại ít nhất một, vì không còn bước nào thì AI mù đường. */
  const xoaBuoc = (id: string) => {
    if (buoc.length <= 1) {
      setErrorMessage('Phải giữ lại ít nhất một bước bán hàng.');
      return;
    }
    setBuoc((truoc) => truoc.filter((b) => b.id !== id));
    setBaoBuoc('');
  };

  /** Đổi thứ tự: thứ tự chính là đường đi của cuộc bán hàng. */
  const doiChoBuoc = (i: number, huong: -1 | 1) => {
    const j = i + huong;
    if (j < 0 || j >= buoc.length) return;
    setBuoc((truoc) => {
      const moi = [...truoc];
      [moi[i], moi[j]] = [moi[j], moi[i]];
      return moi;
    });
    setBaoBuoc('');
  };

  const themBuoc = () => {
    if (buoc.length >= 12) {
      setErrorMessage('Tối đa 12 bước. Nhiều hơn sẽ khiến quy trình khó kiểm soát.');
      return;
    }
    setBuoc((truoc) => [
      ...truoc,
      { id: `buoc_moi_${Date.now()}`, ten: '', mucTieu: '', enabled: true },
    ]);
    setBaoBuoc('');
  };

  const luuCacBuoc = async () => {
    if (luuBuoc) return;
    setErrorMessage('');
    setLuuBuoc(true);
    try {
      const { data } = await api.ai.saveSalesStages(buoc);
      setBuoc(data.stages);
      setBaoBuoc('Đã lưu các bước bán hàng');
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : 'Không lưu được các bước bán hàng'
      );
    } finally {
      setLuuBuoc(false);
    }
  };

  const handleToggleRule = async (key: string, enabled: boolean, config?: Record<string, unknown>) => {
    setRules((prev) => ({ ...prev, [key]: { enabled, config: config ?? prev[key]?.config ?? {} } }));
    try {
      await api.ai.setHandoffRule(key, enabled, config ?? rules[key]?.config);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không lưu được quy tắc');
      await loadTraining();
    }
  };

  const handleTestAi = async (question?: string) => {
    const text = (question ?? testInput).trim();
    if (!text) return;
    setTesting(true);
    setTestReply(null);
    setErrorMessage('');
    try {
      const { data } = await api.ai.test('sales', text);
      setTestReply({ reply: data.reply, model: data.model, cost: data.usage.costUsd });
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'AI chưa trả lời được');
    } finally {
      setTesting(false);
    }
  };

  const handleRemoveDocument = async (id: number) => {
    try {
      await api.ai.removeDocument('sales', id);
      await loadTraining();
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không xoá được tài liệu');
    }
  };

  /**
   * Tab Huấn luyện AI.
   *
   * Thiết kế cho tab này đã được đặc tả từ đầu (giọng điệu, thông tin bắt buộc,
   * quy tắc nhường quyền, khung thử) nhưng chưa từng được dựng — nút tab trước
   * đây không có onClick. Phần dưới dựng theo đúng ngôn ngữ thiết kế của các
   * trang còn lại: thẻ bo 2xl, viền outline-variant, nhãn mono in hoa.
   */
  const TrainingPanel = () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h2 className="font-headline-sm text-2xl font-bold text-on-surface tracking-tight mb-2">
            Huấn luyện AI cho cuộc trò chuyện
          </h2>
          <p className="text-on-surface-variant text-sm">
            Chỉ áp dụng cho tin nhắn Messenger. Trả lời bình luận dùng câu chữ cố định,
            không gọi AI nên không cần huấn luyện.
          </p>
        </div>
        {/*
          Nút Lưu đã chuyển xuống khối "Cách nói chuyện với khách".
          Nó CHỈ lưu lời dặn và giọng điệu — bốn khối còn lại đều tự ghi ngay
          khi bạn thao tác (gạt quy tắc, xoá tài liệu). Để nó ngồi trên cùng thì
          trông như lưu cả trang, mà không phải.
        */}
      </div>

      {/* Cách làm việc: lời dặn và giọng điệu */}
      <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6">
        <h2 className="text-lg font-bold text-on-surface mb-1">Cách nói chuyện với khách</h2>
        <p className="text-sm text-on-surface-variant mb-5">
          AI dùng đúng những gì bạn viết ở đây, cộng với tài liệu đã nạp. Không tự bịa thêm.
        </p>

        <label className="font-mono text-[11px] font-bold text-on-surface-variant tracking-wider uppercase mb-2 block">
          Hướng dẫn cho AI
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={6}
          className="w-full bg-surface-container-high border border-outline focus:border-primary rounded-xl px-4 py-3 text-on-surface text-sm outline-none transition-colors resize-y mb-6"
          /*
            * Ví dụ viết MỜ, không phải chữ thật.
            *
            * Tài khoản mới sinh ra với ô này trống. Ví dụ mờ chỉ để chỉ đường —
            * không lưu vào database, không gửi cho AI. Trước đây mỗi tài khoản
            * được nhét sẵn một lời dặn mẫu, và đã có tài khoản gắn Trang bán kem
            * dưỡng tay mà vai trò AI vẫn là "chuyên viên tư vấn tài chính" suốt
            * nhiều tháng, vì nhìn qua tưởng đã cài rồi.
            */
          placeholder={
            'Ví dụ: Bạn là nhân viên bán hàng của shop bột sắn dây, xưng em và gọi khách là anh/chị.\n' +
            'Nhiệm vụ: tư vấn sản phẩm, thu đủ họ tên, số điện thoại, địa chỉ, sản phẩm và số lượng để lên đơn.\n' +
            'Không nói giá hay tình trạng hàng khi chưa có trong tài liệu.'
          }
        />
        {!systemPrompt.trim() && (
          <p className="text-sm text-orange-400 -mt-4 mb-6 flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] shrink-0">info</span>
            <span>
              Chưa viết hướng dẫn thì AI chỉ chào hỏi chung chung, không biết shop bạn bán gì.
              Viết vào đây rồi nạp tài liệu sản phẩm thì AI mới tư vấn và chốt đơn được.
            </span>
          </p>
        )}
        <label className="font-mono text-[11px] font-bold text-on-surface-variant tracking-wider uppercase mb-3 block">
          Giọng điệu
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {AI_TONES.map((option) => (
            <button
              key={option.id}
              onClick={() => setTone(option.id)}
              className={clsx(
                'text-left p-4 rounded-xl border transition-all',
                tone === option.id
                  ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(0,229,255,0.2)]'
                  : 'bg-surface-container/50 border-outline-variant hover:border-primary/50'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={clsx('font-bold text-sm', tone === option.id ? 'text-primary' : 'text-on-surface')}>
                  {option.name}
                </span>
                {tone === option.id && (
                  <span className="material-symbols-outlined text-[18px] text-primary">check_circle</span>
                )}
              </div>
              <p className="text-xs text-on-surface-variant italic leading-relaxed">“{option.example}”</p>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={handleSaveTraining}
            disabled={busy}
            className="px-5 py-2.5 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform disabled:opacity-60 disabled:hover:scale-100"
          >
            {busy ? 'Đang lưu…' : 'Lưu cách nói chuyện'}
          </button>
          {savedAt && (
            <span className="text-xs text-green-400 font-medium">Đã lưu lúc {savedAt}</span>
          )}
        </div>
      </div>

      {/*
        Tài liệu đứng ngay sau "cách nói chuyện", trước ba khối quy tắc.

        Không phải vì thẩm mỹ: chính khối này in dòng "Chưa nạp tài liệu nào —
        AI sẽ phải chuyển gần hết hội thoại cho nhân viên". Câu đó GIẢI THÍCH
        TRƯỚC cho mục "Khi nào AI chuyển cho người thật" bên dưới. Trước đây nó
        nằm SAU mục ấy, nên đọc xong mới hiểu vì sao.

        Nút tải tệp nằm luôn ở đây thay vì mở hộp thoại Vai trò: hộp thoại đó
        hiện đúng danh sách này cộng đúng ô lời dặn ở khối trên — trùng hoàn toàn
        với trang này.
      */}
      <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-on-surface mb-1">Tài liệu AI được dùng</h2>
            <p className="text-sm text-on-surface-variant">
              Bảng giá, chính sách, mẫu câu trả lời. AI chỉ dựa vào những tệp này.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="file"
              ref={tepChuRef}
              className="hidden"
              accept={NHAN_VAN_BAN}
              onChange={napChu}
              multiple
            />
            <input
              type="file"
              ref={tepAnhRef}
              className="hidden"
              accept={NHAN_ANH}
              onChange={napAnh}
              multiple
            />
            <button
              onClick={() => tepChuRef.current?.click()}
              disabled={dangNap}
              className="px-4 py-2 border border-outline-variant text-on-surface font-bold text-sm rounded-xl hover:bg-surface-variant transition-colors flex items-center gap-1.5 disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[18px]">description</span>
              Tệp chữ
            </button>
            <button
              onClick={() => tepAnhRef.current?.click()}
              disabled={dangNap}
              className="px-4 py-2 border border-outline-variant text-on-surface font-bold text-sm rounded-xl hover:bg-surface-variant transition-colors flex items-center gap-1.5 disabled:opacity-60"
            >
              {dangNap ? (
                <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-[18px]">image</span>
              )}
              {dangNap ? 'Đang đọc ảnh…' : 'Ảnh chụp'}
            </button>
          </div>
        </div>

        {baoNap && (
          <p className="text-sm text-green-500 mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            {baoNap}
          </p>
        )}

        {documents.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-6">
            Chưa nạp tài liệu nào. AI sẽ phải chuyển gần hết hội thoại cho nhân viên.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 bg-surface-container/50 border border-outline-variant rounded-xl"
              >
                <span className="material-symbols-outlined text-primary text-[20px]">
                  {doc.mime_type?.startsWith('image/') ? 'image' : 'description'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-on-surface truncate">{doc.filename}</p>
                  <p className="text-xs text-on-surface-variant">
                    {doiCoTep(doc.size_bytes)}
                    {doc.has_text ? ' · AI đọc được' : ' · Chưa trích được nội dung'}
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveDocument(doc.id)}
                  className="w-8 h-8 shrink-0 flex items-center justify-center bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors border border-error/20"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/*
        Chế độ tự chủ.

        Đặt NGAY TRÊN các bước bán hàng vì nó đổi hẳn ý nghĩa của mọi thứ bên
        dưới: tắt thì AI gặp khó là nhường cho nhân viên và câm hẳn trong hội
        thoại đó; bật thì không có ai để nhường, AI phải tự trả lời và tự chốt.
      */}
      {tuChu && (
      <div
        className={clsx(
          'relative rounded-2xl overflow-hidden border-2 transition-colors',
          tuChu.bat
            ? 'bg-primary/[0.07] border-primary shadow-[0_0_40px_rgba(0,229,255,0.18)]'
            : 'bg-surface-container/40 border-primary/45'
        )}
      >
        <div className="absolute top-0 right-0 w-72 h-72 bg-primary/10 rounded-bl-full -mr-24 -mt-24 blur-3xl pointer-events-none" />
        <div className="relative z-10 p-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5">
            <div className="flex items-start gap-4">
              <div
                className={clsx(
                  'w-12 h-12 rounded-full flex items-center justify-center shrink-0 border transition-all',
                  tuChu.bat
                    ? 'bg-primary/20 border-primary shadow-[0_0_20px_rgba(0,229,255,0.45)]'
                    : 'bg-primary/10 border-primary/40'
                )}
              >
                <span className="material-symbols-outlined text-[24px] text-primary">smart_toy</span>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase">
                    Tự chủ
                  </span>
                  <span
                    className={clsx(
                      'text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider border',
                      tuChu.bat
                        ? 'text-primary bg-primary/20 border-primary/40'
                        : 'text-on-surface-variant bg-surface-container border-outline-variant'
                    )}
                  >
                    {tuChu.bat ? 'Đang chạy' : 'Chưa bật'}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-on-surface mb-0.5">
                  AI bán hàng không cần người trực
                </h2>
                <p className="text-sm text-on-surface-variant leading-relaxed max-w-[560px]">
                  {tuChu.bat
                    ? 'AI tự xử lý mọi tình huống theo chính sách bên dưới và tự lên đơn. Bạn chỉ nhận thông báo.'
                    : 'Đang tắt — gặp tình huống khó, AI ngừng hẳn trong hội thoại đó và chờ bạn vào trả lời.'}
                </p>
              </div>
            </div>

            <button
              onClick={() => doiTuChu({ bat: !tuChu.bat })}
              className={clsx(
                'relative w-14 h-8 rounded-full transition-colors shrink-0 border',
                tuChu.bat
                  ? 'bg-primary border-primary shadow-[0_0_16px_rgba(0,229,255,0.5)]'
                  : 'bg-surface-container border-primary/40 hover:border-primary/70'
              )}
              title={tuChu.bat ? 'Tắt chế độ tự chủ' : 'Bật chế độ tự chủ'}
            >
              <span
                className={clsx(
                  'absolute top-1 w-6 h-6 rounded-full transition-all',
                  tuChu.bat ? 'left-7 bg-white' : 'left-1 bg-on-surface-variant'
                )}
              />
            </button>
          </div>

          {tuChu.bat && (
            <div className="flex flex-col gap-5 border-t border-primary/25 pt-5">
              <div className="flex items-start gap-3 text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">warning</span>
                <span className="leading-relaxed">
                  AI sẽ tự chốt đơn và tự trả lời khiếu nại mà không ai duyệt. Bốn chính sách
                  dưới đây là thứ duy nhất giữ nó trong khuôn khổ — viết càng rõ càng an toàn.
                </span>
              </div>

              {([
                ['chinhSachGiamGia', 'Khi khách mặc cả, xin giảm giá'],
                ['chinhSachVanChuyen', 'Khi khách hỏi ship, đổi trả, bảo hành'],
                ['chinhSachKhieuNai', 'Khi khách phàn nàn, khiếu nại'],
                ['chinhSachGapNguoi', 'Khi khách đòi gặp người thật'],
              ] as const).map(([khoa, nhan]) => (
                <div key={khoa}>
                  <label className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-2 block">
                    {nhan}
                  </label>
                  <textarea
                    value={tuChu[khoa]}
                    onChange={(e) => doiTuChu({ [khoa]: e.target.value } as Partial<TuChuConfig>)}
                    rows={2}
                    className="w-full bg-surface-container border border-outline-variant focus:border-primary rounded-xl px-4 py-3 text-sm text-on-surface outline-none transition-colors resize-y leading-relaxed"
                  />
                </div>
              ))}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([
                  ['tuLenDon', 'AI tự lên đơn', 'Đủ tên, số điện thoại, địa chỉ là đơn vào mục Đơn Hàng ngay. Tắt thì chỉ báo bạn.'],
                  ['nhacLai', 'Nhắc khách bỏ ngang', 'Khách im giữa chừng thì AI chủ động hỏi lại, tối đa 2 lần trong 24 giờ.'],
                  ['baoChuShop', 'Nhắn Telegram báo bạn', 'Việc vượt chính sách thì bạn nhận tin, nhưng AI vẫn nói chuyện tiếp với khách.'],
                ] as const).map(([khoa, ten, mo]) => (
                  <button
                    key={khoa}
                    onClick={() => doiTuChu({ [khoa]: !tuChu[khoa] } as Partial<TuChuConfig>)}
                    className={clsx(
                      'flex-1 p-4 rounded-xl border text-left transition-all',
                      tuChu[khoa]
                        ? 'bg-primary/10 border-primary'
                        : 'bg-surface-container border-outline-variant hover:border-primary/50'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={clsx(
                          'material-symbols-outlined text-[20px]',
                          tuChu[khoa] ? 'text-primary' : 'text-on-surface-variant'
                        )}
                      >
                        {tuChu[khoa] ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      <span
                        className={clsx(
                          'font-bold text-sm',
                          tuChu[khoa] ? 'text-primary' : 'text-on-surface'
                        )}
                      >
                        {ten}
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">{mo}</p>
                  </button>
                ))}
              </div>

              {tuChu.nhacLai && (
                <div className="flex items-center gap-3 flex-wrap text-sm text-on-surface-variant">
                  <span>Khách im</span>
                  <input
                    type="number" min={15} max={720}
                    value={tuChu.nhacSauPhut}
                    onChange={(e) => doiTuChu({ nhacSauPhut: Number(e.target.value) })}
                    className="w-[90px] bg-surface-container border border-outline-variant rounded-xl px-3 py-2 text-sm text-on-surface focus:border-primary outline-none"
                  />
                  <span>phút thì nhắc, tối đa</span>
                  <input
                    type="number" min={1} max={3}
                    value={tuChu.nhacToiDa}
                    onChange={(e) => doiTuChu({ nhacToiDa: Number(e.target.value) })}
                    className="w-[70px] bg-surface-container border border-outline-variant rounded-xl px-3 py-2 text-sm text-on-surface focus:border-primary outline-none"
                  />
                  <span>lần. Chỉ nhắc trong 24 giờ — ngoài khung đó Facebook không cho.</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={luuCheDoTuChu}
              disabled={luuTuChu}
              className="px-5 py-2.5 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform disabled:opacity-60 disabled:hover:scale-100"
            >
              {luuTuChu ? 'Đang lưu…' : 'Lưu chế độ'}
            </button>
            {baoTuChu && (
              <span className="text-xs text-green-400 font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                {baoTuChu}
              </span>
            )}
          </div>
        </div>
      </div>
      )}

      {/*
        Các bước bán hàng — phần "kịch bản Messenger" thật sự.

        Trước đây phần này KHÔNG tồn tại. AI chỉ được đưa vai trò, tài liệu và
        quy tắc nhường quyền, rồi tự ứng biến từng lượt: nó xin số điện thoại
        khi khách còn chưa biết mua gì, hoặc tư vấn mãi mà không chốt bao giờ.

        Khác hẳn kịch bản trả lời bình luận ở tab bên: bình luận chỉ là một câu
        nói ra rồi thôi, còn đây là cả một cuộc bán hàng có trước có sau.
      */}
      <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6">
        <h2 className="text-lg font-bold text-on-surface mb-1">Các bước bán hàng qua Messenger</h2>
        <p className="text-sm text-on-surface-variant mb-5 leading-relaxed">
          AI đi lần lượt từng bước và nhớ đang ở đâu, nên không nhảy thẳng vào xin số
          điện thoại khi khách chưa biết mua gì. Sửa tên, sửa việc AI phải làm, đổi thứ tự,
          xoá hay thêm bước — tất cả đều tuỳ cách shop bạn bán.
        </p>

        <div className="flex flex-col gap-3">
          {buoc.map((b, i) => (
            <div
              key={b.id}
              className={clsx(
                'rounded-xl border p-4 transition-colors',
                b.enabled
                  ? 'bg-surface-container/50 border-outline-variant'
                  : 'bg-surface-container/20 border-outline-variant/50'
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={clsx(
                    'w-7 h-7 shrink-0 rounded-full border font-mono text-xs font-bold flex items-center justify-center mt-0.5',
                    b.enabled
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'bg-surface-variant border-outline-variant text-on-surface-variant'
                  )}
                >
                  {i + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <input
                      value={b.ten}
                      onChange={(e) => doiBuoc(b.id, { ten: e.target.value })}
                      placeholder="Tên bước, ví dụ: Hỏi ngân sách"
                      className={clsx(
                        'flex-1 min-w-0 bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary font-bold text-sm px-0 py-1 outline-none transition-colors',
                        b.enabled ? 'text-on-surface' : 'text-on-surface-variant'
                      )}
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => doiChoBuoc(i, -1)}
                        disabled={i === 0}
                        title="Đưa lên trước"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-primary disabled:opacity-25 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                      </button>
                      <button
                        onClick={() => doiChoBuoc(i, 1)}
                        disabled={i === buoc.length - 1}
                        title="Đưa xuống sau"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-primary disabled:opacity-25 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                      </button>
                      <button
                        onClick={() => xoaBuoc(b.id)}
                        title="Xoá bước này"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-error transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                      <button
                        onClick={() => doiBuoc(b.id, { enabled: !b.enabled })}
                        className={clsx(
                          'relative w-11 h-6 rounded-full transition-colors shrink-0 ml-1',
                          b.enabled ? 'bg-primary' : 'bg-surface-variant border border-outline-variant'
                        )}
                        title={b.enabled ? 'Tắt bước này' : 'Bật bước này'}
                      >
                        <span
                          className={clsx(
                            'absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-all',
                            b.enabled ? 'left-[26px] bg-white' : 'left-[3px] bg-on-surface-variant'
                          )}
                        />
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={b.mucTieu}
                    onChange={(e) => doiBuoc(b.id, { mucTieu: e.target.value })}
                    rows={2}
                    placeholder="AI phải làm gì ở bước này…"
                    className="w-full mt-2 bg-surface-container-high border border-outline focus:border-primary rounded-lg px-3 py-2 text-on-surface text-xs outline-none transition-colors resize-y leading-relaxed"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={themBuoc}
          className="w-full mt-3 py-3 rounded-xl border border-dashed border-outline-variant text-sm font-bold text-on-surface-variant hover:border-primary/50 hover:text-primary transition-colors flex items-center justify-center gap-1.5"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Thêm bước
        </button>

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={luuCacBuoc}
            disabled={luuBuoc}
            className="px-5 py-2.5 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform disabled:opacity-60 disabled:hover:scale-100"
          >
            {luuBuoc ? 'Đang lưu…' : 'Lưu các bước'}
          </button>
          {baoBuoc && (
            <span className="text-xs text-green-400 font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              {baoBuoc}
            </span>
          )}
        </div>
      </div>

      {/* Thông tin AI phải thu thập */}
      <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6">
        <h2 className="text-lg font-bold text-on-surface mb-1">Thông tin AI phải thu thập</h2>
        <p className="text-sm text-on-surface-variant mb-4">
          Đủ năm thông tin này thì mới lên được đơn hàng. AI hỏi tự nhiên trong lúc tư vấn.
        </p>
        <div className="flex flex-wrap gap-2">
          {REQUIRED_INFO.map((field) => (
            <span
              key={field}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-lg text-sm font-medium text-primary"
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
              {field}
            </span>
          ))}
        </div>
      </div>

      {/* Quy tắc nhường quyền */}
      <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6">
        <h2 className="text-lg font-bold text-on-surface mb-1">Khi nào AI chuyển cho người thật</h2>
        <p className="text-sm text-on-surface-variant mb-5">
          Thà để khách chờ nhân viên vài phút, còn hơn để AI trả lời sai rồi mất khách.
        </p>

        <div className="flex flex-col gap-3">
          {HANDOFF_RULE_LABELS.map((rule) => {
            const state = rules[rule.id];
            const enabled = state?.enabled ?? false;
            const maxTurns = Number(state?.config?.maxTurns ?? 8);

            return (
              <div
                key={rule.id}
                className="flex items-center gap-4 p-4 bg-surface-container/50 border border-outline-variant rounded-xl"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-bold text-sm text-on-surface">{rule.title}</p>
                    {rule.locked && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-1.5 py-0.5 rounded uppercase tracking-wider">
                        <span className="material-symbols-outlined text-[12px]">lock</span>
                        Bắt buộc
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant">{rule.desc}</p>

                  {rule.hasInput && enabled && (
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-xs text-on-surface-variant">Sau</span>
                      <input
                        type="number"
                        min={2}
                        max={30}
                        value={maxTurns}
                        onChange={(e) =>
                          handleToggleRule(rule.id, true, { maxTurns: Number(e.target.value) })
                        }
                        className="w-16 bg-surface-container-high border border-outline focus:border-primary rounded-lg px-2 py-1 text-sm text-on-surface outline-none text-center"
                      />
                      <span className="text-xs text-on-surface-variant">{rule.inputUnit} trao đổi</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => !rule.locked && handleToggleRule(rule.id, !enabled)}
                  disabled={rule.locked}
                  title={rule.locked ? 'Quy tắc bắt buộc, không thể tắt' : undefined}
                  className={clsx(
                    'relative w-[52px] h-7 rounded-full transition-colors shrink-0',
                    enabled ? 'bg-primary' : 'bg-surface-variant border border-outline-variant',
                    rule.locked && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  <span
                    className={clsx(
                      'absolute top-[3px] w-[22px] h-[22px] bg-white rounded-full transition-all shadow',
                      enabled ? 'left-[26px]' : 'left-[3px]'
                    )}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Thử AI trước khi đưa vào sử dụng thật */}
      <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6">
        <h2 className="text-lg font-bold text-on-surface mb-1">Thử AI trước khi đưa vào sử dụng</h2>
        <p className="text-sm text-on-surface-variant mb-5">
          Đặt câu hỏi như một khách hàng để xem AI trả lời thế nào.
          {aiModel && <span className="font-mono text-xs"> Đang dùng: {aiModel}</span>}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {SUGGESTED_TEST_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => { setTestInput(prompt); handleTestAi(prompt); }}
              disabled={testing}
              className="px-3 py-1.5 bg-surface-container border border-outline-variant text-on-surface-variant text-xs font-medium rounded-lg hover:border-primary hover:text-on-surface transition-colors disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="flex gap-3 mb-4">
          <input
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleTestAi(); }}
            placeholder="Nhập câu khách hàng có thể hỏi…"
            className="flex-1 bg-surface-container-high border border-outline focus:border-primary rounded-xl px-4 py-3 text-on-surface text-sm outline-none transition-colors"
          />
          <button
            onClick={() => handleTestAi()}
            disabled={testing || !testInput.trim()}
            className="px-5 py-3 bg-primary text-on-primary font-bold text-sm rounded-xl hover:brightness-110 transition-all disabled:opacity-50"
          >
            {testing ? 'Đang hỏi…' : 'Thử'}
          </button>
        </div>

        {testReply && (
          <div className="bg-surface-container-high border border-primary/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-primary text-[18px]">smart_toy</span>
              <span className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase">AI trả lời</span>
            </div>
            <p className="text-sm text-on-surface leading-relaxed whitespace-pre-line mb-3">{testReply.reply}</p>
            <p className="font-mono text-[10px] text-on-surface-variant">
              {testReply.model} · chi phí ${testReply.cost.toFixed(6)}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <main className="flex-1  p-6 md:p-8 max-w-7xl mx-auto w-full relative    bg-background">
      
      {/* Tabs */}
      <div className="flex border-b border-outline-variant mb-6">
        {/*
          Thứ tự theo đúng đường đi của một khách hàng:
          bình luận → kịch bản bắt được → gửi tin đầu → khách trả lời → LÚC ĐÓ
          AI bán hàng mới tiếp quản. Nên "Comment sang tin nhắn" phải đứng trước.
          Trước đây tab mặc định là 'comment' nhưng lại vẽ ở vị trí thứ hai: mở
          trang lên thấy tab thứ hai đang sáng, tự nó đã gây rối.
        */}
        {[
          { id: 'cmt' as const, ten: 'Trả lời bình luận' },
          { id: 'dm' as const, ten: 'Tin nhắn Messenger' },
        ].map((o) => (
          <button
            key={o.id}
            onClick={() => setTab(o.id)}
            className={clsx('px-6 py-3 font-bold text-sm transition-colors',
              tab === o.id
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50')}
          >
            {o.ten}
          </button>
        ))}
      </div>

      {errorMessage && (
        <div className="mb-6 text-sm text-error bg-error/10 border border-error/30 rounded-xl px-4 py-3">
          {errorMessage}
        </div>
      )}

      <>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            {/*
              Tiêu đề trùng tên với tab, cố ý: trước đây chỗ này ghi "AI Bán
              Hàng" — cái tên thứ BA cho cùng một màn hình (thanh trên đã ghi
              "Kịch bản tự động", tab ghi "Comment sang tin nhắn"), mà lại không
              mô tả đúng thứ nằm bên dưới.

              Nút "Vai trò AI" cũng bỏ khỏi đây: nó mở hộp thoại trùng hoàn toàn
              với tab Huấn luyện — cùng ô lời dặn, cùng danh sách tài liệu.
            */}
            <h1 className="font-headline-sm text-3xl font-bold text-on-surface tracking-tight">
              {tab === 'cmt' ? 'Trả lời bình luận' : 'Tin nhắn Messenger'}
            </h1>
            <span className="font-mono text-xs font-bold tracking-wider text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full uppercase">
              {activeScriptCount} KỊCH BẢN ĐANG CHẠY
            </span>
          </div>
          <p className="text-on-surface-variant text-sm">
            {tab === 'cmt'
              ? 'Trả lời công khai ngay dưới bình luận của khách. Một câu, nói xong là hết.'
              : 'Nhắn riêng cho người vừa bình luận, rồi AI dẫn khách qua các bước bán hàng tới lúc chốt đơn.'}
          </p>
        </div>
        {/*
          Khi chưa có kịch bản nào, khối rỗng bên dưới đã có nút "Tạo kịch bản
          đầu tiên" to và rõ. Để thêm nút này ở đây nữa là hai nút giống hệt
          nhau trên cùng một màn hình, người dùng phải dừng lại cân nhắc xem hai
          nút có khác gì nhau không — mà không.
        */}
        <div className="flex items-center gap-3">
          {dsHienThi.length > 0 && (
          <button 
            onClick={openComposer}
            className="shrink-0 px-4 py-2 bg-primary text-on-primary font-bold rounded-lg shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Tạo kịch bản
          </button>
          )}
        </div>
      </div>

      {/*
        Số liệu: một dải mảnh, và CHỈ khi đã có kịch bản.
        Trước đây là bốn thẻ cao 140px luôn hiện. Khi chưa có kịch bản nào,
        bốn con số 0 chiếm chỗ đắt nhất màn hình để báo một điều nhìn là biết.
        Thẻ "Kịch bản đang chạy" cũng bỏ khỏi đây vì huy hiệu cạnh tiêu đề đã
        nói rồi — nó đang hiện hai lần trên cùng một màn hình.
        Ba số còn lại là một phễu, đọc được thành câu: nhắn → trả lời → chốt.
      */}
      {tab === 'dm' && scriptsDm.length > 0 && (
        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl px-5 py-4 mb-6 flex flex-wrap items-center gap-x-2 gap-y-3">
          {[
            {
              nhan: 'Đã nhắn tin đầu',
              so: stats?.firstDmSent ?? 0,
              phu: 'trong 30 ngày qua',
            },
            {
              nhan: 'Khách trả lời',
              so: stats?.customersReplied ?? 0,
              phu:
                stats?.replyRate !== null && stats?.replyRate !== undefined
                  ? `tỷ lệ ${stats.replyRate}%`
                  : 'chưa có ai',
            },
            {
              nhan: 'Chốt đơn',
              so: stats?.ordersClosed ?? 0,
              phu:
                stats && stats.ordersDelta !== 0
                  ? `${stats.ordersDelta > 0 ? '+' : ''}${stats.ordersDelta} so với tháng trước`
                  : `đã chạy trên ${stats?.postsCovered ?? 0} bài đăng`,
            },
          ].map((o, i) => (
            <React.Fragment key={o.nhan}>
              {i > 0 && (
                <span className="material-symbols-outlined text-on-surface-variant/40 text-[18px] mx-1">
                  arrow_forward
                </span>
              )}
              <div className="flex items-baseline gap-2 min-w-[150px]">
                <span className="font-headline-sm text-2xl font-bold text-on-surface">{o.so}</span>
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-bold text-on-surface">{o.nhan}</span>
                  <span className="text-xs text-on-surface-variant">{o.phu}</span>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      )}

      {/*
        Trạng thái rỗng.
        Trước đây chỗ này chỉ có scripts.map(): mảng rỗng thì vẽ ra KHÔNG GÌ CẢ,
        để lại một vùng trắng chiếm hơn nửa màn hình và không nói cho người mới
        biết phải bấm gì. Dòng chính sách Facebook gộp luôn vào đây — đọc đúng
        lúc người ta còn đang cân nhắc có nên bật hay không.
      */}
      {/*
        Trạng thái rỗng — HAI khối khác hẳn nhau, không dùng chung.

        Bản trước tôi dùng chung một khối, chỉ đổi vài chữ trong ba dòng bước.
        Nhìn vào hai tab thấy y hệt nhau, trong khi hai việc khác nhau hoàn toàn
        về bản chất: bên bình luận là một câu chữ cố định, bên Messenger là cả
        một cuộc bán hàng mà kịch bản chỉ lo đúng khúc mở lời.
      */}
      {tab === 'cmt' && dsHienThi.length === 0 && (
        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-primary text-[28px]">chat_bubble</span>
          </div>
          <h2 className="text-lg font-bold text-on-surface mb-1">Chưa có câu trả lời nào</h2>
          <p className="text-sm text-on-surface-variant mb-6 max-w-[460px] leading-relaxed">
            Gặp bình luận hợp điều kiện, hệ thống đăng đúng câu bạn soạn sẵn ngay bên dưới
            bình luận đó. Không gọi AI, không mở hội thoại — nói xong là xong.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 mb-7 text-sm">
            <span className="px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-on-surface">
              Khách bình luận
            </span>
            <span className="material-symbols-outlined text-on-surface-variant/50 text-[18px]">arrow_forward</span>
            <span className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary font-bold">
              Trả lời công khai
            </span>
          </div>

          <button
            onClick={openComposer}
            className="px-5 py-2.5 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Tạo câu trả lời đầu tiên
          </button>
        </div>
      )}

      {tab === 'dm' && dsHienThi.length === 0 && (
        <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-8">
          <h2 className="text-lg font-bold text-on-surface mb-1">Diễn biến một cuộc bán hàng</h2>
          <p className="text-sm text-on-surface-variant mb-7 leading-relaxed max-w-[560px]">
            Phần AI đã dựng sẵn ở dưới và chạy được ngay. Thứ còn thiếu chỉ là{' '}
            <b className="text-on-surface">khúc mở lời</b> — quyết định ai được mời vào
            cuộc trò chuyện và câu đầu tiên nói gì.
          </p>

          <div className="flex flex-col gap-0">
            {[
              {
                icon: 'comment',
                ten: 'Khách bình luận bài của bạn',
                mo: 'Hệ thống nhìn thấy mọi bình luận trên các bài đang chạy.',
                thieu: false,
              },
              {
                icon: 'outgoing_mail',
                ten: 'AI nhắn riêng lời mở đầu',
                mo: 'Kịch bản của bạn quyết định ai được nhắn và câu đầu tiên nói gì.',
                thieu: true,
              },
              {
                icon: 'smart_toy',
                ten: 'AI dẫn khách qua 6 bước bán hàng',
                mo: 'Chào · hỏi nhu cầu · giới thiệu · tư vấn · thuyết phục · chốt đơn. Đã cấu hình sẵn ở khối bên dưới.',
                thieu: false,
              },
              {
                icon: 'receipt_long',
                ten: 'Chốt đơn và xin thông tin khách',
                mo: 'Đủ tên, số điện thoại, địa chỉ thì đơn tự lên mục Đơn Hàng.',
                thieu: false,
              },
            ].map((b, i, ds) => (
              <div key={b.ten} className="flex gap-4">
                <div className="flex flex-col items-center shrink-0">
                  <div
                    className={clsx(
                      'w-10 h-10 rounded-full flex items-center justify-center border',
                      b.thieu
                        ? 'bg-primary/15 border-primary text-primary'
                        : 'bg-surface-container border-outline-variant text-on-surface-variant'
                    )}
                  >
                    <span className="material-symbols-outlined text-[20px]">{b.icon}</span>
                  </div>
                  {i < ds.length - 1 && <div className="w-px flex-1 bg-outline-variant my-1" />}
                </div>
                <div className={clsx('pb-6', i === ds.length - 1 && 'pb-0')}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={clsx(
                        'font-bold text-sm',
                        b.thieu ? 'text-primary' : 'text-on-surface'
                      )}
                    >
                      {b.ten}
                    </span>
                    {b.thieu ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider border text-primary bg-primary/15 border-primary/40">
                        Còn thiếu
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider border text-on-surface-variant bg-surface-variant border-outline-variant">
                        Sẵn sàng
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed max-w-[520px]">
                    {b.mo}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mt-7 pt-6 border-t border-outline-variant">
            <button
              onClick={openComposer}
              className="shrink-0 px-5 py-2.5 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              Tạo lời mở đầu
            </button>
            <p className="text-xs text-on-surface-variant leading-relaxed flex items-start gap-2">
              <span className="material-symbols-outlined text-primary text-[18px] shrink-0">shield</span>
              <span>
                Mỗi bình luận chỉ được nhắn riêng một lần — quy định của Facebook.
                Hệ thống tự chặn nhắn trùng, kể cả khi khách bình luận nhiều lần.
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Row 3: List of Scripts */}
      <div className="flex flex-col gap-4">
        {dsHienThi.map(script => (
          <div key={script.id} className="w-full bg-surface-container/30 border border-outline-variant rounded-2xl flex flex-col overflow-hidden group hover:border-primary/30 transition-colors shadow-sm">
            {/* Header */}
            <div className="p-5 flex items-center justify-between border-b border-outline-variant/50 bg-surface-container/20">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-bold text-on-surface">{script.name}</h2>
                {/* Nhìn danh sách là biết ngay cái nào chỉ nói một câu, cái nào
                    mở ra cả cuộc bán hàng. */}
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider border uppercase text-on-surface-variant bg-surface-variant border-outline-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">
                    {script.send_dm === false ? 'chat_bubble' : 'forum'}
                  </span>
                  {script.send_dm === false ? 'Trả lời bình luận' : 'Nhắn riêng'}
                </span>
                <span className={clsx(
                  "px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider border uppercase",
                  script.is_active 
                    ? "text-green-500 bg-green-500/10 border-green-500/20" 
                    : "text-on-surface-variant bg-surface-variant border-outline-variant"
                )}>
                  {script.is_active ? 'Đang chạy' : 'Tạm dừng'}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => toggleScriptStatus(script.id)}
                  className={clsx(
                    "w-11 h-6 rounded-full relative transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-surface-container",
                    script.is_active ? "bg-primary" : "bg-surface-variant border border-outline-variant"
                  )}
                >
                  <span className={clsx(
                    "absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-sm",
                    script.is_active ? "left-[26px]" : "left-[3px]"
                  )} />
                </button>
                <button
                  onClick={() => openEditor(script)}
                  title="Sửa kịch bản"
                  className="text-on-surface-variant hover:text-on-surface p-1.5 rounded-md hover:bg-surface-variant transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">edit</span>
                </button>
                <button
                  onClick={() => handleDeleteScript(script.id)}
                  title="Xoá kịch bản"
                  className="text-on-surface-variant hover:text-error p-1.5 rounded-md hover:bg-error/10 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">delete</span>
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
                <p className="text-xs text-on-surface-variant/80">{(script.match_type === 'word' ? 'Khớp nguyên từ' : script.match_type === 'exact' ? 'Khớp chính xác' : 'Chứa từ khoá') + (script.ignore_typo ? ' · Có bỏ qua lỗi chính tả' : '')}</p>
              </div>

              {/* Col 2 */}
              <div className="md:px-6 py-4 md:py-0">
                <h3 className="font-mono text-[11px] font-bold text-on-surface-variant tracking-wider uppercase mb-3">
                  {script.send_dm === false ? 'CÂU TRẢ LỜI CÔNG KHAI' : 'TIN NHẮN SẼ GỬI'}
                </h3>
                <p className="text-sm text-on-surface leading-relaxed line-clamp-3 mb-3">
                  "{script.send_dm === false ? (script.public_reply_text ?? '') : script.message}"
                </p>
                <p className="text-xs text-on-surface-variant/80">
                  {script.send_dm === false
                    ? `Trả lời sau ${script.public_reply_delay_seconds ?? 0} giây`
                    : `Gửi sau ${script.delay_seconds} giây`}
                </p>
              </div>

              {/* Col 3 */}
              <div className="md:pl-6 pt-4 md:pt-0">
                <h3 className="font-mono text-[11px] font-bold text-on-surface-variant tracking-wider uppercase mb-3">KẾT QUẢ</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-on-surface-variant">Đã kích hoạt</span>
                    <span className="font-bold text-on-surface">— {Number(script.stats?.triggered ?? 0)} lần</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-on-surface-variant">Tin đã gửi</span>
                    <span className="font-bold text-on-surface">— {Number(script.stats?.sent ?? 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-on-surface-variant">Khách phản hồi</span>
                    <span className="font-bold text-primary">— {Number(script.stats?.replied ?? 0)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-surface-container/20 border-t border-outline-variant/50 text-xs text-on-surface-variant">
              Áp dụng cho: <span className="font-medium text-on-surface">{script.apply_to === 'all' ? 'Tất cả bài đăng' : script.apply_to}{script.account_name ? ` · ${script.account_name}` : ''}</span>
            </div>
          </div>
        ))}
      </div>

      {/*
        Dòng chính sách khi đã có kịch bản: một dòng mảnh ở cuối thay vì một
        băng lớn nằm giữa màn hình. Nội dung đọc một lần là nhớ, không đáng
        chiếm chỗ của danh sách kịch bản — thứ người ta thật sự vào đây để xem.
      */}
      {tab === 'dm' && scriptsDm.length > 0 && (
        <div className="flex items-center gap-2.5 mt-6 px-1 text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-primary text-[18px] shrink-0">shield</span>
          <span className="leading-relaxed">
            Mỗi bình luận chỉ được nhắn riêng một lần — quy định của Facebook.
            Hệ thống tự chặn nhắn trùng, kể cả khi khách bình luận nhiều lần.
          </span>
        </div>
      )}

      {/*
        Toàn bộ phần AI nằm TRONG phần Messenger, không tách ra tab riêng.

        Sáu bước bán hàng, vai trò, tài liệu, quy tắc nhường người thật — không
        thứ nào trong số đó dính tới trả lời bình luận: bình luận chỉ là một câu
        chữ cố định, không gọi AI lần nào. Để chúng ở một tab "Huấn luyện AI"
        riêng khiến người dùng tưởng nó áp cho cả hai loại kịch bản.

        Gọi như một HÀM chứ không phải <TrainingPanel />: viết dạng thẻ thì mỗi
        lần gõ phím React coi đây là một loại component mới, tháo cả khối ra lắp
        lại, và con trỏ nhảy khỏi ô đang gõ sau đúng một ký tự.
      */}
      {tab === 'dm' && (
        <div className="mt-10 pt-8 border-t border-outline-variant">{TrainingPanel()}</div>
      )}

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
              <h2 className="font-headline-sm text-xl font-bold text-on-surface">{editingId ? 'Sửa kịch bản tự động' : 'Tạo kịch bản tự động'}</h2>
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
                Không còn nút chọn loại ở đây.

                Loại kịch bản do TAB đang mở quyết định: ở phần Trả lời bình
                luận thì tạo ra kịch bản trả lời bình luận, ở phần Tin nhắn
                Messenger thì tạo kịch bản nhắn riêng. Để một nút chọn trong hộp
                thoại là hai phần lại dính vào nhau y như cũ.
              */}
              <div className="flex items-center gap-2 text-sm text-on-surface-variant bg-surface-container rounded-xl px-4 py-3 border border-outline-variant">
                <span className="material-symbols-outlined text-primary text-[20px]">
                  {loaiKichBan === 'cmt' ? 'chat_bubble' : 'forum'}
                </span>
                <span>
                  Đang tạo kịch bản{' '}
                  <b className="text-on-surface">
                    {loaiKichBan === 'cmt' ? 'trả lời bình luận' : 'nhắn riêng Messenger'}
                  </b>
                  {loaiKichBan === 'dm' && ' — nội dung trò chuyện sau tin đầu do các bước bán hàng ở dưới quyết định'}
                </span>
              </div>

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
                    {matchType === 'all' && (
                      <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
                        Đang bắt mọi bình luận nên không cần từ khoá — phần trên tạm thời không dùng tới.
                      </p>
                    )}
                  </div>

                  {/* Match type radios */}
                  <div className="space-y-4 pt-4 border-t border-outline-variant/50">
                    {/*
                      "Bắt mọi bình luận" đứng đầu vì đây là lựa chọn cứu được
                      nhiều khách nhất. Từ khoá không bao giờ bắt được bình luận
                      KHÔNG CÓ CHỮ — mà rất nhiều khách Việt chỉ bình luận một
                      dấu chấm "." để đánh dấu bài, hoặc một biểu tượng cảm xúc.
                      Trước đây những bình luận đó bị bỏ qua hết trong im lặng.
                    */}
                    <label className="flex gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center w-5 h-5 shrink-0 mt-0.5">
                        <input
                          type="radio" name="matchType" value="all"
                          checked={matchType === 'all'} onChange={() => setMatchType('all')}
                          className="peer appearance-none w-5 h-5 border-2 border-outline-variant rounded-full checked:border-primary cursor-pointer transition-colors"
                        />
                        <div className="absolute w-2.5 h-2.5 rounded-full bg-primary opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"></div>
                      </div>
                      <div>
                        <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">
                          Bắt mọi bình luận
                        </span>
                        <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                          Không cần từ khoá. Bắt được cả bình luận chỉ có dấu chấm “.”,
                          “ib”, hay một biểu tượng cảm xúc — những thứ từ khoá không bao giờ bắt được.
                        </p>
                      </div>
                    </label>

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
                        <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">Chỉ khớp khi từ đứng riêng. Đây là lựa chọn được khuyến nghị.</p>
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
              {loaiKichBan === 'dm' && (
              <div>
                <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-3">TIN NHẮN RIÊNG SẼ GỬI</h3>
                <textarea 
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-surface-container-high rounded-xl border border-outline-variant p-4 text-sm text-on-surface leading-relaxed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all resize-none  mb-3"
                ></textarea>
                <div className="flex gap-2 items-start text-xs text-on-surface-variant/80 mb-4">
                  <span className="material-symbols-outlined text-[14px] shrink-0 mt-0.5">shield</span>
                  <p className="leading-relaxed">Tin nhắn phải bắt đầu bằng câu cho khách biết đây là trợ lý tự động. Đây là yêu cầu bắt buộc của Facebook.</p>
                </div>

                <div className="p-4 bg-surface-container rounded-xl border border-outline-variant">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-on-surface">Vài cách nói khác</span>
                    <span className="font-mono text-[10px] font-bold text-on-surface-variant bg-surface-container-high px-2 py-1 rounded-md uppercase">
                      Nên có
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
                    Gửi y hệt một câu cho hàng trăm người là dấu hiệu Facebook nhận ra được.
                    Thêm vài cách nói khác, mỗi lần gửi hệ thống tự chọn ngẫu nhiên một câu.
                  </p>
                  <VariationEditor
                    values={messageVariations}
                    onChange={setMessageVariations}
                    placeholder="Cùng nội dung nhưng diễn đạt khác đi"
                  />
                </div>
              </div>
              )}

              {/* Block 4: TRẢ LỜI CÔNG KHAI DƯỚI BÌNH LUẬN */}
              <div>
                <h3 className="font-mono text-[11px] font-bold text-primary tracking-wider uppercase mb-3">
                  {loaiKichBan === 'cmt' ? 'CÂU TRẢ LỜI CÔNG KHAI' : 'TRẢ LỜI CÔNG KHAI DƯỚI BÌNH LUẬN'}
                </h3>
                <div className="p-4 bg-surface-container rounded-xl border border-outline-variant">
                  {/*
                    Kịch bản chỉ trả lời bình luận thì đây LÀ toàn bộ việc nó
                    làm — không có gì để bật tắt. Hiện cái công tắc ở đây chỉ
                    tổ mời người ta tắt đi rồi kịch bản thành vô dụng.
                  */}
                  {loaiKichBan === 'dm' && (
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
                  )}
                  
                  {(loaiKichBan === 'cmt' || publicReplyEnabled) && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                      <input 
                        type="text" 
                        value={publicReplyText}
                        onChange={(e) => setPublicReplyText(e.target.value)}
                        className="w-full bg-surface-container-high border border-outline-variant rounded-lg p-3 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all mb-2"
                      />
                      <p className="text-xs text-on-surface-variant leading-relaxed mb-4">Câu này hiện công khai dưới bình luận để khách biết mà vào xem tin nhắn</p>

                      <VariationEditor
                        values={publicReplyVariations}
                        onChange={setPublicReplyVariations}
                        placeholder="Ví dụ: Em nhắn riêng cho mình rồi nha!"
                      />
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
                  <p className="text-xs text-on-surface-variant leading-relaxed">Gửi ngay dễ bị nhận diện là tự động. Nên chờ vài chục giây.</p>

                  {publicReplyEnabled && (
                    <div className="mt-5 pt-4 border-t border-outline-variant/50">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-bold text-on-surface">
                          Trả lời công khai sau {Math.max(publicReplyDelay, delay)} giây
                        </span>
                        <span className="font-mono text-[11px] text-on-surface-variant font-bold bg-surface-container-high px-2 py-1 rounded-md">
                          {Math.max(publicReplyDelay, delay)}s
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0" max="300" step="1"
                        value={publicReplyDelay}
                        onChange={(e) => setPublicReplyDelay(Number(e.target.value))}
                        className="w-full accent-primary h-1 bg-outline-variant/50 rounded-lg appearance-none cursor-pointer hover:bg-outline-variant transition-colors mb-4"
                      />
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        {publicReplyDelay < delay
                          ? `Đặt ${publicReplyDelay}s nhưng sẽ chạy ở ${delay}s: câu trả lời công khai không bao giờ được đi trước tin nhắn riêng, vì nó mời thêm người khác bình luận trong khi người đầu tiên chưa nhận được gì.`
                          : 'Câu trả lời công khai luôn đi sau tin nhắn riêng.'}
                      </p>
                    </div>
                  )}
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
                onClick={handleSaveScript}
                disabled={busy}
                className="flex-[2] py-3 rounded-xl bg-primary text-on-primary font-bold text-sm shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy ? 'Đang lưu…' : editingId ? 'Lưu thay đổi' : 'Tạo kịch bản'}
              </button>
            </div>
          </div>
        </div>
      )}

      </>

      {/*
        Hộp thoại Vai trò đã gỡ khỏi trang này.

        Nó hiện đúng hai thứ tab Huấn luyện đã có: ô lời dặn (cùng một trường
        system_prompt) và danh sách tài liệu (cùng một dữ liệu, ở đây còn có cả
        nút xoá). Thứ duy nhất chỉ nó làm được là TẢI TỆP LÊN — việc đó nay nằm
        ngay trong khối "Tài liệu AI được dùng".

        Component vẫn giữ nguyên cho AI Viết Bài, Quảng Cáo và Thống Kê: ở những
        trang đó nó là giao diện duy nhất.
      */}
    </main>
  );
}
