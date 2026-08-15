const fs = require('fs');

let content = fs.readFileSync('src/data/mockApi.ts', 'utf8');

// Replace socialChannels
const oldSocial = /export const socialChannels = \[[\s\S]*?\];/;
const newSocial = `export const socialChannels = [
  { id: 'fb', name: 'Facebook', connected: true, statusText: 'Đã kết nối', statusColor: 'text-green-400', icon: 'facebook', connectionType: 'oauth_with_selection', selectionLabel: 'Trang' },
  { id: 'ig', name: 'Instagram', connected: true, statusText: 'Đã kết nối', statusColor: 'text-green-400', icon: 'photo_camera', connectionType: 'oauth_simple' },
  { id: 'tt', name: 'TikTok', connected: false, statusText: 'Kết nối', statusColor: 'text-primary', icon: 'music_note', connectionType: 'oauth_simple' },
  { id: 'yt', name: 'YouTube', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'play_circle', connectionType: 'oauth_simple' },
  { id: 'th', name: 'Threads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'alternate_email', connectionType: 'oauth_simple' },
  { id: 'x', name: 'X (Twitter)', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'close', connectionType: 'oauth_simple' },
  { id: 'li', name: 'LinkedIn', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'work', connectionType: 'oauth_with_selection', selectionLabel: 'Tổ chức hoặc Trang cá nhân' },
  { id: 'pi', name: 'Pinterest', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'push_pin', connectionType: 'oauth_with_selection', selectionLabel: 'Bảng' },
  { id: 're', name: 'Reddit', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'forum', connectionType: 'oauth_simple' },
  { id: 'bs', name: 'Bluesky', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'cloud', connectionType: 'manual_credentials' },
  { id: 'sc', name: 'Snapchat', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'filter_vintage', connectionType: 'oauth_with_selection', selectionLabel: 'Hồ sơ công khai' },
  { id: 'wa', name: 'WhatsApp', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'chat', connectionType: 'oauth_with_selection', selectionLabel: 'Số điện thoại' },
  { id: 'tg', name: 'Telegram', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'send', connectionType: 'access_code' },
  { id: 'di', name: 'Discord', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'sports_esports', connectionType: 'oauth_simple' },
  { id: 'sl', name: 'Slack', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'tag', connectionType: 'oauth_simple' },
  { id: 'gb', name: 'Google Business', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'storefront', connectionType: 'oauth_with_selection', selectionLabel: 'Địa điểm' }
];`;
content = content.replace(oldSocial, newSocial);

// Replace adChannels
const oldAds = /export const adChannels = \[[\s\S]*?\];/;
const newAds = `export const adChannels = [
  { id: 'fb_ads', name: 'Meta Ads', connected: true, statusText: 'Đã kết nối', statusColor: 'text-green-400', icon: 'campaign', connectionType: 'oauth_simple' },
  { id: 'gg_ads', name: 'Google Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'ads_click', connectionType: 'oauth_simple' },
  { id: 'tt_ads', name: 'TikTok Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'music_note', connectionType: 'oauth_simple' },
  { id: 'li_ads', name: 'LinkedIn Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'work', connectionType: 'oauth_simple' },
  { id: 'pi_ads', name: 'Pinterest Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'push_pin', connectionType: 'oauth_simple' },
  { id: 'x_ads', name: 'X Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'close', connectionType: 'oauth_simple' },
  { id: 'ai_ads', name: 'OpenAI Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'smart_toy', connectionType: 'oauth_simple' }
];`;
content = content.replace(oldAds, newAds);

// Replace communicationChannels
const oldComm = /export const communicationChannels = \[[\s\S]*?\];/;
const newComm = `export const communicationChannels = [
  { id: 'phone', name: 'Số điện thoại', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'call', connectionType: 'oauth_with_selection', selectionLabel: 'Số điện thoại' },
  { id: 'sms', name: 'Tin nhắn SMS', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'sms', connectionType: 'oauth_simple' },
  { id: 'voice', name: 'Cuộc gọi thoại', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'record_voice_over', connectionType: 'oauth_simple' }
];`;
content = content.replace(oldComm, newComm);

fs.writeFileSync('src/data/mockApi.ts', content);
