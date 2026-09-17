/**
 * Danh mục kênh có thể kết nối.
 *
 * Nội dung mô tả, cảnh báo và giải thích quyền được giữ nguyên từ bản thiết kế.
 * Phần bổ sung là năng lực THẬT, xác minh bằng lời gọi sống tới Zernio
 * ngày 17/08/2026:
 *
 *   platformKey — định danh dùng cho GET /connect/{platform}.
 *                    null nghĩa là kênh này chưa kết nối được qua hệ thống.
 *   canDm          — có gửi/nhận tin nhắn riêng không. Đây là điều kiện để
 *                    AI chạy trọn vòng bán hàng và chốt đơn.
 *   canComment     — có đọc và trả lời bình luận không.
 *   canPost        — có đăng bài được không.
 *
 * Vài điểm đã xác minh và dễ nhầm:
 *   - X phải gọi là "twitter"; gọi "x" bị Zernio từ chối.
 *   - TikTok không có cả tin nhắn lẫn bình luận, chỉ đăng bài.
 *   - Snapchat đang beta, Zernio trả 403.
 *   - Tài khoản quảng cáo (Meta Ads) KHÔNG kết nối riêng: nó là tài khoản con
 *     tự sinh ra khi kết nối Facebook có quyền quảng cáo.
 */

export interface PlatformPermission {
  icon: string;
  name: string;
  desc: string;
}

export interface PlatformChannel {
  id: string;
  name: string;
  icon: string;
  platformKey: string | null;
  canPost: boolean;
  canDm: boolean;
  canComment: boolean;
  capabilityNote?: string;
  connectionType: string;
  selectionLabel?: string;
  publishOnly?: boolean;
  warnings?: string[];
  instructions?: string[];
  requestedPermissions?: PlatformPermission[];
}

