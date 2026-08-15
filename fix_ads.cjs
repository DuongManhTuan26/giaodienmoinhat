const fs = require('fs');
let content = fs.readFileSync('src/data/mockApi.ts', 'utf8');

const newAdChannels = `export const adChannels: any[] = [
  { id: 'fb_ads', name: 'Meta Ads', connected: true, statusText: 'Đã kết nối', statusColor: 'text-green-400', icon: 'campaign', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'campaign', name: 'ads_management', desc: 'Đọc và quản lý tài khoản quảng cáo, chiến dịch Meta Ads.' }
  ] },
  { id: 'gg_ads', name: 'Google Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'ads_click', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'ads_click', name: 'adwords', desc: 'Quản lý các chiến dịch Google Ads.' }
  ] },
  { id: 'tt_ads', name: 'TikTok Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'music_note', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'music_note', name: 'business_management', desc: 'Quản lý Business Center của TikTok Ads.' }
  ] },
  { id: 'li_ads', name: 'LinkedIn Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'work', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'analytics', name: 'r_ads & r_ads_reporting', desc: 'Đọc tài khoản quảng cáo và báo cáo phân tích.' },
    { icon: 'campaign', name: 'rw_ads & rw_conversions', desc: 'Quản lý chiến dịch, quảng cáo và Conversions API.' }
  ] },
  { id: 'pi_ads', name: 'Pinterest Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'push_pin', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'analytics', name: 'ads:read', desc: 'Đọc tài khoản quảng cáo và dữ liệu.' },
    { icon: 'campaign', name: 'ads:write', desc: 'Tạo và quản lý các chiến dịch quảng cáo.' }
  ] },
  { id: 'x_ads', name: 'X Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'close', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'campaign', name: 'ads.read & ads.write', desc: 'Quản lý tài khoản quảng cáo X.' }
  ] },
  { id: 'ai_ads', name: 'OpenAI Ads', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'smart_toy', connectionType: 'oauth_simple', requestedPermissions: [
    { icon: 'api', name: 'API Key', desc: 'Sử dụng API Key để tối ưu quảng cáo qua OpenAI.' }
  ] }
];

export const communicationChannels: any[] = [
  { id: 'sms', name: 'SMS (Twilio)', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'sms', connectionType: 'manual_credentials', requestedPermissions: [
    { icon: 'key', name: 'Account SID & Auth Token', desc: 'Kết nối với Twilio để gửi và nhận tin nhắn SMS.' }
  ] },
  { id: 'voice', name: 'Voice (Twilio)', connected: false, statusText: 'Kết nối', statusColor: '', icon: 'call', connectionType: 'manual_credentials', requestedPermissions: [
    { icon: 'key', name: 'Account SID & Auth Token', desc: 'Kết nối với Twilio để thực hiện gọi tự động và nhận cuộc gọi.' }
  ] }
];`;

const startIndex = content.indexOf('export const adChannels: any[] = [');
// End of file is fine for communicationChannels, wait, there might be something after?
// No, it's the end of mockApi.ts.
const endIndex = content.length;

if (startIndex !== -1) {
  content = content.substring(0, startIndex) + newAdChannels;
  fs.writeFileSync('src/data/mockApi.ts', content);
  console.log("Replaced adChannels and communicationChannels!");
}
