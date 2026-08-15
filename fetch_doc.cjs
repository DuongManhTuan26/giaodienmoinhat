const fs = require('fs');
const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function run() {
  const llms = await fetch('https://docs.zernio.com/llms-full.txt');
  fs.writeFileSync('llms_full.txt', llms);
  console.log("Got LLMs file. Length:", llms.length);

  const html = await fetch('https://docs.zernio.com/guides/connecting-accounts');
  const text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                   .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                   .replace(/<[^>]+>/g, ' ')
                   .replace(/\s+/g, ' ');
  fs.writeFileSync('connecting-accounts.txt', text);
  console.log("Got accounts file. Length:", text.length);
}
run();
