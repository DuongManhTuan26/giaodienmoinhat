const fs = require('fs');
const lines = fs.readFileSync('llms_full.txt', 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('##') && lines[i].toLowerCase().includes('permissions')) {
    console.log(`Line ${i}: ${lines[i]}`);
  }
}
