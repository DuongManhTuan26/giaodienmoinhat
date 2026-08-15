const fs = require('fs');
let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

const regex = /\{channel\.publishOnly && \(\s*<div className="absolute top-2 left-2 bg-surface-container text-on-surface-variant text-\[9px\] uppercase font-bold tracking-wider px-1\.5 py-0\.5 rounded border border-outline-variant\/50 flex items-center gap-0\.5 shadow-sm opacity-80">\s*<span className="material-symbols-outlined text-\[10px\]">edit_note<\/span>\s*Chỉ đăng bài\s*<\/div>\s*\)\}/g;

const newGridCard = `{channel.publishOnly ? (
  <div className="absolute top-2 left-2 bg-surface-container text-on-surface-variant text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border border-outline-variant/50 flex items-center gap-0.5 shadow-sm opacity-80 z-10">
    <span className="material-symbols-outlined text-[10px]">edit_note</span>
    Chỉ đăng bài
  </div>
) : channel.warnings && channel.warnings.length > 0 ? (
  <div className="absolute top-2 left-2 bg-orange-500/10 text-orange-400 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border border-orange-500/20 flex items-center gap-0.5 shadow-sm z-10" title={channel.warnings[0]}>
    <span className="material-symbols-outlined text-[10px]">warning</span>
    Lưu ý
  </div>
) : null}`;

if (regex.test(content)) {
  content = content.replace(regex, newGridCard);
  fs.writeFileSync('src/pages/Connections.tsx', content);
  console.log("Replaced grid card warnings with regex!");
} else {
  console.log("Could not find exact string for grid card with regex.");
}
