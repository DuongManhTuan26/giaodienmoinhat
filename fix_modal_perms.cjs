const fs = require('fs');

let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

const regex = /<div className="bg-surface-container border border-outline-variant\/50 rounded-xl p-5 mb-8">\s*<h3 className="font-mono text-\[11px\] font-bold tracking-wider text-on-surface-variant uppercase mb-4">CÁC QUYỀN SẼ ĐƯỢC XIN<\/h3>\s*<div className="space-y-4">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<button \s*disabled=\{selectedPages\.length === 0\}/;

// Wait, the regex includes the selectedPages button, which is in Step 3!
