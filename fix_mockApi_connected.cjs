const fs = require('fs');
let content = fs.readFileSync('src/data/mockApi.ts', 'utf8');

const regexFbPerms = /permissions:\s*\[\s*\{\s*name:\s*"Đọc và trả lời tin nhắn",\s*granted:\s*true\s*\},[\s\S]*?\{\s*name:\s*"Chạy quảng cáo",\s*granted:\s*true\s*\}\s*\]/g;

const newFbPerms = `permissions: [
      { name: "Truy cập trang", granted: true },
      { name: "Đăng và quản lý bài", granted: true },
      { name: "Quản lý bình luận", granted: true },
      { name: "Đọc và trả lời tin nhắn", granted: true },
      { name: "Đọc dữ liệu phân tích", granted: true }
    ]`;

content = content.replace(regexFbPerms, newFbPerms);

const regexIgPerms = /permissions:\s*\[\s*\{\s*name:\s*"Đọc và trả lời tin nhắn",\s*granted:\s*false\s*\},[\s\S]*?\{\s*name:\s*"Chạy quảng cáo",\s*granted:\s*false\s*\}\s*\]/g;

const newIgPerms = `permissions: [
      { name: "Thông tin cá nhân", granted: true },
      { name: "Đăng bài và Reels", granted: true },
      { name: "Quản lý bình luận", granted: true },
      { name: "Đọc và trả lời tin nhắn (DMs)", granted: false },
      { name: "Dữ liệu phân tích", granted: true }
    ]`;

content = content.replace(regexIgPerms, newIgPerms);

// We also need to fix mockFacebookPages
const regexPageFbPerms = /permissions:\s*\[\s*\{\s*name:\s*"Đọc và trả lời tin nhắn",\s*granted:\s*(true|false)\s*\},[\s\S]*?\{\s*name:\s*"Chạy quảng cáo",\s*granted:\s*(true|false)\s*\}\s*\]/g;

content = content.replace(regexPageFbPerms, (match, p1, p2) => {
  if (match.includes('granted: false')) {
    return `permissions: [
      { name: "Truy cập trang", granted: false },
      { name: "Đăng và quản lý bài", granted: false },
      { name: "Quản lý bình luận", granted: false },
      { name: "Đọc và trả lời tin nhắn", granted: false },
      { name: "Đọc dữ liệu phân tích", granted: false }
    ]`;
  } else {
    // There is one with mixed: Thiếu quyền
    if (match.includes('Đọc và trả lời tin nhắn", granted: true') && match.includes('Chạy quảng cáo", granted: false')) {
      return `permissions: [
      { name: "Truy cập trang", granted: true },
      { name: "Đăng và quản lý bài", granted: true },
      { name: "Quản lý bình luận", granted: true },
      { name: "Đọc và trả lời tin nhắn", granted: false },
      { name: "Đọc dữ liệu phân tích", granted: true }
    ]`;
    }
    return newFbPerms;
  }
});

fs.writeFileSync('src/data/mockApi.ts', content);
console.log("Replaced connected accounts perms successfully.");
