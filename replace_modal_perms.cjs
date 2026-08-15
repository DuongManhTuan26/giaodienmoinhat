const fs = require('fs');
let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

const target = `<div className="bg-surface-container border border-outline-variant/50 rounded-xl p-5 mb-8">
                    <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-4">CÁC QUYỀN SẼ ĐƯỢC XIN</h3>
                    <div className="space-y-4">
                      <div className="flex gap-3">
                        <span className="material-symbols-outlined text-primary text-[20px]">api</span>
                        <div>
                          <div className="text-sm font-bold text-on-surface mb-0.5">Truy cập API {selectedPlatform.name}</div>
                          <div className="text-xs text-on-surface-variant">Để AI có thể giao tiếp với nền tảng này</div>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <span className="material-symbols-outlined text-primary text-[20px]">manage_accounts</span>
                        <div>
                          <div className="text-sm font-bold text-on-surface mb-0.5">Quản lý tài nguyên</div>
                          <div className="text-xs text-on-surface-variant">Cho phép app đọc và phản hồi dữ liệu</div>
                        </div>
                      </div>
                    </div>
                  </div>`;

const replacement = `<div className="bg-surface-container border border-outline-variant/50 rounded-xl p-5 mb-8">
                    <h3 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-4">CÁC QUYỀN SẼ ĐƯỢC XIN</h3>
                    <div className="space-y-4">
                      {(selectedPlatform.requestedPermissions || [
                        { icon: 'api', name: \`Truy cập API \${selectedPlatform.name}\`, desc: 'Cho phép Zernio kết nối và trao đổi dữ liệu với tài khoản của bạn.' },
                        { icon: 'manage_accounts', name: 'Quản lý tài nguyên', desc: 'Đọc thông tin, danh sách trang và thiết lập để AI có thể hoạt động.' }
                      ]).map((perm: any, idx: number) => (
                        <div key={idx} className="flex gap-3">
                          <span className="material-symbols-outlined text-primary text-[20px]">{perm.icon || 'api'}</span>
                          <div>
                            <div className="text-sm font-bold text-on-surface mb-0.5">{perm.name}</div>
                            <div className="text-xs text-on-surface-variant leading-relaxed">{perm.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync('src/pages/Connections.tsx', content);
  console.log("Replaced modal perms successfully.");
} else {
  console.log("Could not find the target string.");
}
