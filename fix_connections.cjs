const fs = require('fs');

let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

// Update selectedPlatform state to include connectionType and selectionLabel
content = content.replace(
  /const \[selectedPlatform, setSelectedPlatform\] = useState<\{[^\}]+\} \| null>\(null\);/,
  "const [selectedPlatform, setSelectedPlatform] = useState<{id: string, name: string, icon: string, connectionType?: string, selectionLabel?: string} | null>(null);"
);

// Update all onClick handlers setting selectedPlatform in Step 1
content = content.replace(
  /onClick=\{\(\) => setSelectedPlatform\(\{ id: channel\.id, name: channel\.name, icon: channel\.icon \}\)\}/g,
  "onClick={() => setSelectedPlatform({ id: channel.id, name: channel.name, icon: channel.icon, connectionType: channel.connectionType, selectionLabel: channel.selectionLabel })}"
);

fs.writeFileSync('src/pages/Connections.tsx', content);
