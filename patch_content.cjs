const fs = require('fs');

let content = fs.readFileSync('src/pages/Content.tsx', 'utf-8');

// Update imports
content = content.replace(
  "import React, { useState, useMemo } from 'react';",
  "import React, { useState, useMemo, useEffect } from 'react';"
);

// Add db logic
const stateLogic = `
  const [dbPosts, setDbPosts] = useState<any[]>([]);

  const fetchPosts = async () => {
    try {
      const response = await fetch('/api/posts');
      const data = await response.json();
      if (data.success) {
        setDbPosts(data.data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleApprove = async (id: string) => {
    await fetch(\`/api/posts/\${id}/status\`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Đã đăng' })
    });
    fetchPosts();
  };

  const handleSchedule = async (id: string) => {
    const hours = prompt('Nhập số giờ đếm ngược để đăng (ví dụ: 2):', '2');
    if (!hours) return;
    const scheduleTime = new Date(Date.now() + parseInt(hours) * 3600000);
    await fetch(\`/api/posts/\${id}/status\`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Đã lên lịch', scheduleTime: scheduleTime.toISOString() })
    });
    fetchPosts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xoá bài này?')) return;
    await fetch(\`/api/posts/\${id}\`, { method: 'DELETE' });
    fetchPosts();
  };

  const handleAcceptAiOption = async (optionContent: string) => {
    await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: optionContent,
        status: composerMode === 'now' ? 'Đã đăng' : (postMode === 'auto' ? 'Đã lên lịch' : 'Chờ duyệt'),
        scheduleTime: composerMode === 'schedule' ? new Date(Date.now() + 86400000).toISOString() : null
      })
    });
    setIsComposerOpen(false);
    setAiOptions([]);
    setComposerTopic('');
    setComposerContent('');
    fetchPosts();
  };

  const activeCounts = {
    pending: dbPosts.filter(p => p.status === 'Chờ duyệt').length,
    scheduled: dbPosts.filter(p => p.status === 'Đã lên lịch').length,
    published: dbPosts.filter(p => p.status === 'Đã đăng').length,
    drafts: dbPosts.filter(p => p.status === 'Bản nháp').length,
  };

  const FILTERS = [
    \`Chờ duyệt (\${activeCounts.pending})\`,
    \`Đã lên lịch (\${activeCounts.scheduled})\`,
    'Đã đăng',
    'Bản nháp'
  ];

  const filteredPosts = useMemo(() => {
    let filterStatus = '';
    if (activeFilter.includes('Chờ duyệt')) filterStatus = 'Chờ duyệt';
    else if (activeFilter.includes('Đã lên lịch')) filterStatus = 'Đã lên lịch';
    else if (activeFilter.includes('Đã đăng')) filterStatus = 'Đã đăng';
    else filterStatus = 'Bản nháp';

    return dbPosts.filter(post => post.status === filterStatus);
  }, [activeFilter, dbPosts]);
`;

content = content.replace(
  "const FILTERS = ['Chờ duyệt (3)', 'Đã lên lịch (5)', 'Đã đăng', 'Bản nháp'];\n\nexport default function Content() {\n  const [activeFilter, setActiveFilter] = useState('Chờ duyệt (3)');",
  "export default function Content() {\n  const [activeFilter, setActiveFilter] = useState('Chờ duyệt (0)');"
);

content = content.replace(
  "const [isGenerating, setIsGenerating] = useState(false);",
  "const [isGenerating, setIsGenerating] = useState(false);\n" + stateLogic
);

// We need to remove the old filteredPosts definition
content = content.replace(
  /const filteredPosts = useMemo\(\(\) => \{[\s\S]*?\}, \[activeFilter\]\);/,
  ""
);

content = content.replace(
  "3 BÀI CHỜ DUYỆT",
  "{activeCounts.pending} BÀI CHỜ DUYỆT"
);

content = content.replace(
  '<span className="font-headline-sm text-3xl font-bold text-on-surface">3</span>',
  '<span className="font-headline-sm text-3xl font-bold text-on-surface">{activeCounts.pending}</span>'
);

content = content.replace(
  '<span className="font-headline-sm text-3xl font-bold text-on-surface">5</span>',
  '<span className="font-headline-sm text-3xl font-bold text-on-surface">{activeCounts.scheduled}</span>'
);

content = content.replace(
  '<span className="font-headline-sm text-3xl font-bold text-on-surface">12</span>',
  '<span className="font-headline-sm text-3xl font-bold text-on-surface">{activeCounts.published}</span>'
);

content = content.replace(
  "onClick={() => setIsComposerOpen(false)}",
  "onClick={() => { setIsComposerOpen(false); setAiOptions([]); }}"
);

// Replace button for selecting AI option
content = content.replace(
  /className="px-4 py-2 bg-primary text-on-primary font-bold rounded hover:brightness-110 transition-all text-sm"\s*>\s*Chọn mẫu này/g,
  `onClick={() => handleAcceptAiOption(option)}
                        className="px-4 py-2 bg-primary text-on-primary font-bold rounded hover:brightness-110 transition-all text-sm"
                      >
                        Chọn mẫu này`
);

// We need to modify the grid posts mapping to render `dbPosts` items correctly.
// DB returns: id, content, status, platforms, scheduled_for, created_at
content = content.replace(
  /post\.hasImage/g,
  "(post.platforms === 'has_image')"
);

content = content.replace(
  /post\.aiTime/g,
  "`AI viết lúc ${new Date(post.created_at).toLocaleTimeString('vi-VN')} ngày ${new Date(post.created_at).toLocaleDateString('vi-VN')}`"
);

content = content.replace(
  /post\.scheduleTime/g,
  "(post.scheduled_for ? `Đăng lúc: ${new Date(post.scheduled_for).toLocaleTimeString('vi-VN')} ${new Date(post.scheduled_for).toLocaleDateString('vi-VN')}` : 'Chưa đặt lịch')"
);

content = content.replace(
  /post\.stats/g,
  "null"
);

// Replace generic "more_vert" button with delete/approve/schedule actions
content = content.replace(
  /<button className="text-on-surface-variant hover:text-on-surface p-1 rounded-md hover:bg-surface-variant transition-colors">\s*<span className="material-symbols-outlined text-\[18px\]">more_vert<\/span>\s*<\/button>/,
  `<div className="flex gap-2">
                {post.status === 'Chờ duyệt' && (
                  <>
                    <button onClick={() => handleApprove(post.id)} className="text-green-500 hover:bg-green-500/10 p-1 rounded-md transition-colors" title="Duyệt đăng">
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    </button>
                    <button onClick={() => handleSchedule(post.id)} className="text-blue-500 hover:bg-blue-500/10 p-1 rounded-md transition-colors" title="Lên lịch">
                      <span className="material-symbols-outlined text-[18px]">schedule</span>
                    </button>
                  </>
                )}
                <button onClick={() => handleDelete(post.id)} className="text-error hover:bg-error/10 p-1 rounded-md transition-colors" title="Xóa">
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>`
);


fs.writeFileSync('src/pages/Content.tsx', content);
console.log('Patched content.tsx');
