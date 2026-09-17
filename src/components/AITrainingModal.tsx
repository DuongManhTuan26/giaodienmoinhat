import React, { useState, useRef, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { api, ApiError, type AiDocument } from '../lib/api';
import {
  toFileArray, doiCoTep, napTepChu, napTepAnh,
  NHAN_VAN_BAN, NHAN_ANH,
} from '../lib/aiDocuments';

/** Loại AI, khớp với cột kind trong bảng ai_configs. */
export type AiKind = 'content' | 'ads' | 'sales' | 'analytics';

interface AITrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiName: string;
  /**
   * AI nào đang được đặt vai trò.
   *
   * Bắt buộc: mỗi AI có lời dạy và kho tài liệu riêng. Thiếu tham số này thì
   * bốn màn hình cùng ghi đè lên một chỗ.
   */
  kind: AiKind;
  /** Gọi sau khi lưu xong, để màn hình cha nạp lại cấu hình mới. */
  onSaved?: () => void;
}


export default function AITrainingModal({
  isOpen, onClose, aiName, kind, onSaved,
}: AITrainingModalProps) {
  const [role, setRole] = useState('');
  const [files, setFiles] = useState<AiDocument[]>([]);
  const [dangTai, setDangTai] = useState(true);
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState('');
  const [bao, setBao] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  /** Đang gọi AI đọc ảnh — khoá nút để không bấm chồng lượt tốn tiền. */
  const [dangDocAnh, setDangDocAnh] = useState(false);

  /**
   * Nạp cấu hình và tài liệu THẬT của AI này.
   *
   * Bản trước không gọi API nào: ô vai trò luôn trống, và danh sách tài liệu là
   * hai tệp bịa sẵn trong mã ("Kien_thuc_chuyen_nganh.pdf", "Mau_san_pham_2026.png")
   * mà gian hàng nào mở ra cũng thấy. Mọi thứ gõ vào đây đều mất khi đóng modal.
   */
  const nap = useCallback(async () => {
    setDangTai(true);
    setLoi('');
    try {
      const { data } = await api.ai.config(kind);
      setRole(data.config.system_prompt ?? '');
      setFiles(data.documents ?? []);
    } catch (error) {
      setLoi(error instanceof ApiError ? error.message : 'Không tải được cấu hình AI');
    } finally {
      setDangTai(false);
    }
  }, [kind]);

  useEffect(() => { if (isOpen) nap(); }, [isOpen, nap]);

  if (!isOpen) return null;

  /**
   * Tải tài liệu lên thật.
   *
   * Đọc chữ ngay trong trình duyệt rồi gửi phần chữ đó lên. Tệp nào trình duyệt
   * không đọc được chữ thì nói thẳng, không nhận rồi im lặng bỏ đi như bản trước.
   */
  /**
   * Tải ảnh lên.
   *
   * Máy chủ đọc chữ trong ảnh rồi lưu phần chữ đó, nên một bảng giá chụp bằng
   * điện thoại dùng được y như tệp .txt. Đọc ảnh mất vài giây và tốn tiền gọi
   * AI, nên phải khoá nút lại và nói rõ đang làm gì.
   */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const chon = e.target.files;
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (!chon || chon.length === 0) return;

    setLoi('');
    setBao('');
    setDangDocAnh(true);
    try {
      const kq = await napTepAnh(kind, toFileArray(chon));
      if (kq.daNap.length) {
        setFiles((truoc) => [...kq.daNap, ...truoc]);
        setBao(`Đã đọc xong ${kq.daNap.map((d) => d.filename).join(', ')} và lưu phần chữ trong ảnh.`);
      }
      if (kq.boQua.length) setLoi(`${kq.boQua.join(', ')} không phải ảnh.`);
      else if (kq.loi) setLoi(kq.loi);
    } finally {
      setDangDocAnh(false);
    }
  };

  const handleGenericUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const chon = e.target.files;
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!chon || chon.length === 0) return;

    setLoi('');
    setBao('');
    const kq = await napTepChu(kind, toFileArray(chon));
    if (kq.daNap.length) setFiles((truoc) => [...kq.daNap, ...truoc]);

    if (kq.boQua.length > 0) {
      setLoi(
        `Chưa đọc được nội dung của: ${kq.boQua.join(', ')}. ` +
          `AI học từ chữ, nên hãy lưu tài liệu thành .txt rồi tải lên. ` +
          `Nếu là ảnh chụp, hãy dùng ô Hình ảnh bên cạnh.`
      );
    } else if (kq.loi) {
      setLoi(kq.loi);
    }
  };

  const removeFile = async (id: number) => {
    setLoi('');
    try {
      await api.ai.removeDocument(kind, id);
      setFiles((truoc) => truoc.filter((f) => f.id !== id));
    } catch (error) {
      setLoi(error instanceof ApiError ? error.message : 'Không xoá được tài liệu');
    }
  };

  const triggerUpload = () => fileInputRef.current?.click();
  const triggerImageUpload = () => imageInputRef.current?.click();

  /** Lưu lời dạy. Bản trước chỉ đóng modal và vứt hết. */
  const handleSave = async () => {
    setDangLuu(true);
    setLoi('');
    try {
      await api.ai.saveConfig(kind, { systemPrompt: role });
      setBao('Đã lưu cấu hình AI');
      onSaved?.();
      onClose();
    } catch (error) {
      setLoi(error instanceof ApiError ? error.message : 'Không lưu được cấu hình');
    } finally {
      setDangLuu(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300" onClick={onClose}></div>
      <div className="relative w-full max-w-[720px] max-h-[90vh] bg-surface-container-high border border-primary/30 rounded-2xl shadow-[0_0_40px_rgba(0,229,255,0.1)] flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-outline-variant flex items-center justify-between bg-surface-container/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[24px]">badge</span>
            </div>
            <div>
              <h2 className="font-headline-sm text-xl font-bold text-on-surface">Vai trò: {aiName}</h2>
              <p className="text-sm text-on-surface-variant">Cấu hình vai trò và nguồn kiến thức riêng cho AI này</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
          {loi && (
            <div className="flex items-start gap-3 text-sm text-error bg-error/10 border border-error/30 rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
              <span className="flex-1 leading-relaxed">{loi}</span>
              <button onClick={() => setLoi('')} className="shrink-0 opacity-60 hover:opacity-100">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          )}
          {bao && (
            <div className="text-sm text-green-400 bg-green-400/10 border border-green-400/30 rounded-xl px-4 py-3">
              {bao}
            </div>
          )}
          {dangTai && (
            <div className="text-sm text-on-surface-variant flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
              Đang tải cấu hình đã lưu…
            </div>
          )}

          {/* Vai trò */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">Vai trò & Định hướng (System Prompt)</label>
            <textarea 
              className="w-full h-32 bg-surface-container-lowest border border-outline-variant rounded-xl p-4 text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none"
              placeholder={`Ví dụ: Bạn là một chuyên gia đảm nhiệm ${aiName}. Nhiệm vụ của bạn là...`}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            ></textarea>
          </div>

          {/* Nguồn dữ liệu */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">Tài liệu tham khảo (Knowledge Base)</label>
            <p className="text-sm text-on-surface-variant mb-4">
              Tải bảng giá, danh sách sản phẩm, câu hỏi thường gặp… để AI trả lời khách
              đúng thông tin của shop. Tệp chữ (.txt, .md, .csv, .json) dùng được ngay;
              ảnh chụp thì AI sẽ <b className="text-on-surface">đọc chữ trong ảnh</b> rồi
              học từ phần chữ đó.
            </p>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept={NHAN_VAN_BAN}
              onChange={handleGenericUpload} 
              multiple 
            />

            <input
              type="file"
              ref={imageInputRef}
              className="hidden"
              accept={NHAN_ANH}
              onChange={handleImageUpload}
              multiple
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <button 
                onClick={triggerUpload}
                className="flex flex-col items-center justify-center gap-2 p-4 border border-dashed border-outline-variant rounded-xl bg-surface-container hover:border-primary hover:bg-primary/5 transition-all text-on-surface-variant hover:text-primary group"
              >
                <div className="w-12 h-12 rounded-full bg-surface-variant group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                  <span className="material-symbols-outlined text-[24px]">description</span>
                </div>
                <div className="text-center">
                  <span className="text-sm font-bold block mb-1">Văn bản</span>
                  <span className="text-xs text-on-surface-variant">.txt, .md, .csv, .json</span>
                </div>
              </button>
              
              {/*
                Ảnh: AI vẫn chỉ đọc được CHỮ, nên ảnh được đọc thành chữ ngay lúc
                tải lên rồi lưu vào đúng cột mà mọi AI khác đang dùng. Nhờ vậy
                một bảng giá chụp bằng điện thoại dùng được như tệp .txt.
              */}
              <button
                onClick={triggerImageUpload}
                disabled={dangDocAnh}
                title="Ảnh bảng giá, ảnh sản phẩm — AI đọc chữ trong ảnh"
                className="flex flex-col items-center justify-center gap-2 p-4 border border-dashed border-outline-variant rounded-xl bg-surface-container hover:border-primary hover:bg-primary/5 transition-all text-on-surface-variant hover:text-primary group disabled:opacity-60 disabled:cursor-wait disabled:hover:border-outline-variant disabled:hover:bg-surface-container"
              >
                <div className="w-12 h-12 rounded-full bg-surface-variant group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                  {dangDocAnh ? (
                    <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  ) : (
                    <span className="material-symbols-outlined text-[24px]">image</span>
                  )}
                </div>
                <div className="text-center">
                  <span className="text-sm font-bold block mb-1">Hình ảnh</span>
                  <span className="text-xs text-on-surface-variant">
                    {dangDocAnh ? 'Đang đọc chữ trong ảnh…' : '.png, .jpg, .webp'}
                  </span>
                </div>
              </button>
              
              {/*
                Video vẫn chưa: muốn học được phải bóc lời thoại thành chữ, mà hệ
                thống chưa có dịch vụ chuyển giọng nói. Để mờ và nói đúng lý do
                còn hơn nhận tệp rồi lặng lẽ bỏ đi.
              */}
              <div
                title="Cần chuyển giọng nói thành văn bản. Tính năng này chưa có."
                className="flex flex-col items-center justify-center gap-2 p-4 border border-dashed border-outline-variant/50 rounded-xl bg-surface-container/40 text-on-surface-variant/50 cursor-not-allowed"
              >
                <div className="w-12 h-12 rounded-full bg-surface-variant/50 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[24px]">movie</span>
                </div>
                <div className="text-center">
                  <span className="text-sm font-bold block mb-1">Video</span>
                  <span className="text-xs">Chưa hỗ trợ</span>
                </div>
              </div>
            </div>

            {/* Danh sách file đã tải */}
            {files.length > 0 && (
              <div className="space-y-2 mt-6">
                <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">Tài liệu đã tải lên ({files.length})</h3>
                {files.map(file => (
                  <div key={file.id} className="flex items-center justify-between p-3 bg-surface-container-lowest border border-outline-variant rounded-xl group hover:border-primary/50 transition-colors">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                        <span className={clsx(
                          "material-symbols-outlined text-[20px]",
                          file.has_text ? "text-blue-400" : "text-on-surface-variant"
                        )}>
                          {file.has_text ? 'description' : 'help'}
                        </span>
                      </div>
                      <div className="truncate">
                        <p className="text-sm font-bold text-on-surface truncate">{file.filename}</p>
                        <p className="text-xs text-on-surface-variant">
                          {doiCoTep(file.size_bytes)}
                          {file.has_text ? ' · AI đã đọc được' : ' · chưa đọc được nội dung'}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => removeFile(file.id)}
                      className="text-on-surface-variant hover:text-error hover:bg-error/10 w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-outline-variant/50 bg-surface-container/30 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-6 py-2.5 rounded-full text-sm font-bold text-on-surface hover:bg-surface-variant transition-colors">
            Hủy bỏ
          </button>
          <button 
            onClick={handleSave}
            disabled={dangLuu || dangTai}
            className="px-6 py-2.5 rounded-full bg-primary text-on-primary font-bold text-sm hover:brightness-110 shadow-[0_0_15px_rgba(0,229,255,0.4)] transition-all flex items-center gap-2 disabled:opacity-60"
          >
            <span className={clsx("material-symbols-outlined text-[18px]", dangLuu && "animate-spin")}>
              {dangLuu ? 'progress_activity' : 'save'}
            </span>
            {dangLuu ? 'Đang lưu…' : 'Lưu cấu hình AI'}
          </button>
        </div>
      </div>
    </div>
  );
}
