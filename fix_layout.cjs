const fs = require('fs');
let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

// Replace header layout
const oldHeader = `                <div>
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
              </button>`;

const newHeader = `                <div>
                  <h3 className="text-lg font-bold text-on-surface mb-0.5">{account.platformName} — {account.accountName}</h3>
                  <p className="text-sm text-on-surface-variant font-medium">Đang quản lý {account.pages.length} trang · Kết nối ngày {account.connectionDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={clsx("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border", getStatusColor(account.status))}>
                  <span className={clsx("w-1.5 h-1.5 rounded-full", getStatusDot(account.status))}></span>
                  {account.status}
                </span>
                <button className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-colors">
                  <span className="material-symbols-outlined text-[20px]">more_vert</span>
                </button>
              </div>`;

content = content.replace(oldHeader, newHeader);
fs.writeFileSync('src/pages/Connections.tsx', content);
