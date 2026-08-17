const fs = require('fs');

let content = fs.readFileSync('src/pages/Connections.tsx', 'utf-8');

// 1. Update imports
content = content.replace(
  "import React, { useState, useRef } from 'react';",
  "import React, { useState, useRef, useEffect } from 'react';"
);
content = content.replace(
  "import { connectedAccounts, mockSubPagesToSelect, socialChannels, adChannels, communicationChannels } from '../data/mockApi';",
  "import { connectedAccounts as mockConnectedAccounts, mockSubPagesToSelect, socialChannels, adChannels, communicationChannels } from '../data/mockApi';"
);

// 2. Add state and data fetching logic
const stateLogic = `
  const [dbPages, setDbPages] = useState<any[]>([]);

  const fetchPages = async () => {
    try {
      const response = await fetch('/api/zernio/pages');
      const data = await response.json();
      if (data.success) {
        setDbPages(data.data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchPages();
  }, []);

  const handleFinishConnection = async () => {
    if (selectedPlatform?.connectionType === 'oauth_with_selection') {
      for (const pid of selectedPages) {
        const pageDef = mockSubPagesToSelect.find(p => p.id === pid);
        if (pageDef) {
          await fetch('/api/zernio/pages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: pageDef.id + '-' + Date.now(), name: pageDef.name, platform: selectedPlatform.id })
          });
        }
      }
    } else {
      await fetch('/api/zernio/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedPlatform!.id + '-' + Date.now(), name: selectedPlatform!.name + ' Account', platform: selectedPlatform!.id })
      });
    }
    await fetchPages();
    setConnectStep(0);
    setLoginSuccess(false);
    setSelectedPages([]);
  };

  const handleDisconnectAccount = async (platformId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn ngắt kết nối tài khoản này?')) return;
    const pagesToDelete = dbPages.filter(p => p.platform === platformId);
    for (const p of pagesToDelete) {
      await fetch(\`/api/zernio/pages/\${p.id}\`, { method: 'DELETE' });
    }
    fetchPages();
  };

  const handleDisconnectPage = async (pageId: string) => {
    if (!window.confirm('Ngắt kết nối trang này?')) return;
    await fetch(\`/api/zernio/pages/\${pageId}\`, { method: 'DELETE' });
    fetchPages();
  };

  const liveConnectedAccounts = [];
  const groupedByPlatform = dbPages.reduce((acc, page) => {
    if (!acc[page.platform]) acc[page.platform] = [];
    acc[page.platform].push(page);
    return acc;
  }, {} as Record<string, any[]>);

  for (const [platform, pages] of Object.entries(groupedByPlatform)) {
    const channelInfo = [...socialChannels, ...adChannels, ...communicationChannels].find(c => c.id === platform) || { name: platform, icon: 'public' };
    
    liveConnectedAccounts.push({
      id: platform + '_acc',
      platformId: platform,
      platformName: channelInfo.name,
      platformIcon: channelInfo.icon,
      accountName: "Tài khoản kết nối",
      connectionDate: new Date(pages[0].created_at || Date.now()).toLocaleDateString('vi-VN'),
      expiryDate: "Vô hạn",
      status: "Đang hoạt động",
      permissions: [
        { name: "Truy cập trang", granted: true },
        { name: "Quản lý nội dung", granted: true },
        { name: "Đọc và trả lời tin nhắn", granted: true }
      ],
      pages: pages.map((p: any) => ({
        id: p.id,
        name: p.name,
        avatar: 'https://ui-avatars.com/api/?name=' + encodeURIComponent(p.name) + '&background=random',
        status: p.connected ? 'Đang hoạt động' : 'Mất kết nối',
        messagesProcessed: 0,
        commentsReplied: 0
      }))
    });
  }

  const isPlatformConnected = (pid: string) => dbPages.some(p => p.platform === pid && p.connected);
  const liveSocialChannels = socialChannels.map(c => ({ ...c, connected: isPlatformConnected(c.id) }));
  const liveAdChannels = adChannels.map(c => ({ ...c, connected: isPlatformConnected(c.id) }));
  const liveCommChannels = communicationChannels.map(c => ({ ...c, connected: isPlatformConnected(c.id) }));
`;

content = content.replace(
  "const [selectedPages, setSelectedPages] = useState<string[]>([]);",
  "const [selectedPages, setSelectedPages] = useState<string[]>([]);\n" + stateLogic
);

// 3. Update references
content = content.replace(/socialChannels\.map/g, 'liveSocialChannels.map');
content = content.replace(/adChannels\.map/g, 'liveAdChannels.map');
content = content.replace(/communicationChannels\.map/g, 'liveCommChannels.map');
content = content.replace(/connectedAccounts\.map/g, 'liveConnectedAccounts.map');

// 4. Update the "Ngắt kết nối cả tài khoản" button
content = content.replace(
  '<button className="flex-1 py-2.5 px-4 bg-surface-container border border-error/50 text-error font-bold rounded-xl hover:bg-error/10 hover:border-error transition-colors">',
  '<button onClick={() => handleDisconnectAccount(account.platformId)} className="flex-1 py-2.5 px-4 bg-surface-container border border-error/50 text-error font-bold rounded-xl hover:bg-error/10 hover:border-error transition-colors">'
);

// 5. Update the "Hoàn tất kết nối" button
content = content.replace(
  `                    <button \n                      onClick={() => {\n                        setConnectStep(0);\n                      }}\n                      className="flex-1 py-3.5 px-4 bg-primary text-on-primary font-bold text-lg rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"\n                    >\n                      Hoàn tất kết nối\n                    </button>`,
  `                    <button \n                      onClick={handleFinishConnection}\n                      className="flex-1 py-3.5 px-4 bg-primary text-on-primary font-bold text-lg rounded-xl shadow-[0_4px_15px_rgba(0,229,255,0.4)] hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"\n                    >\n                      Hoàn tất kết nối\n                    </button>`
);

// Add delete page button handler in "Sub Pages List"
content = content.replace(
  '<button className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-colors">\n                    <span className="material-symbols-outlined text-[20px]">more_vert</span>\n                  </button>',
  '<button onClick={() => handleDisconnectPage(page.id)} className="w-8 h-8 flex items-center justify-center rounded-full text-error hover:bg-error/10 transition-colors" title="Xóa trang">\n                    <span className="material-symbols-outlined text-[20px]">delete</span>\n                  </button>'
);

// Also need to fix the banner counter: "2/3 KÊNH ĐÃ KẾT NỐI"
// There's a <span> with this text:
content = content.replace(
  "2/3 KÊNH ĐÃ KẾT NỐI",
  "{Object.keys(groupedByPlatform).length} KÊNH ĐÃ KẾT NỐI"
);
content = content.replace(
  "AI đang chạy trên 2 trang",
  "AI đang chạy trên {dbPages.length} trang"
);

fs.writeFileSync('src/pages/Connections.tsx', content);
console.log('Patched');
