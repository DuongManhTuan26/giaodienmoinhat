const fs = require('fs');

async function fetchDocs() {
  const llms = await fetch('https://docs.zernio.com/llms-full.txt').then(res => res.text());
  fs.writeFileSync('llms_full.txt', llms);
  
  const html = await fetch('https://docs.zernio.com/guides/connecting-accounts').then(res => res.text());
  // simple regex to extract text from <article> or main content
  const text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                   .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                   .replace(/<[^>]+>/g, ' ');
  fs.writeFileSync('connecting-accounts.txt', text);
}
fetchDocs();
