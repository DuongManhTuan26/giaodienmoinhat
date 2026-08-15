const fs = require('fs');
let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

const oldOAuthContent = `<div className="space-y-4 mb-8">
                    <div className="flex gap-4">
                      <div className="w-7 h-7 rounded-full bg-surface-variant flex items-center justify-center text-sm font-bold text-on-surface shrink-0">1</div>
                      <div className="pt-0.5 text-sm font-medium text-on-surface">Bấm nút bên dưới, một cửa sổ {selectedPlatform.name} sẽ mở ra</div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-7 h-7 rounded-full bg-surface-variant flex items-center justify-center text-sm font-bold text-on-surface shrink-0">2</div>
                      <div className="pt-0.5 text-sm font-medium text-on-surface">
                        Đăng nhập tài khoản {selectedPlatform.name} của bạn
                        {selectedPlatform.id === 'fb_ads' && (
                          <div className="text-xs text-on-surface-variant mt-1">Nếu bạn chỉ cần chạy quảng cáo, không cần chọn Trang.</div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-7 h-7 rounded-full bg-surface-variant flex items-center justify-center text-sm font-bold text-on-surface shrink-0">3</div>
                      <div className="pt-0.5 text-sm font-medium text-on-surface">Cấp đủ các quyền được yêu cầu</div>
                    </div>
                  </div>`;

const newOAuthContent = `{selectedPlatform.warnings && selectedPlatform.warnings.length > 0 && (
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
)}`;

if (content.includes(oldOAuthContent)) {
  content = content.replace(oldOAuthContent, newOAuthContent);
  fs.writeFileSync('src/pages/Connections.tsx', content);
  console.log("Successfully replaced OAuth step instructions!");
} else {
  console.log("Could not find the exact string.");
}
