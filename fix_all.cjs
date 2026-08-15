const fs = require('fs');
let content = fs.readFileSync('src/data/mockApi.ts', 'utf8');

const newSocialChannels = `export const socialChannels: any[] = [
  { id: 'fb', name: 'Facebook', connected: true, statusText: 'Đã kết nối', statusColor: 'text-green-400', icon: 'facebook', connectionType: 'oauth_with_selection', selectionLabel: 'Trang', requestedPermissions: [
    { icon: 'list', name: 'pages_show_list', desc: 'Liệt kê các Trang bạn quản lý.' },
    { icon: 'edit', name: 'pages_manage_posts', desc: 'Tạo, chỉnh sửa và xóa bài viết trên Trang.' },
    { icon: 'analytics', name: 'pages_read_engagement & read_insights', desc: 'Đọc nội dung và phân tích dữ liệu (lượt xem, nhấp chuột, tương tác).' },
    { icon: 'forum', name: 'pages_manage_engagement & pages_read_user_content', desc: 'Đọc và trả lời bình luận trên bài viết.' },
    { icon: 'chat', name: 'pages_messaging', desc: 'Quản lý hội thoại Messenger trong hộp thư.' },
    { icon: 'settings', name: 'pages_manage_metadata & business_management', desc: 'Quản lý webhook và các Trang trong Business Manager.' }
  ] },
  { id: 'ig', name: 'Instagram', connected: true, statusText: 'Đã kết nối', statusColor: 'text-green-400', icon: 'photo_camera', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'person', name: 'instagram_business_basic', desc: 'Dữ liệu hồ sơ cơ bản và danh tính tài khoản.' },
    { icon: 'publish', name: 'instagram_business_content_publish', desc: 'Đăng bài viết, reels, stories và carousels.' },
    { icon: 'analytics', name: 'instagram_business_manage_insights', desc: 'Phân tích dữ liệu tài khoản và bài viết.' },
    { icon: 'forum', name: 'instagram_business_manage_comments', desc: 'Đọc và trả lời bình luận (bao gồm tính năng bình luận đầu tiên).' },
    { icon: 'chat', name: 'instagram_business_manage_messages', desc: 'Quản lý tin nhắn Instagram DMs trong hộp thư.' }
  ] },
  { id: 'tt', name: 'TikTok', connected: false, statusText: 'Kết nối', statusColor: 'text-primary', icon: 'music_note', connectionType: 'oauth_simple', publishOnly: true, requestedPermissions: [
    { icon: 'person', name: 'user.info.basic & user.info.profile', desc: 'Danh tính tài khoản (username, avatar, bio, verified status).' },
    { icon: 'analytics', name: 'user.info.stats & video.list', desc: 'Đọc dữ liệu phân tích (lượt theo dõi, thích, video).' },
    { icon: 'publish', name: 'video.publish', desc: 'Đăng trực tiếp video và ảnh.' },
    { icon: 'upload', name: 'video.upload', desc: 'Tải video lên hộp thư nháp của TikTok.' }
  ] },
  { id: 'yt', name: 'YouTube', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'play_circle', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'upload', name: 'youtube.upload', desc: 'Tải video lên kênh YouTube.' },
    { icon: 'settings', name: 'youtube', desc: 'Quản lý kênh: siêu dữ liệu video, playlist, hình thu nhỏ.' },
    { icon: 'forum', name: 'youtube.force-ssl', desc: 'Đọc và đăng bình luận.' },
    { icon: 'analytics', name: 'yt-analytics.readonly', desc: 'Đọc phân tích kênh và video.' }
  ] },
  { id: 'th', name: 'Threads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'alternate_email', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'person', name: 'threads_basic', desc: 'Dữ liệu hồ sơ cơ bản của Threads.' },
    { icon: 'publish', name: 'threads_content_publish', desc: 'Đăng bài viết và luồng Threads.' },
    { icon: 'forum', name: 'threads_manage_replies', desc: 'Đọc và trả lời bài viết.' },
    { icon: 'analytics', name: 'threads_read_insights', desc: 'Đọc phân tích dữ liệu Threads.' }
  ] },
  { id: 'x', name: 'X (Twitter)', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'close', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'person', name: 'users.read', desc: 'Đọc thông tin hồ sơ người dùng.' },
    { icon: 'publish', name: 'tweet.read & tweet.write', desc: 'Đọc và đăng Tweet.' },
    { icon: 'chat', name: 'dm.read & dm.write', desc: 'Quản lý tin nhắn trực tiếp.' },
    { icon: 'settings', name: 'offline.access', desc: 'Duy trì kết nối liên tục.' }
  ] },
  { id: 'li', name: 'LinkedIn', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'work', connectionType: 'oauth_with_selection', selectionLabel: 'Tổ chức hoặc Trang cá nhân', requestedPermissions: [
    { icon: 'person', name: 'openid, profile, email', desc: 'Danh tính tài khoản qua OpenID Connect.' },
    { icon: 'publish', name: 'w_organization_social & w_member_social', desc: 'Đăng bài và bình luận với tư cách cá nhân hoặc tổ chức.' },
    { icon: 'forum', name: 'r_organization_social & r_member_social', desc: 'Đọc bài viết và bình luận.' },
    { icon: 'analytics', name: 'r_organization_followers & r_member_postAnalytics', desc: 'Đọc phân tích dữ liệu và người theo dõi.' }
  ] },
  { id: 'pi', name: 'Pinterest', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'push_pin', connectionType: 'oauth_with_selection', selectionLabel: 'Bảng', publishOnly: true, requestedPermissions: [
    { icon: 'folder', name: 'boards:read & boards:write', desc: 'Đọc và tạo các bảng (boards).' },
    { icon: 'push_pin', name: 'pins:read & pins:write', desc: 'Đọc, đăng các ghim (pins) và phân tích.' },
    { icon: 'person', name: 'user_accounts:read', desc: 'Danh tính và phân tích tài khoản.' }
  ] },
  { id: 're', name: 'Reddit', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'forum', connectionType: 'oauth_with_selection', selectionLabel: 'Subreddit', requestedPermissions: [
    { icon: 'person', name: 'identity', desc: 'Xác minh danh tính tài khoản Reddit.' },
    { icon: 'publish', name: 'submit', desc: 'Đăng bài viết mới lên Subreddit.' },
    { icon: 'forum', name: 'read & edit & history', desc: 'Đọc, trả lời bình luận và lịch sử tương tác.' },
    { icon: 'chat', name: 'privatemessages', desc: 'Quản lý tin nhắn riêng tư.' }
  ] },
  { id: 'bs', name: 'Bluesky', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'cloud', connectionType: 'manual_credentials', requestedPermissions: [
    { icon: 'lock', name: 'App Password', desc: 'Đăng nhập thông qua mật khẩu ứng dụng (App Password) thay vì OAuth.' }
  ] },
  { id: 'sc', name: 'Snapchat', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'filter_vintage', connectionType: 'oauth_simple', publishOnly: true, requestedPermissions: [
    { icon: 'public', name: 'snapchat-profile-api', desc: 'Quản lý Hồ sơ Công khai: đăng lên Spotlight và Stories, đọc dữ liệu và phân tích hồ sơ.' }
  ] },
  { id: 'wa', name: 'WhatsApp', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'chat', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'chat', name: 'whatsapp_business_messaging', desc: 'Gửi và nhận tin nhắn, quản lý hội thoại khách hàng qua WhatsApp Business.' }
  ] },
  { id: 'tg', name: 'Telegram', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'send', connectionType: 'access_code', requestedPermissions: [
    { icon: 'key', name: 'Bot Token', desc: 'Kết nối thông qua chuỗi Bot Token (Access Code) từ BotFather.' }
  ] },
  { id: 'di', name: 'Discord', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'sports_esports', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'sports_esports', name: 'bot', desc: 'Cài đặt Zernio bot vào máy chủ của bạn; mọi bài đăng đều qua bot.' },
    { icon: 'list', name: 'guilds', desc: 'Liệt kê các máy chủ bạn quản lý để chọn nơi đăng bài.' }
  ] },
  { id: 'sl', name: 'Slack', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'tag', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'chat', name: 'chat:write & chat:write.public', desc: 'Đăng tin nhắn với tư cách bot vào các kênh công cộng/riêng tư.' },
    { icon: 'forum', name: 'channels:history & im:history', desc: 'Nhận tin nhắn đến từ kênh hoặc tin nhắn trực tiếp.' },
    { icon: 'group', name: 'channels:read & team:read', desc: 'Đọc thông tin workspace và danh sách kênh.' }
  ] },
  { id: 'gb', name: 'Google Business', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'storefront', connectionType: 'oauth_with_selection', selectionLabel: 'Địa điểm', requestedPermissions: [
    { icon: 'storefront', name: 'business.manage', desc: 'Quản lý địa điểm: bài đăng địa phương, đánh giá, Hỏi & Đáp và phân tích.' },
    { icon: 'person', name: 'userinfo.profile & userinfo.email', desc: 'Danh tính và email tài khoản khi kết nối.' }
  ] }
];`;

const startIndex = content.indexOf('export const socialChannels: any[] = [');
const endIndex = content.indexOf('export const adChannels: any[] = [');

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + newSocialChannels + '\n\n' + content.substring(endIndex);
  fs.writeFileSync('src/data/mockApi.ts', content);
  console.log("Replaced socialChannels with accurate scopes!");
}
