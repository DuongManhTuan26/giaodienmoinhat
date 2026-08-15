const fs = require('fs');
let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

const oldHandleConnect = `      if (found) {
        fullPlatform.requestedPermissions = found.requestedPermissions;
        fullPlatform.publishOnly = found.publishOnly;
      }`;

const newHandleConnect = `      if (found) {
        fullPlatform.requestedPermissions = found.requestedPermissions;
        fullPlatform.publishOnly = found.publishOnly;
        fullPlatform.warnings = found.warnings;
        fullPlatform.instructions = found.instructions;
      }`;

content = content.replace(oldHandleConnect, newHandleConnect);
fs.writeFileSync('src/pages/Connections.tsx', content);
