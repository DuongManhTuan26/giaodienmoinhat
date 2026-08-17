import React, { useState, useRef } from 'react';
import { clsx } from 'clsx';

interface AITrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiName: string;
}

interface UploadedFile {
  id: string;
  name: string;
  type: 'text' | 'image' | 'video';
  size: string;
}

/**
 * Duyệt FileList theo chỉ số thay vì Array.from.
 * @types/node khai báo một kiểu File toàn cục khác với File của trình duyệt,
 * khiến Array.from(FileList) bị suy ra thành unknown khi hai kiểu này cùng tồn tại.
 */
function toFileArray(list: FileList): File[] {
  const files: File[] = [];
  for (let i = 0; i < list.length; i++) {
    const file = list.item(i);
    if (file) files.push(file);
  }
  return files;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AITrainingModal({ isOpen, onClose, aiName }: AITrainingModalProps) {
  const [role, setRole] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([
    { id: '1', name: 'Kien_thuc_chuyen_nganh.pdf', type: 'text', size: '2.4 MB' },
    { id: '2', name: 'Mau_san_pham_2026.png', type: 'image', size: '1.1 MB' }
  ]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'text' | 'image' | 'video') => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFiles: UploadedFile[] = toFileArray(selectedFiles).map((file, index) => ({
      id: Date.now().toString() + index,
      name: file.name,
      type: type,
      size: formatSize(file.size)
    }));

    setFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setFiles(files.filter(f => f.id !== id));
  };

  const triggerUpload = (type: 'text' | 'image' | 'video') => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = type === 'text' ? '.txt,.doc,.docx,.pdf' : type === 'image' ? 'image/*' : 'video/*';
      fileInputRef.current.click();
      // The onchange handler doesn't naturally know the type if we use a single input, 
      // but we can just infer from the file object in a real app.
      // For this prototype, we'll just let the onchange handle it generically.
    }
  };

  const handleGenericUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFiles: UploadedFile[] = toFileArray(selectedFiles).map((file, index) => {
      let fileType: 'text' | 'image' | 'video' = 'text';
      if (file.type.startsWith('image/')) fileType = 'image';
      else if (file.type.startsWith('video/')) fileType = 'video';

      return {
        id: Date.now().toString() + index,
        name: file.name,
        type: fileType,
        size: formatSize(file.size)
      };
    });

    setFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300" onClick={onClose}></div>
      <div className="relative w-full max-w-[720px] max-h-[90vh] bg-surface-container-high border border-primary/30 rounded-2xl shadow-[0_0_40px_rgba(0,229,255,0.1)] flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-outline-variant flex items-center justify-between bg-surface-container/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[24px]">model_training</span>
            </div>
            <div>
              <h2 className="font-headline-sm text-xl font-bold text-on-surface">Huấn Luyện: {aiName}</h2>
              <p className="text-sm text-on-surface-variant">Cấu hình vai trò và nguồn kiến thức riêng cho AI này</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
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
            <p className="text-sm text-on-surface-variant mb-4">Tải lên các tài liệu văn bản, hình ảnh, hoặc video để AI học hỏi văn phong, nhận diện hình ảnh và kiến thức sản phẩm chuyên sâu.</p>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleGenericUpload} 
              multiple 
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <button 
                onClick={() => triggerUpload('text')}
                className="flex flex-col items-center justify-center gap-2 p-4 border border-dashed border-outline-variant rounded-xl bg-surface-container hover:border-primary hover:bg-primary/5 transition-all text-on-surface-variant hover:text-primary group"
              >
                <div className="w-12 h-12 rounded-full bg-surface-variant group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                  <span className="material-symbols-outlined text-[24px]">description</span>
                </div>
                <div className="text-center">
                  <span className="text-sm font-bold block mb-1">Văn bản</span>
                  <span className="text-xs text-on-surface-variant">.txt, .doc, .pdf</span>
                </div>
              </button>
              
              <button 
                onClick={() => triggerUpload('image')}
                className="flex flex-col items-center justify-center gap-2 p-4 border border-dashed border-outline-variant rounded-xl bg-surface-container hover:border-primary hover:bg-primary/5 transition-all text-on-surface-variant hover:text-primary group"
              >
                <div className="w-12 h-12 rounded-full bg-surface-variant group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                  <span className="material-symbols-outlined text-[24px]">image</span>
                </div>
                <div className="text-center">
                  <span className="text-sm font-bold block mb-1">Hình ảnh</span>
                  <span className="text-xs text-on-surface-variant">.jpg, .png</span>
                </div>
              </button>
              
              <button 
                onClick={() => triggerUpload('video')}
                className="flex flex-col items-center justify-center gap-2 p-4 border border-dashed border-outline-variant rounded-xl bg-surface-container hover:border-primary hover:bg-primary/5 transition-all text-on-surface-variant hover:text-primary group"
              >
                <div className="w-12 h-12 rounded-full bg-surface-variant group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                  <span className="material-symbols-outlined text-[24px]">movie</span>
                </div>
                <div className="text-center">
                  <span className="text-sm font-bold block mb-1">Video</span>
                  <span className="text-xs text-on-surface-variant">.mp4, .mov</span>
                </div>
              </button>
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
                          file.type === 'text' ? "text-blue-400" : file.type === 'image' ? "text-green-400" : "text-purple-400"
                        )}>
                          {file.type === 'text' ? 'description' : file.type === 'image' ? 'image' : 'movie'}
                        </span>
                      </div>
                      <div className="truncate">
                        <p className="text-sm font-bold text-on-surface truncate">{file.name}</p>
                        <p className="text-xs text-on-surface-variant">{file.size}</p>
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
            onClick={() => {
              // In real app, save logic here
              onClose();
            }} 
            className="px-6 py-2.5 rounded-full bg-primary text-on-primary font-bold text-sm hover:brightness-110 shadow-[0_0_15px_rgba(0,229,255,0.4)] transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            Lưu cấu hình AI
          </button>
        </div>
      </div>
    </div>
  );
}
