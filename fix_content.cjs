const fs = require('fs');
let content = fs.readFileSync('src/pages/Content.tsx', 'utf-8');

const filteredPostsCode = `
  const filteredPosts = useMemo(() => {
    let filterStatus = '';
    if (activeFilter.includes('Chờ duyệt')) filterStatus = 'Chờ duyệt';
    else if (activeFilter.includes('Đã lên lịch')) filterStatus = 'Đã lên lịch';
    else if (activeFilter.includes('Đã đăng')) filterStatus = 'Đã đăng';
    else filterStatus = 'Bản nháp';

    return dbPosts.filter(post => post.status === filterStatus);
  }, [activeFilter, dbPosts]);
`;

// Insert it right after the FILTERS declaration
content = content.replace(
  "  ];\n\n",
  "  ];\n\n" + filteredPostsCode + "\n"
);

// We also need to fix `null` being used in clsx maybe?
content = content.replace(/clsx\(null\)/g, '""');
content = content.replace(/,\s*null\)/g, ')');
content = content.replace(/null\s*,/g, '');

fs.writeFileSync('src/pages/Content.tsx', content);
