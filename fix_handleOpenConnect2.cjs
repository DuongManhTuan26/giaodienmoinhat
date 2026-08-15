const fs = require('fs');

let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

const regex = /const handleOpenConnect = \(\s*platform\s*\?\s*:\s*\{\s*id\s*:\s*string\s*,\s*name\s*:\s*string\s*,\s*icon\s*:\s*string\s*,\s*connectionType\s*\?\s*:\s*string\s*,\s*selectionLabel\s*\?\s*:\s*string\s*\}\s*\)\s*=>\s*\{[\s\S]*?setSelectedPages\(\[\]\);\s*\};/;

const newFunc = `const handleOpenConnect = (platform?: {id: string, name: string, icon: string, connectionType?: string, selectionLabel?: string, requestedPermissions?: any[], publishOnly?: boolean}) => {
    if (platform) {
      let fullPlatform = { ...platform };
      const allChannels = [...socialChannels, ...adChannels, ...communicationChannels];
      const found = allChannels.find(c => c.id === platform.id);
      
      if (!platform.connectionType) {
        if (found) {
          fullPlatform.connectionType = found.connectionType || 'oauth_simple';
          fullPlatform.selectionLabel = found.selectionLabel;
        } else {
          fullPlatform.connectionType = 'oauth_simple';
        }
      }
      
      if (found) {
        fullPlatform.requestedPermissions = found.requestedPermissions;
        fullPlatform.publishOnly = found.publishOnly;
      }

      setSelectedPlatform(fullPlatform);
      setConnectStep(2);
    } else {
      setSelectedPlatform(null);
      setConnectStep(1);
    }
    setLoginSuccess(false);
    setSelectedPages([]);
  };`;

if (regex.test(content)) {
  content = content.replace(regex, newFunc);
  fs.writeFileSync('src/pages/Connections.tsx', content);
  console.log("Replaced handleOpenConnect successfully.");
} else {
  console.log("Could not find handleOpenConnect to replace.");
}
