const fs = require('fs');
let content = fs.readFileSync('src/pages/Connections.tsx', 'utf-8');

// I need to clean up around line 490 and 560
// First, around line 490 (account header)
content = content.replace(
  /{clsx\("w-1.5 h-1.5 rounded-full", getStatusDot\(account.status\)\)}><\/span>\s*\{account.status\}\s*<\/span>\s*{\/\*\s*<span className="material-symbols-outlined text-\[20px\]">delete<\/span>\s*<\/button>/g,
  `{clsx("w-1.5 h-1.5 rounded-full", getStatusDot(account.status))}></span>
                  {account.status}
                </span>`
);

// Actually, let's just restore original state if possible, or manually fix the lines.
// It's safer to read line by line.
const lines = content.split('\n');
let newLines = [];
let skip = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<!--') || lines[i].includes('{/*') && lines[i+1]?.includes('delete')) {
    if (lines[i].match(/^\s*{\/\*\s*$/) || lines[i].match(/^\s*<!--\s*$/)) {
      // Skip this line and the next 2 lines
      i += 2;
      continue;
    }
  }
  newLines.push(lines[i]);
}

fs.writeFileSync('src/pages/Connections.tsx', newLines.join('\n'));
