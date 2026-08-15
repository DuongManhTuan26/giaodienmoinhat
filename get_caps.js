const fs = require('fs');
const lines = fs.readFileSync('llms_full.txt', 'utf8').split('\n');
let currentPlatform = '';
for (let i=0; i<lines.length; i++) {
  if (lines[i].match(/^# [A-Z][a-zA-Z\s]+$/)) {
    currentPlatform = lines[i];
  }
  if (lines[i].includes('capabilities') || lines[i].includes('does not support') || lines[i].includes('publishing only') || lines[i].includes('Capabilities')) {
    // console.log(currentPlatform, ":", lines[i]);
  }
}