export const socialChannels: PlatformChannel[] = [
  { id: 'fb', name: 'Facebook', platformKey: "facebook", canPost: true, canDm: true, canComment: true, icon: 'facebook', connectionType: 'oauth_with_selection', selectionLabel: 'Trang', 
    warnings: ['Chỉ hỗ trợ kết nối với Trang (Fanpage), không hỗ trợ Trang cá nhân.'],
    instructions: ['Bấm nút bên dưới, một cửa sổ xác thực Facebook sẽ mở ra.', 'Cấp quyền truy cập cho tất cả các Trang mà bạn muốn quản lý.'],
    requestedPermissions: [
    { icon: 'list', name: 'pages_show_list', desc: 'Liệt kê các Trang bạn quản lý.' },
    { icon: 'edit', name: 'pages_manage_posts', desc: 'Tạo, chỉnh sửa và xóa bài viết trên Trang.' },
    { icon: 'analytics', name: 'pages_read_engagement & read_insights', desc: 'Đọc nội dung và phân tích dữ liệu (lượt xem, nhấp chuột, tương tác).' },
    { icon: 'forum', name: 'pages_manage_engagement & pages_read_user_content', desc: 'Đọc và trả lời bình luận trên bài viết.' },
    { icon: 'chat', name: 'pages_messaging', desc: 'Quản lý hội thoại Messenger trong hộp thư.' },
    { icon: 'settings', name: 'pages_manage_metadata & business_management', desc: 'Quản lý webhook và các Trang trong Business Manager.' }
  ] },
  { id: 'ig', name: 'Instagram', platformKey: "instagram", canPost: true, canDm: true, canComment: true, icon: 'photo_camera', connectionType: 'oauth_simple',
    warnings: ['Tài khoản Instagram của bạn BẮT BUỘC phải là Tài khoản Doanh nghiệp (Professional/Business/Creator).', 'Phải được liên kết với một Fanpage Facebook mà bạn có quyền quản trị.'],
    instructions: ['Bạn sẽ được chuyển sang Facebook để xác thực.', 'Chọn Fanpage Facebook có liên kết với tài khoản Instagram Doanh nghiệp của bạn.'],
    requestedPermissions: [
    { icon: 'person', name: 'instagram_business_basic', desc: 'Dữ liệu hồ sơ cơ bản và danh tính tài khoản.' },
    { icon: 'publish', name: 'instagram_business_content_publish', desc: 'Đăng bài viết, reels, stories và carousels.' },
    { icon: 'analytics', name: 'instagram_business_manage_insights', desc: 'Phân tích dữ liệu tài khoản và bài viết.' },
    { icon: 'forum', name: 'instagram_business_manage_comments', desc: 'Đọc và trả lời bình luận (bao gồm tính năng bình luận đầu tiên).' },
    { icon: 'chat', name: 'instagram_business_manage_messages', desc: 'Quản lý tin nhắn Instagram DMs trong hộp thư.' }
  ] },
  { id: 'tt', name: 'TikTok', platformKey: "tiktok", canPost: true, canDm: false, canComment: false, capabilityNote: "TikTok không mở API hộp thư: AI không đọc được tin nhắn hay bình luận. Chỉ dùng để đăng bài.", icon: 'music_note', connectionType: 'oauth_simple', publishOnly: true,
    warnings: ['API TikTok đang khóa hộp thư: Không hỗ trợ đọc/trả lời tin nhắn & bình luận trực tiếp.'],
    instructions: ['Đăng nhập bằng tài khoản TikTok của bạn.', 'Xác nhận để cấp quyền xuất bản video.'],
    requestedPermissions: [
    { icon: 'person', name: 'user.info.basic & user.info.profile', desc: 'Danh tính tài khoản (username, avatar, bio, verified status).' },
    { icon: 'analytics', name: 'user.info.stats & video.list', desc: 'Đọc dữ liệu phân tích (lượt theo dõi, thích, video).' },
    { icon: 'publish', name: 'video.publish', desc: 'Đăng trực tiếp video và ảnh.' },
    { icon: 'upload', name: 'video.upload', desc: 'Tải video lên hộp thư nháp của TikTok.' }
  ] },
  { id: 'yt', name: 'YouTube', platformKey: "youtube", canPost: true, canDm: false, canComment: true, capabilityNote: "Không có tin nhắn riêng, AI chỉ trả lời được bình luận.", icon: 'play_circle', connectionType: 'oauth_simple',
    instructions: ['Đăng nhập bằng tài khoản Google.', 'Chọn đúng kênh YouTube mà bạn muốn quản lý.'],
    requestedPermissions: [
    { icon: 'upload', name: 'youtube.upload', desc: 'Tải video lên kênh YouTube.' },
    { icon: 'settings', name: 'youtube', desc: 'Quản lý kênh: siêu dữ liệu video, playlist, hình thu nhỏ.' },
    { icon: 'forum', name: 'youtube.force-ssl', desc: 'Đọc và đăng bình luận.' },
    { icon: 'analytics', name: 'yt-analytics.readonly', desc: 'Đọc phân tích kênh và video.' }
  ] },
  { id: 'th', name: 'Threads', platformKey: "threads", canPost: true, canDm: false, canComment: true, capabilityNote: "Không có tin nhắn riêng, AI chỉ trả lời được bình luận.", icon: 'alternate_email', connectionType: 'oauth_simple',
    instructions: ['Sử dụng tài khoản Instagram của bạn để xác thực cấp quyền.'],
    requestedPermissions: [
    { icon: 'person', name: 'threads_basic', desc: 'Dữ liệu hồ sơ cơ bản của Threads.' },
    { icon: 'publish', name: 'threads_content_publish', desc: 'Đăng bài viết và luồng Threads.' },
    { icon: 'forum', name: 'threads_manage_replies', desc: 'Đọc và trả lời bài viết.' },
    { icon: 'analytics', name: 'threads_read_insights', desc: 'Đọc phân tích dữ liệu Threads.' }
  ] },
  { id: 'x', name: 'X (Twitter)', platformKey: "twitter", canPost: true, canDm: true, canComment: true, icon: 'close', connectionType: 'oauth_simple',
    warnings: ['Giới hạn của X API có thể ảnh hưởng đến số lượng bài đăng và tin nhắn mỗi ngày tùy gói của bạn.'],
    instructions: ['Xác thực với X để cho phép nền tảng gửi nội dung thay mặt bạn.'],
    requestedPermissions: [
    { icon: 'person', name: 'users.read', desc: 'Đọc thông tin hồ sơ người dùng.' },
    { icon: 'publish', name: 'tweet.read & tweet.write', desc: 'Đọc và đăng Tweet.' },
    { icon: 'chat', name: 'dm.read & dm.write', desc: 'Quản lý tin nhắn trực tiếp.' },
    { icon: 'settings', name: 'offline.access', desc: 'Duy trì kết nối liên tục.' }
  ] },
  { id: 'li', name: 'LinkedIn', platformKey: "linkedin", canPost: true, canDm: false, canComment: true, capabilityNote: "Không có tin nhắn riêng qua API.", icon: 'work', connectionType: 'oauth_with_selection', selectionLabel: 'Tổ chức hoặc Trang cá nhân',
    instructions: ['Đăng nhập LinkedIn bằng tài khoản cá nhân.', 'Sau khi đăng nhập thành công, bạn sẽ chọn có muốn dùng Tổ chức (Company Page) hay Trang cá nhân hay không.'],
    requestedPermissions: [
    { icon: 'person', name: 'openid, profile, email', desc: 'Danh tính tài khoản qua OpenID Connect.' },
    { icon: 'publish', name: 'w_organization_social & w_member_social', desc: 'Đăng bài và bình luận với tư cách cá nhân hoặc tổ chức.' },
    { icon: 'forum', name: 'r_organization_social & r_member_social', desc: 'Đọc bài viết và bình luận.' },
    { icon: 'analytics', name: 'r_organization_followers & r_member_postAnalytics', desc: 'Đọc phân tích dữ liệu và người theo dõi.' }
  ] },
  { id: 'pi', name: 'Pinterest', platformKey: "pinterest", canPost: true, canDm: false, canComment: false, capabilityNote: "Chỉ đăng bài, không có hộp thư.", icon: 'push_pin', connectionType: 'oauth_with_selection', selectionLabel: 'Bảng', publishOnly: true,
    warnings: ['Không hỗ trợ nhắn tin và bình luận qua API (Chỉ hỗ trợ đăng/ghim bài).'],
    instructions: ['Xác thực Pinterest.', 'Chọn Bảng (Board) mặc định để lưu các ghim do AI tạo ra.'],
    requestedPermissions: [
    { icon: 'folder', name: 'boards:read & boards:write', desc: 'Đọc và tạo các bảng (boards).' },
    { icon: 'push_pin', name: 'pins:read & pins:write', desc: 'Đọc, đăng các ghim (pins) và phân tích.' },
    { icon: 'person', name: 'user_accounts:read', desc: 'Danh tính và phân tích tài khoản.' }
  ] },
  { id: 're', name: 'Reddit', platformKey: "reddit", canPost: true, canDm: true, canComment: true, icon: 'forum', connectionType: 'oauth_with_selection', selectionLabel: 'Subreddit',
    warnings: ['Để quản lý và tương tác với Subreddit, bạn phải có quyền Moderator.'],
    instructions: ['Đăng nhập tài khoản Reddit.', 'Cấp quyền ứng dụng và lựa chọn Subreddit.'],
    requestedPermissions: [
    { icon: 'person', name: 'identity', desc: 'Xác minh danh tính tài khoản Reddit.' },
    { icon: 'publish', name: 'submit', desc: 'Đăng bài viết mới lên Subreddit.' },
    { icon: 'forum', name: 'read & edit & history', desc: 'Đọc, trả lời bình luận và lịch sử tương tác.' },
    { icon: 'chat', name: 'privatemessages', desc: 'Quản lý tin nhắn riêng tư.' }
  ] },
  { id: 'bs', name: 'Bluesky', platformKey: "bluesky", canPost: true, canDm: true, canComment: true, icon: 'cloud', connectionType: 'oauth_simple',
    warnings: ['Tuyệt đối KHÔNG DÙNG mật khẩu đăng nhập chính. API hộp thư không hỗ trợ đính kèm Media.'],
    instructions: ['Mở ứng dụng Bluesky > Cài đặt > Advanced > App Passwords.', 'Tạo một mật khẩu ứng dụng mới.', 'Nhập Handle (Tên người dùng) và Mật khẩu ứng dụng vừa tạo vào bước tiếp theo.'],
    requestedPermissions: [
    { icon: 'lock', name: 'App Password', desc: 'Đăng nhập thông qua mật khẩu ứng dụng (App Password) thay vì OAuth.' }
  ] },
  { id: 'sc', name: 'Snapchat', platformKey: null, canPost: true, canDm: false, canComment: false, capabilityNote: "Snapchat đang trong giai đoạn beta, chưa kết nối được.", icon: 'filter_vintage', connectionType: 'oauth_simple', publishOnly: true,
    warnings: ['Tài khoản bắt buộc phải là Hồ sơ Công khai (Public Profile).', 'Giới hạn API: Chỉ đăng tối đa 1 nội dung (ảnh hoặc video) mỗi bài.'],
    instructions: ['Cấp quyền truy cập vào Public Profile Snapchat của bạn.'],
    requestedPermissions: [
    { icon: 'public', name: 'snapchat-profile-api', desc: 'Quản lý Hồ sơ Công khai: đăng lên Spotlight và Stories, đọc dữ liệu và phân tích hồ sơ.' }
  ] },
  { id: 'wa', name: 'WhatsApp', platformKey: "whatsapp", canPost: true, canDm: true, canComment: false, capabilityNote: "Không có bình luận. Tin nhắn ngoài 24 giờ phải dùng mẫu đã duyệt.", icon: 'chat', connectionType: 'oauth_simple',
    warnings: ['Gửi tin nhắn tự động sau 24h kể từ khi khách hàng nhắn tin phải sử dụng Mẫu tin (Template) đã duyệt trước bởi Meta.'],
    instructions: ['Đảm bảo bạn có tài khoản WhatsApp Business.', 'Bạn sẽ được chuyển hướng sang giao diện thiết lập của Meta Business Suite.'],
    requestedPermissions: [
    { icon: 'chat', name: 'whatsapp_business_messaging', desc: 'Gửi và nhận tin nhắn, quản lý hội thoại khách hàng qua WhatsApp Business.' }
  ] },
  { id: 'tg', name: 'Telegram', platformKey: "telegram", canPost: true, canDm: true, canComment: false, capabilityNote: "Hoạt động qua bot, không có bình luận.", icon: 'send', connectionType: 'oauth_simple',
    warnings: ['Chỉ hỗ trợ kết nối Kênh (Channel) hoặc Nhóm (Group).', 'Bot của chúng tôi phải được thêm làm Quản trị viên (Admin).'],
    instructions: ['Thêm Bot Zernio làm quản trị viên trong kênh/nhóm Telegram của bạn.', 'Mở hộp thoại với Bot và gửi Mã truy cập được cấp.', 'Hệ thống sẽ tự động xác nhận và hoàn tất kết nối.'],
    requestedPermissions: [
    { icon: 'key', name: 'Zernio Bot', desc: 'Gửi mã Access Code cho Bot để ủy quyền kết nối.' }
  ] },
  { id: 'di', name: 'Discord', platformKey: "discord", canPost: true, canDm: false, canComment: false, capabilityNote: "Chỉ đăng bài.", icon: 'sports_esports', connectionType: 'oauth_simple',
    instructions: ['Cài đặt Zernio Bot vào Server (Guild) Discord của bạn.', 'Đảm bảo bạn có quyền Quản trị (Admin) trong Server.'],
    requestedPermissions: [
    { icon: 'sports_esports', name: 'bot', desc: 'Cài đặt Zernio bot vào máy chủ của bạn; mọi bài đăng đều qua bot.' },
    { icon: 'list', name: 'guilds', desc: 'Liệt kê các máy chủ bạn quản lý để chọn nơi đăng bài.' }
  ] },
  { id: 'sl', name: 'Slack', platformKey: "slack", canPost: true, canDm: true, canComment: false, capabilityNote: "Nhắn tin nội bộ, không phải kênh bán hàng cho khách.", icon: 'tag', connectionType: 'oauth_simple',
    instructions: ['Cấp quyền và thêm ứng dụng Zernio vào Workspace Slack của bạn.'],
    requestedPermissions: [
    { icon: 'chat', name: 'chat:write & chat:write.public', desc: 'Đăng tin nhắn với tư cách bot vào các kênh công cộng/riêng tư.' },
    { icon: 'forum', name: 'channels:history & im:history', desc: 'Nhận tin nhắn đến từ kênh hoặc tin nhắn trực tiếp.' },
    { icon: 'group', name: 'channels:read & team:read', desc: 'Đọc thông tin workspace và danh sách kênh.' }
  ] },
  { id: 'gb', name: 'Google Business', platformKey: "googlebusiness", canPost: true, canDm: false, canComment: false, capabilityNote: "Dùng cho hồ sơ doanh nghiệp và đánh giá.", icon: 'storefront', connectionType: 'oauth_with_selection', selectionLabel: 'Địa điểm',
    instructions: ['Xác thực bằng tài khoản Google đang quản lý Hồ sơ doanh nghiệp.', 'Hệ thống sẽ tải danh sách Địa điểm kinh doanh để bạn lựa chọn quản lý.'],
    requestedPermissions: [
    { icon: 'storefront', name: 'business.manage', desc: 'Quản lý địa điểm: bài đăng địa phương, đánh giá, Hỏi & Đáp và phân tích.' },
    { icon: 'person', name: 'userinfo.profile & userinfo.email', desc: 'Danh tính và email tài khoản khi kết nối.' }
  ] }
];

