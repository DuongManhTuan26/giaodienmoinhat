const fs = require('fs');
const content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

// 1. Before Row 2
const beforeRow2Regex = /^([\s\S]*?)(?=\s*\{\/\* Row 2: Connections Grid \*\/)/;
const beforeRow2Match = content.match(beforeRow2Regex);
const beforeRow2 = beforeRow2Match[1];

// 2. Row 2: Connections Grid
const row2Regex = /(\s*\{\/\* Row 2: Connections Grid \*\/\}[\s\S]*?)(?=\s*\{\/\* Available Channels Section \*\/)/;
const row2Match = content.match(row2Regex);
const row2 = row2Match[1];

// 3. Available Channels Section
const availableRegex = /(\s*\{\/\* Available Channels Section \*\/\}[\s\S]*?)(?=\s*\{\/\* Connect Modal \*\/)/;
const availableMatch = content.match(availableRegex);
let availableSection = availableMatch[1];

availableSection = availableSection.replace('className="mt-12 mb-8"', 'className="mb-12"');

// 4. Modal and end
const modalRegex = /(\s*\{\/\* Connect Modal \*\/[\s\S]*)$/;
const modalMatch = content.match(modalRegex);
const modalSection = modalMatch[1];

// Combine them
const newHeaderForAccounts = `
      {/* Connected Accounts Header */}
      <div className="mb-6 mt-12">
        <h2 className="text-2xl font-bold text-on-surface tracking-tight mb-2">Tài khoản đã kết nối</h2>
        <p className="text-sm font-medium text-on-surface-variant">Các tài khoản đang hoạt động và những trang thuộc về chúng</p>
      </div>`;

const newContent = beforeRow2 + availableSection + newHeaderForAccounts + row2 + modalSection;

fs.writeFileSync('src/pages/Connections.tsx', newContent);
console.log("Successfully reordered!");
