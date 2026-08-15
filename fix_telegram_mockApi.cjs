const fs = require('fs');
let content = fs.readFileSync('src/data/mockApi.ts', 'utf8');

const oldTg = `{ id: 'tg', name: 'Telegram', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'send', connectionType: 'access_code',
    warnings: ['Zernio quản lý Telegram qua Bot, bạn không thể liên kết tài khoản nhắn tin cá nhân thông thường.'],
    instructions: ['Vào ứng dụng Telegram, tìm kiếm <b>@BotFather</b>.', 'Gõ lệnh <code>/newbot</code> để tạo Bot mới.', 'Sao chép đoạn mã <b>Bot Token</b> mà BotFather cung cấp để nhập ở bước sau.'],
    requestedPermissions: [
    { icon: 'key', name: 'Bot Token', desc: 'Kết nối thông qua chuỗi Bot Token (Access Code) từ BotFather.' }
  ] }`;

const newTg = `{ id: 'tg', name: 'Telegram', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'send', connectionType: 'access_code',
    warnings: ['Chỉ hỗ trợ kết nối Kênh (Channel) hoặc Nhóm (Group).', 'Bot của chúng tôi phải được thêm làm Quản trị viên (Admin).'],
    instructions: ['Thêm Bot Zernio làm quản trị viên trong kênh/nhóm Telegram của bạn.', 'Mở hộp thoại với Bot và gửi Mã truy cập được cấp.', 'Hệ thống sẽ tự động xác nhận và hoàn tất kết nối.'],
    requestedPermissions: [
    { icon: 'key', name: 'Zernio Bot', desc: 'Gửi mã Access Code cho Bot để ủy quyền kết nối.' }
  ] }`;

content = content.replace(oldTg, newTg);
fs.writeFileSync('src/data/mockApi.ts', content);
console.log("Fixed Telegram instructions!");
