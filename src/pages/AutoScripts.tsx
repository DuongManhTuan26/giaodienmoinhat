import React, { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import AITrainingModal from '../components/AITrainingModal';
import { api, ApiError, type AiDocument } from '../lib/api';
import { useActivePage } from '../lib/ActivePage';
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
  apply_to: string;
  is_active: boolean;
  stats: Record<string, unknown>;
  account_name: string | null;
  platform: string | null;
}

export default function AutoScripts() {
  const { accounts, activeAccountId } = useActivePage();

  const [tab, setTab] = useState<'training' | 'comment'>('comment');
  const [scripts, setScripts] = useState<ScriptRow[]>([]);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isTrainingOpen, setIsTrainingOpen] = useState(false);
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
  const [applyTo, setApplyTo] = useState('all');

  // Tab huấn luyện AI bán hàng
  const [systemPrompt, setSystemPrompt] = useState('');
  const [tone, setTone] = useState('friendly');
  const [documents, setDocuments] = useState<AiDocument[]>([]);
  const [aiModel, setAiModel] = useState('');
  const [rules, setRules] = useState<Record<string, { enabled: boolean; config: Record<string, unknown> }>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Khung thử AI
  const [testInput, setTestInput] = useState('');
  const [testReply, setTestReply] = useState<{ reply: string; model: string; cost: number } | null>(null);
  const [testing, setTesting] = useState(false);

  const loadScripts = useCallback(async () => {
    try {
      const { data } = await api.settings.autoScripts();
      setScripts(data);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không tải được kịch bản');
    }
  }, []);

  const loadTraining = useCallback(async () => {
    try {
      const [config, handoff] = await Promise.all([
        api.ai.config('sales'),
        api.ai.handoffRules(),
      ]);
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

  const activeScriptCount = scripts.filter((s) => s.is_active).length;

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
    setApplyTo('all');
  };

  const openComposer = () => { resetForm(); setErrorMessage(''); setIsComposerOpen(true); };

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
    setDelay(script.delay_seconds);
    setApplyTo(script.apply_to);
    setErrorMessage('');
    setIsComposerOpen(true);
  };

  const handleSaveScript = async () => {
    if (!scriptName.trim()) { setErrorMessage('Hãy đặt tên cho kịch bản.'); return; }
    if (keywords.length === 0) { setErrorMessage('Phải có ít nhất một từ khoá kích hoạt.'); return; }
    if (!message.trim()) { setErrorMessage('Hãy nhập nội dung tin nhắn sẽ gửi cho khách.'); return; }

    setBusy(true);
    setErrorMessage('');
    try {
      const payload = {
        name: scriptName.trim(),
        keywords,
        excludeKeywords,
        matchType,
        ignoreTypo,
        message: message.trim(),
        publicReplyEnabled,
        publicReplyText: publicReplyText.trim(),
        delaySeconds: delay,
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
   * Tab Đào tạo AI.
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
          <h1 className="font-headline-sm text-3xl font-bold text-on-surface tracking-tight mb-2">Đào tạo AI Bán Hàng</h1>
          <p className="text-on-surface-variant text-sm">
            Dạy AI cách trả lời khách và quy định khi nào phải chuyển cho người thật
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {savedAt && (
            <span className="text-xs text-green-400 font-medium">Đã lưu lúc {savedAt}</span>
          )}
          <button
            onClick={handleSaveTraining}
            disabled={busy}
            className="px-5 py-2.5 bg-primary text-on-primary font-bold rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform disabled:opacity-60 disabled:hover:scale-100"
          >
            {busy ? 'Đang lưu…' : 'Lưu cấu hình'}
          </button>
        </div>
      </div>

      {/* Vai trò và văn phong */}
      <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6">
        <h2 className="text-lg font-bold text-on-surface mb-1">Vai trò và cách nói chuyện</h2>
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
          placeholder="Ví dụ: Bạn là nhân viên bán hàng của shop thời trang, xưng em và gọi khách là anh/chị…"
        />

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

      {/* Tài liệu đã nạp */}
      <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-on-surface mb-1">Tài liệu AI đã học</h2>
            <p className="text-sm text-on-surface-variant">
              Bảng giá, chính sách, mẫu câu trả lời. AI chỉ dựa vào những tệp này.
            </p>
          </div>
          <button
            onClick={() => setIsTrainingOpen(true)}
            className="px-4 py-2 border border-outline-variant text-on-surface font-bold text-sm rounded-xl hover:bg-surface-variant transition-colors flex items-center gap-1.5 shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            Nạp tài liệu
          </button>
        </div>

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
                <span className="material-symbols-outlined text-primary text-[20px]">description</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-on-surface truncate">{doc.filename}</p>
                  <p className="text-xs text-on-surface-variant">
                    {(doc.size_bytes / 1024).toFixed(1)} KB
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

      {/* Thử AI trước khi cho chạy thật */}
      <div className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6">
        <h2 className="text-lg font-bold text-on-surface mb-1">Thử AI trước khi cho chạy</h2>
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
        <button
          onClick={() => setTab('training')}
          className={clsx('px-6 py-3 font-bold text-sm transition-colors',
            tab === 'training'
              ? 'text-primary border-b-2 border-primary bg-primary/5'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50')}
        >
          Đào tạo AI
        </button>
        <button
          onClick={() => setTab('comment')}
          className={clsx('px-6 py-3 font-bold text-sm transition-colors',
            tab === 'comment'
              ? 'text-primary border-b-2 border-primary bg-primary/5'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50')}
        >
          Comment sang tin nhắn
        </button>
      </div>

      {errorMessage && (
        <div className="mb-6 text-sm text-error bg-error/10 border border-error/30 rounded-xl px-4 py-3">
          {errorMessage}
        </div>
      )}

      {tab === 'training' && <TrainingPanel />}

      {tab === 'comment' && (<>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-headline-sm text-3xl font-bold text-on-surface tracking-tight">AI Bán Hàng</h1>
            <span className="font-mono text-xs font-bold tracking-wider text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full uppercase">
              {activeScriptCount} KỊCH BẢN ĐANG CHẠY
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
            onClick={openComposer}
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
                <h3 className="font-mono text-[11px] font-bold text-on-surface-variant tracking-wider uppercase mb-3">TIN NHẮN SẼ GỬI</h3>
                <p className="text-sm text-on-surface leading-relaxed line-clamp-3 mb-3">"{script.message}"</p>
                <p className="text-xs text-on-surface-variant/80">{`Gửi sau ${script.delay_seconds} giây`}</p>
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

      </>)}

      <AITrainingModal isOpen={isTrainingOpen} onClose={() => setIsTrainingOpen(false)} aiName="AI Bán Hàng" />
    </main>
  );
}
