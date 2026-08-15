const fs = require('fs');

let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

const regex = /const handleSimulateLogin = \(\) => \{[\s\S]*?\};/;

const newFunc = `const handleSimulateLogin = () => {
    setIsLoggingIn(true);
    setTimeout(() => {
      setIsLoggingIn(false);
      setLoginSuccess(true);
      setTimeout(() => {
        if (selectedPlatform?.connectionType === 'oauth_simple') {
          setConnectStep(4);
        } else {
          setConnectStep(3);
        }
      }, 1000);
    }, 2000);
  };`;

content = content.replace(regex, newFunc);
fs.writeFileSync('src/pages/Connections.tsx', content);