export const adChannels: PlatformChannel[] = [
  { id: 'fb_ads', name: 'Meta Ads', platformKey: null, canPost: false, canDm: false, canComment: false, capabilityNote: "Tự động có khi bạn kết nối Facebook. Không kết nối riêng.", icon: 'campaign', connectionType: 'oauth_simple',
    warnings: ['Chỉ hỗ trợ quyền quản lý quảng cáo. Nếu bạn muốn đăng nội dung thông thường, hãy kết nối ở mục Mạng xã hội.'],
    instructions: ['Đăng nhập và cấp quyền truy cập trình quản lý Meta Ads.'],
    requestedPermissions: [
    { icon: 'campaign', name: 'ads_management', desc: 'Đọc và quản lý tài khoản quảng cáo, chiến dịch Meta Ads.' }
  ] },
  { id: 'gg_ads', name: 'Google Ads', platformKey: null, canPost: false, canDm: false, canComment: false, capabilityNote: "Chưa hỗ trợ kết nối qua hệ thống.", icon: 'ads_click', connectionType: 'oauth_simple',
    instructions: ['Kết nối bằng tài khoản Google đang sở hữu tài khoản quảng cáo.'],
    requestedPermissions: [
    { icon: 'ads_click', name: 'adwords', desc: 'Quản lý các chiến dịch Google Ads.' }
  ] },
  { id: 'tt_ads', name: 'TikTok Ads', platformKey: null, canPost: false, canDm: false, canComment: false, capabilityNote: "Chưa hỗ trợ kết nối qua hệ thống.", icon: 'music_note', connectionType: 'oauth_simple',
    instructions: ['Đăng nhập bằng tài khoản quản lý TikTok Business Center.'],
    requestedPermissions: [
    { icon: 'music_note', name: 'business_management', desc: 'Quản lý Business Center của TikTok Ads.' }
  ] },
  { id: 'li_ads', name: 'LinkedIn Ads', platformKey: null, canPost: false, canDm: false, canComment: false, capabilityNote: "Chưa hỗ trợ kết nối qua hệ thống.", icon: 'work', connectionType: 'oauth_simple',
    instructions: ['Liên kết thông qua tài khoản quản trị Quảng cáo LinkedIn.'],
    requestedPermissions: [
    { icon: 'analytics', name: 'r_ads & r_ads_reporting', desc: 'Đọc tài khoản quảng cáo và báo cáo phân tích.' },
    { icon: 'campaign', name: 'rw_ads & rw_conversions', desc: 'Quản lý chiến dịch, quảng cáo và Conversions API.' }
  ] },
  { id: 'pi_ads', name: 'Pinterest Ads', platformKey: null, canPost: false, canDm: false, canComment: false, capabilityNote: "Chưa hỗ trợ kết nối qua hệ thống.", icon: 'push_pin', connectionType: 'oauth_simple',
    instructions: ['Đảm bảo tài khoản Pinterest đã được nâng cấp lên hạng Business.'],
    requestedPermissions: [
    { icon: 'analytics', name: 'ads:read', desc: 'Đọc tài khoản quảng cáo và dữ liệu.' },
    { icon: 'campaign', name: 'ads:write', desc: 'Tạo và quản lý các chiến dịch quảng cáo.' }
  ] },
  { id: 'x_ads', name: 'X Ads', platformKey: null, canPost: false, canDm: false, canComment: false, capabilityNote: "Chưa hỗ trợ kết nối qua hệ thống.", icon: 'close', connectionType: 'oauth_simple',
    instructions: ['Xác thực bằng X (Twitter) để lấy quyền Ads API.'],
    requestedPermissions: [
    { icon: 'campaign', name: 'ads.read & ads.write', desc: 'Quản lý tài khoản quảng cáo X.' }
  ] },
  { id: 'ai_ads', name: 'OpenAI Ads', platformKey: null, canPost: false, canDm: false, canComment: false, capabilityNote: "Chưa hỗ trợ kết nối qua hệ thống.", icon: 'smart_toy', connectionType: 'oauth_simple',
    warnings: ['Đây là kết nối API tối ưu quảng cáo tự động hóa, không phải mạng lưới phân phối quảng cáo tiêu chuẩn.'],
    instructions: ['Sử dụng API Key OpenAI chuyên dụng để kích hoạt module.'],
    requestedPermissions: [
    { icon: 'api', name: 'API Key', desc: 'Sử dụng API Key để tối ưu quảng cáo qua OpenAI.' }
  ] }
];

