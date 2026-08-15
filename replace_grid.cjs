const fs = require('fs');

let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

const regexGrid = /\{mockConnections\.map\(page => \([\s\S]*?\{\/\* Add New Page Card \*\/\}/;

const newGrid = `{connectedAccounts.map(account => (
          <div key={account.id} className="bg-surface-container/30 border border-outline-variant rounded-2xl p-6 flex flex-col hover:border-primary/30 transition-colors group relative overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between mb-6 pb-6 border-b border-outline-variant/50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-surface-variant rounded-full flex items-center justify-center shrink-0 border border-outline-variant/50 group-hover:scale-105 transition-transform">
                  <span className="material-symbols-outlined text-on-surface-variant text-[24px]">{account.platformIcon}</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-on-surface mb-1.5">{account.platformName} — {account.accountName}</h3>
                  <p className="text-sm text-on-surface-variant font-medium mb-2">Đang quản lý {account.pages.length} trang · Kết nối ngày {account.connectionDate}</p>
                  <span className={clsx("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border", getStatusColor(account.status))}>
                    <span className={clsx("w-1.5 h-1.5 rounded-full", getStatusDot(account.status))}></span>
                    {account.status}
                  </span>
                </div>
              </div>
              <button className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-colors">
                <span className="material-symbols-outlined text-[20px]">more_vert</span>
              </button>
            </div>

            {/* Permissions or Disconnected Warning */}
            <div className="mb-6">
              {account.status === 'Mất kết nối' ? (
                <div className="bg-error/10 border border-error/30 rounded-xl p-4 flex items-start gap-3 mt-2">
                  <span className="material-symbols-outlined text-error shrink-0">warning</span>
                  <div>
                    <p className="text-sm font-bold text-error mb-1">
                      Kết nối đã hết hạn từ ngày {account.expiryDate}
                    </p>
                    <p className="text-xs text-error/90 leading-relaxed font-medium">
                      AI đã tự tạm dừng trên trang này. Tin nhắn và bình luận của khách vẫn được nhận và lưu lại, nhưng AI không trả lời được cho tới khi bạn kết nối lại.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <h4 className="font-mono text-[11px] font-bold tracking-wider text-on-surface-variant uppercase mb-3">QUYỀN ĐÃ CẤP TỪ TÀI KHOẢN NÀY</h4>
                  <div className="space-y-2">
                    {account.permissions.map((perm, idx) => {
                      let missingText = "";
                      if (!perm.granted) {
                        if (perm.name === "Đọc và trả lời tin nhắn") missingText = "Thiếu quyền này, AI không tư vấn và chốt đơn qua tin nhắn được.";
                        else if (perm.name === "Đọc và trả lời bình luận") missingText = "Thiếu quyền này, AI không trả lời bình luận khách được.";
                        else if (perm.name === "Đăng bài lên trang") missingText = "Thiếu quyền này, AI không đăng bài tự động được.";
                        else if (perm.name === "Chạy quảng cáo") missingText = "Thiếu quyền này, bạn không chạy được quảng cáo trong app.";
                      }

                      return (
                        <div key={idx} className="flex flex-col">
                          <div className="flex items-center gap-3">
                            {perm.granted ? (
                              <span className="material-symbols-outlined text-green-400 text-[18px]">check</span>
                            ) : (
                              <span className="material-symbols-outlined text-error text-[18px]">close</span>
                            )}
                            <span className={clsx("text-sm font-medium", perm.granted ? "text-on-surface" : "text-error")}>
                              {perm.name}
                            </span>
                          </div>
                          {!perm.granted && missingText && (
                            <p className="text-xs font-bold text-orange-400 mt-1.5 pl-7">
                              {missingText}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Sub Pages List */}
            <div className="space-y-4 mb-6">
              {account.pages.map(page => (
                <div key={page.id} className="flex items-center justify-between p-4 rounded-xl bg-surface-container border border-outline-variant hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <img src={page.avatar} alt={page.name} className="w-10 h-10 rounded-full object-cover" />
                    <div>
                      <div className="text-base font-bold text-on-surface mb-1">{page.name}</div>
                      <div className="flex items-center gap-3">
                        <span className={clsx("text-[10px] font-bold uppercase tracking-wider", page.status === 'Đang hoạt động' ? 'text-green-400' : page.status === 'Sắp hết hạn' ? 'text-yellow-400' : 'text-error')}>
                          {page.status}
                        </span>
                        <span className="text-on-surface-variant text-xs font-medium">• {page.messagesProcessed} tin nhắn</span>
                        <span className="text-on-surface-variant text-xs font-medium">• {page.commentsReplied} bình luận</span>
                      </div>
                    </div>
                  </div>
                  <button className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-colors">
                    <span className="material-symbols-outlined text-[20px]">more_vert</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Footer Buttons */}
            <div className="mt-auto flex gap-3">
              <button 
                onClick={() => handleOpenConnect({ id: account.platformId, name: account.platformName, icon: account.platformIcon })}
                className="flex-1 py-2.5 px-4 bg-surface-container border border-outline-variant text-on-surface font-bold rounded-xl hover:bg-surface-variant transition-colors">
                Thêm trang từ tài khoản này
              </button>
              <button className="flex-1 py-2.5 px-4 bg-surface-container border border-error/50 text-error font-bold rounded-xl hover:bg-error/10 hover:border-error transition-colors">
                Ngắt kết nối cả tài khoản
              </button>
            </div>
          </div>
        ))}

        {/* Add New Page Card */}`;

content = content.replace(regexGrid, newGrid);

// Update bottom lists onClick handlers to use handleOpenConnect
content = content.replace(/setSelectedPlatform\(\{ id: channel.id, name: channel.name, icon: channel.icon \}\);\s*setIsConnectModalOpen\(true\);/g, 'handleOpenConnect({ id: channel.id, name: channel.name, icon: channel.icon });');

// Replace Add New Page card click
content = content.replace(/onClick=\{\(\) => \{\n\s*setSelectedPlatform\(\{ id: 'fb', name: 'Facebook', icon: 'facebook' \}\);\n\s*setIsConnectModalOpen\(true\);\n\s*\}\}/g, 'onClick={() => handleOpenConnect()}');

fs.writeFileSync('src/pages/Connections.tsx', content);
