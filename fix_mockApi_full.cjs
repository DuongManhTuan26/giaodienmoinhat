const fs = require('fs');
let content = fs.readFileSync('src/data/mockApi.ts', 'utf8');

// I will just find `export const mockConnections` and rebuild mockConnections and connectedAccounts from scratch, replacing the broken section.
const startIndex = content.indexOf('export const mockConnections = [');
const endIndex = content.indexOf('export const mockSubPagesToSelect = [');

const newMockConnections = `export const mockConnections = [
  {
    id: "page-1",
    name: "Fanpage A",
    status: "Đang hoạt động",
    connectedDate: "10/08/2026",
    expiryDate: "09/10/2026",
    daysLeft: 56,
    messagesProcessed: "1.240",
    commentsReplied: "3.580",
    permissions: [
      { name: "Truy cập trang", granted: true },
      { name: "Đăng và quản lý bài", granted: true },
      { name: "Quản lý bình luận", granted: true },
      { name: "Đọc và trả lời tin nhắn", granted: true },
      { name: "Đọc dữ liệu phân tích", granted: true }
    ]
  },
  {
    id: "page-2",
    name: "Fanpage B",
    status: "Sắp hết hạn",
    connectedDate: "05/06/2026",
    expiryDate: "19/08/2026",
    daysLeft: 5,
    messagesProcessed: "4.500",
    commentsReplied: "12.050",
    permissions: [
      { name: "Truy cập trang", granted: true },
      { name: "Đăng và quản lý bài", granted: true },
      { name: "Quản lý bình luận", granted: true },
      { name: "Đọc và trả lời tin nhắn", granted: true },
      { name: "Đọc dữ liệu phân tích", granted: true }
    ]
  },
  {
    id: "page-3",
    name: "Fanpage C",
    status: "Mất kết nối",
    connectedDate: "12/01/2026",
    expiryDate: "12/07/2026",
    daysLeft: 0,
    messagesProcessed: "8.900",
    commentsReplied: "21.400",
    permissions: [
      { name: "Truy cập trang", granted: false },
      { name: "Đăng và quản lý bài", granted: false },
      { name: "Quản lý bình luận", granted: false },
      { name: "Đọc và trả lời tin nhắn", granted: false },
      { name: "Đọc dữ liệu phân tích", granted: false }
    ]
  },
  {
    id: "page-4",
    name: "Fanpage D",
    status: "Thiếu quyền",
    connectedDate: "14/08/2026",
    expiryDate: "14/10/2026",
    daysLeft: 60,
    messagesProcessed: "150",
    commentsReplied: "320",
    permissions: [
      { name: "Truy cập trang", granted: true },
      { name: "Đăng và quản lý bài", granted: true },
      { name: "Quản lý bình luận", granted: true },
      { name: "Đọc và trả lời tin nhắn", granted: false },
      { name: "Đọc dữ liệu phân tích", granted: true }
    ]
  }
];

export const connectedAccounts = [
  {
    id: "fb_acc_1",
    platformId: "fb",
    platformName: "Facebook",
    platformIcon: "facebook",
    accountName: "Hoàng Tuấn",
    connectionDate: "10/08/2026",
    expiryDate: "09/10/2026",
    status: "Đang hoạt động",
    permissions: [
      { name: "Truy cập trang", granted: true },
      { name: "Đăng và quản lý bài", granted: true },
      { name: "Quản lý bình luận", granted: true },
      { name: "Đọc và trả lời tin nhắn", granted: true },
      { name: "Đọc dữ liệu phân tích", granted: true }
    ],
    pages: [
      {
        id: "page-1",
        name: "Fanpage A",
        status: "Đang hoạt động",
        avatar: "https://i.pravatar.cc/150?u=a042581f4e29026704d",
        messagesProcessed: "1.240",
        commentsReplied: "3.580"
      },
      {
        id: "page-2",
        name: "Fanpage B",
        status: "Sắp hết hạn",
        avatar: "https://i.pravatar.cc/150?u=a042581f4e29026024d",
        messagesProcessed: "4.500",
        commentsReplied: "12.050"
      }
    ]
  },
  {
    id: "ig_acc_1",
    platformId: "ig",
    platformName: "Instagram",
    platformIcon: "photo_camera",
    accountName: "Hoàng Tuấn",
    connectionDate: "12/01/2026",
    expiryDate: "12/07/2026",
    status: "Mất kết nối",
    permissions: [
      { name: "Thông tin cá nhân", granted: true },
      { name: "Đăng bài và Reels", granted: true },
      { name: "Quản lý bình luận", granted: true },
      { name: "Đọc và trả lời tin nhắn (DMs)", granted: false },
      { name: "Dữ liệu phân tích", granted: true }
    ],
    pages: [
      {
        id: "page-3",
        name: "Fanpage C",
        status: "Mất kết nối",
        avatar: "https://i.pravatar.cc/150?u=a042581f4e29026702d",
        messagesProcessed: "8.900",
        commentsReplied: "21.400"
      }
    ]
  }
];

`;

content = content.substring(0, startIndex) + newMockConnections + content.substring(endIndex);
fs.writeFileSync('src/data/mockApi.ts', content);
console.log("Restored mockConnections and connectedAccounts.");

