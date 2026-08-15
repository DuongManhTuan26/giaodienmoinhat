const fs = require('fs');
let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

const oldHandleConnect = `const handleOpenConnect = (platform?: {id: string, name: string, icon: string, connectionType?: string, selectionLabel?: string, requestedPermissions?: any[], publishOnly?: boolean}) => {`;
const newHandleConnect = `const handleOpenConnect = (platform?: {id: string, name: string, icon: string, connectionType?: string, selectionLabel?: string, requestedPermissions?: any[], publishOnly?: boolean, warnings?: string[], instructions?: string[]}) => {`;

if (content.includes(oldHandleConnect)) {
  content = content.replace(oldHandleConnect, newHandleConnect);
  fs.writeFileSync('src/pages/Connections.tsx', content);
  console.log("Fixed handleOpenConnect type definition!");
} else {
  console.log("Could not find the exact string to replace.");
}
