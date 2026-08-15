const fs = require('fs');

let content = fs.readFileSync('src/data/mockApi.ts', 'utf8');

// The array starts at `export const socialChannels: any[] = [`
// We can just use a regex to replace the entire `socialChannels` array
const socialChannelsArray = `export const socialChannels: any[] = [
  { id: 'fb', name: 'Facebook', connected: true, statusText: 'Đã kết nối', statusColor: 'text-green-400', icon: 'facebook', connectionType: 'oauth_with_selection', selectionLabel: 'Trang', requestedPermissions: [
    { icon: 'view_list', name: 'Truy cập trang', desc: 'Cho phép đọc thông tin và nội dung trên Trang.' },
    { icon: 'edit_document', name: 'Đăng và quản lý bài', desc: 'Cho phép AI tự động đăng bài, chỉnh sửa bài viết.' },
    { icon: 'forum', name: 'Quản lý bình luận', desc: 'Cho phép AI đọc và trả lời bình luận.' },
    { icon: 'chat', name: 'Đọc và trả lời tin nhắn', desc: 'Cho phép AI tư vấn và chốt đơn qua Messenger.' },
    { icon: 'analytics', name: 'Đọc dữ liệu phân tích', desc: 'Thu thập lượt xem, tương tác để báo cáo.' }
  ] },
  { id: 'ig', name: 'Instagram', connected: true, statusText: 'Đã kết nối', statusColor: 'text-green-400', icon: 'photo_camera', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'account_circle', name: 'Thông tin cá nhân', desc: 'Truy cập thông tin cơ bản của tài khoản Instagram.' },
    { icon: 'add_photo_alternate', name: 'Đăng bài và Reels', desc: 'Cho phép xuất bản hình ảnh, video ngắn và Story.' },
    { icon: 'forum', name: 'Quản lý bình luận', desc: 'Đọc và trả lời bình luận trên bài đăng.' },
    { icon: 'chat', name: 'Đọc và trả lời tin nhắn (DMs)', desc: 'Cho phép AI trò chuyện qua tin nhắn trực tiếp.' },
    { icon: 'analytics', name: 'Dữ liệu phân tích', desc: 'Lấy các chỉ số tương tác của tài khoản.' }
  ] },
  { id: 'tt', name: 'TikTok', connected: false, statusText: 'Kết nối', statusColor: 'text-primary', icon: 'music_note', connectionType: 'oauth_simple', publishOnly: true, requestedPermissions: [
    { icon: 'account_circle', name: 'Truy cập hồ sơ', desc: 'Đọc thông tin cơ bản của kênh TikTok.' },
    { icon: 'movie', name: 'Đăng tải video', desc: 'Cho phép xuất bản trực tiếp video lên kênh TikTok.' },
    { icon: 'analytics', name: 'Dữ liệu phân tích', desc: 'Đọc lượt xem, lượt thả tim của video.' }
  ] },
  { id: 'yt', name: 'YouTube', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'play_circle', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'video_call', name: 'Tải lên Video', desc: 'Cho phép đăng tải video mới lên kênh.' },
    { icon: 'forum', name: 'Quản lý bình luận', desc: 'Đọc và trả lời bình luận của người xem.' },
    { icon: 'analytics', name: 'Dữ liệu phân tích', desc: 'Thu thập hiệu suất của kênh và video.' }
  ] },
  { id: 'th', name: 'Threads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'alternate_email', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'edit_document', name: 'Đăng bài', desc: 'Cho phép xuất bản luồng bài đăng mới trên Threads.' },
    { icon: 'forum', name: 'Đọc và trả lời', desc: 'Cho phép đọc và trả lời các bài viết.' }
  ] },
  { id: 'x', name: 'X (Twitter)', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'close', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'edit_document', name: 'Đăng Tweet', desc: 'Cho phép AI đăng các tweet và luồng tweet mới.' },
    { icon: 'forum', name: 'Đọc Tweet và Trả lời', desc: 'Đọc tweet, lượt thích và tự động trả lời.' },
    { icon: 'chat', name: 'Tin nhắn trực tiếp', desc: 'Cho phép gửi và nhận tin nhắn trực tiếp.' }
  ] },
  { id: 'li', name: 'LinkedIn', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'work', connectionType: 'oauth_with_selection', selectionLabel: 'Tổ chức hoặc Trang cá nhân', requestedPermissions: [
    { icon: 'account_circle', name: 'Thông tin hồ sơ', desc: 'Truy cập dữ liệu cơ bản của tổ chức hoặc cá nhân.' },
    { icon: 'edit_document', name: 'Đăng bài', desc: 'Cho phép AI đăng bài với tư cách doanh nghiệp hoặc cá nhân.' },
    { icon: 'forum', name: 'Đọc bài và bình luận', desc: 'Truy cập vào các bài đăng và bình luận trên trang.' }
  ] },
  { id: 'pi', name: 'Pinterest', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'push_pin', connectionType: 'oauth_with_selection', selectionLabel: 'Bảng', publishOnly: true, requestedPermissions: [
    { icon: 'push_pin', name: 'Tạo Ghim (Pins)', desc: 'Cho phép tự động đăng ảnh/video dưới dạng Ghim.' },
    { icon: 'dashboard', name: 'Quản lý Bảng', desc: 'Tạo và sắp xếp các bảng (boards) trên Pinterest.' }
  ] },
  { id: 're', name: 'Reddit', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'forum', connectionType: 'oauth_with_selection', selectionLabel: 'Subreddit', requestedPermissions: [
    { icon: 'edit_document', name: 'Đăng bài', desc: 'Đăng bài lên các Subreddit.' },
    { icon: 'forum', name: 'Quản lý bình luận', desc: 'Đọc và trả lời bình luận trong Subreddit.' }
  ] },
  { id: 'bs', name: 'Bluesky', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'cloud', connectionType: 'manual_credentials', requestedPermissions: [
    { icon: 'edit_document', name: 'Đăng bài', desc: 'Cho phép xuất bản bài viết mới.' },
    { icon: 'forum', name: 'Đọc và trả lời', desc: 'Cho phép tương tác, trả lời bài viết của người khác.' }
  ] },
  { id: 'sc', name: 'Snapchat', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'filter_vintage', connectionType: 'oauth_with_selection', selectionLabel: 'Hồ sơ công khai', publishOnly: true, requestedPermissions: [
    { icon: 'public', name: 'Quản lý Hồ sơ', desc: 'Cho phép đăng bài lên Spotlight và Stories của Snapchat.' }
  ] },
  { id: 'wa', name: 'WhatsApp', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'chat', connectionType: 'oauth_with_selection', selectionLabel: 'Số điện thoại', requestedPermissions: [
    { icon: 'chat', name: 'Gắn kết tin nhắn', desc: 'Giao tiếp 2 chiều với khách hàng qua WhatsApp.' }
  ] },
  { id: 'tg', name: 'Telegram', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'send', connectionType: 'access_code', requestedPermissions: [
    { icon: 'chat', name: 'Quản lý Bot', desc: 'Cho phép Bot gửi và nhận tin nhắn trên Telegram.' }
  ] },
  { id: 'di', name: 'Discord', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'sports_esports', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'sports_esports', name: 'Cài đặt Bot', desc: 'Cài đặt AI Bot vào máy chủ (Guild) của bạn.' },
    { icon: 'chat', name: 'Gửi tin nhắn', desc: 'Cho phép Bot đăng thông báo vào các kênh.' }
  ] },
  { id: 'sl', name: 'Slack', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'tag', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'chat', name: 'Đăng tin nhắn', desc: 'Gửi tin nhắn vào các kênh công khai.' },
    { icon: 'forum', name: 'Nhận tin nhắn', desc: 'Nhận tin nhắn đến hộp thư để phản hồi.' }
  ] },
  { id: 'gb', name: 'Google Business', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'storefront', connectionType: 'oauth_with_selection', selectionLabel: 'Địa điểm', requestedPermissions: [
    { icon: 'storefront', name: 'Quản lý Địa điểm', desc: 'Cho phép đăng bài nội bộ, trả lời đánh giá và câu hỏi.' }
  ] }
];`;

const startIndex = content.indexOf('export const socialChannels: any[] = [');
const endIndex = content.indexOf('export const adChannels: any[] = [');

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + socialChannelsArray + '\n\n' + content.substring(endIndex);
  fs.writeFileSync('src/data/mockApi.ts', content);
  console.log("Replaced socialChannels correctly.");
} else {
  console.log("Could not find boundaries.");
}