export const communicationChannels: PlatformChannel[] = [
  { id: 'sms', name: 'SMS (Twilio)', platformKey: null, canPost: false, canDm: true, canComment: false, capabilityNote: "Cần tài khoản Twilio riêng, chưa nối vào hệ thống.", icon: 'sms', connectionType: 'manual_credentials',
    warnings: ['Yêu cầu khai báo A2P 10DLC nếu bạn dùng đầu số Mỹ để gửi tin.'],
    instructions: ['Truy cập Console của Twilio.', 'Sao chép chuỗi Account SID và Auth Token.', 'Nhập vào ô ở màn hình tiếp theo.'],
    requestedPermissions: [
    { icon: 'key', name: 'Account SID & Auth Token', desc: 'Kết nối với Twilio để gửi và nhận tin nhắn SMS.' }
  ] },
  { id: 'voice', name: 'Voice (Twilio)', platformKey: null, canPost: false, canDm: false, canComment: false, capabilityNote: "Cần tài khoản Twilio riêng, chưa nối vào hệ thống.", icon: 'call', connectionType: 'manual_credentials',
    warnings: ['API hiện tại không hỗ trợ luồng IVR động phức tạp. Các thay đổi sâu hơn cần được cấu hình trực tiếp tại Twilio.'],
    instructions: ['Tương tự SMS, bạn cần Account SID và Auth Token từ trang Twilio Console để thiết lập.'],
    requestedPermissions: [
    { icon: 'key', name: 'Account SID & Auth Token', desc: 'Kết nối với Twilio để thực hiện gọi tự động và nhận cuộc gọi.' }
  ] }
];

export const allChannels: PlatformChannel[] = [
  ...socialChannels,
  ...adChannels,
  ...communicationChannels,
];

/** Tra kênh theo định danh Zernio, để gắn tài khoản đã kết nối vào đúng thẻ. */
export function channelByZernioPlatform(platform: string): PlatformChannel | undefined {
  return allChannels.find((channel) => channel.platformKey === platform);
}
