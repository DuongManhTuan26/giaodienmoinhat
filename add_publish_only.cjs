const fs = require('fs');

let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

const target = `<span className="material-symbols-outlined text-[32px] text-on-surface mb-3">{channel.icon}</span>`;
const replacement = `{channel.publishOnly && (
                    <div className="absolute top-2 left-2 bg-surface-container text-on-surface-variant text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border border-outline-variant/50 flex items-center gap-0.5 shadow-sm opacity-80">
                      <span className="material-symbols-outlined text-[10px]">edit_note</span>
                      Chỉ đăng bài
                    </div>
                  )}
                  <span className="material-symbols-outlined text-[32px] text-on-surface mb-3">{channel.icon}</span>`;

if (content.includes(target)) {
  // Wait, there might be multiple instances (one for social, one for ads, etc). 
  // Let's replace only the first one which is inside socialChannels!
  let firstIndex = content.indexOf(target);
  if (firstIndex !== -1) {
    content = content.substring(0, firstIndex) + replacement + content.substring(firstIndex + target.length);
    fs.writeFileSync('src/pages/Connections.tsx', content);
    console.log("Added publishOnly tag successfully.");
  }
} else {
  console.log("Could not find the target string.");
}
