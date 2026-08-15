const fs = require('fs');
let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

const regex = /<p className="text-on-surface-variant font-medium leading-relaxed mb-8">[\s\S]*?<div className="mb-8">\s*<h3 className="font-mono text-\[11px\] font-bold tracking-wider text-on-surface-variant uppercase mb-4">HƯỚNG DẪN<\/h3>[\s\S]*?<\/ol>\s*<\/div>/g;

const newAccessCode = `{selectedPlatform.warnings && selectedPlatform.warnings.length > 0 && (
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
    <span className="text-3xl font-mono font-bold text-on-surface tracking-widest">ZRN-W8FFLZ</span>
    <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-variant text-on-surface hover:bg-surface-variant/80 transition-colors">
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
)}`;

if (regex.test(content)) {
  content = content.replace(regex, newAccessCode);
  fs.writeFileSync('src/pages/Connections.tsx', content);
  console.log("Replaced access_code section with regex!");
} else {
  console.log("Could not find exact string for access_code with regex.");
}
