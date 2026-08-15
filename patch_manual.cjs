const fs = require('fs');
let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

const regex = /<p className="text-on-surface-variant font-medium leading-relaxed mb-8">[\s\S]*?<a href="#" className="text-sm font-bold text-primary hover:underline inline-block">Cách tạo mật khẩu ứng dụng<\/a>\s*<\/div>/g;

const newManual = `{selectedPlatform.warnings && selectedPlatform.warnings.length > 0 && (
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
)}`;

if (regex.test(content)) {
  content = content.replace(regex, newManual);
  fs.writeFileSync('src/pages/Connections.tsx', content);
  console.log("Replaced manual_credentials section with regex!");
} else {
  console.log("Could not find exact string for manual with regex.");
}
