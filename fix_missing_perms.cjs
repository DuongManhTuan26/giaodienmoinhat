const fs = require('fs');
let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

const target = `                        if (perm.name === "Đọc và trả lời tin nhắn") missingText = "Thiếu quyền này, AI không tư vấn và chốt đơn qua tin nhắn được.";
                        else if (perm.name === "Đọc và trả lời bình luận") missingText = "Thiếu quyền này, AI không trả lời bình luận khách được.";
                        else if (perm.name === "Đăng bài lên trang") missingText = "Thiếu quyền này, AI không đăng bài tự động được.";
                        else if (perm.name === "Chạy quảng cáo") missingText = "Thiếu quyền này, bạn không chạy được quảng cáo trong app.";`;

const replacement = `                        if (perm.name.includes("tin nhắn")) missingText = "Thiếu quyền này, AI không tư vấn và chốt đơn qua tin nhắn được.";
                        else if (perm.name.includes("bình luận") || perm.name.includes("Đọc và trả lời")) missingText = "Thiếu quyền này, AI không trả lời khách được.";
                        else if (perm.name.includes("Đăng")) missingText = "Thiếu quyền này, AI không đăng bài tự động được.";
                        else missingText = "Thiếu quyền này, một số tính năng sẽ bị giới hạn.";`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync('src/pages/Connections.tsx', content);
  console.log("Replaced missing perms text.");
} else {
  console.log("Could not find the target to replace.");
}
