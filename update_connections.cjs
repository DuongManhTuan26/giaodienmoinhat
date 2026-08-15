const fs = require('fs');

let content = fs.readFileSync('src/pages/Connections.tsx', 'utf8');

// 1. Update imports
content = content.replace(
    "import { mockConnections, socialChannels, adChannels, communicationChannels } from '../data/mockApi';",
    "import { connectedAccounts, mockSubPagesToSelect, socialChannels, adChannels, communicationChannels } from '../data/mockApi';"
);

// 2. Update states
const state_old = `  const [bannerState, setBannerState] = useState<'normal' | 'warning' | 'danger'>('normal');
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<{id: string, name: string, icon: string} | null>(null);
  const topGridRef = useRef<HTMLDivElement>(null);`;

const state_new = `  const [bannerState, setBannerState] = useState<'normal' | 'warning' | 'danger'>('normal');
  const [connectStep, setConnectStep] = useState(0); // 0 = closed, 1-4 = steps
  const [selectedPlatform, setSelectedPlatform] = useState<{id: string, name: string, icon: string} | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const topGridRef = useRef<HTMLDivElement>(null);

  const handleOpenConnect = (platform?: {id: string, name: string, icon: string}) => {
    if (platform) {
      setSelectedPlatform(platform);
      setConnectStep(2);
    } else {
      setSelectedPlatform(null);
      setConnectStep(1);
    }
    setLoginSuccess(false);
    setSelectedPages([]);
  };

  const handleSimulateLogin = () => {
    setIsLoggingIn(true);
    setTimeout(() => {
      setIsLoggingIn(false);
      setLoginSuccess(true);
      setTimeout(() => {
        setConnectStep(3);
      }, 1000);
    }, 2000);
  };`;

content = content.replace(state_old, state_new);

// 3. Update top add button
content = content.replace(
    `onClick={() => {\n            setSelectedPlatform({ id: 'fb', name: 'Facebook', icon: 'facebook' });\n            setIsConnectModalOpen(true);\n          }}`,
    `onClick={() => handleOpenConnect()}`
);

fs.writeFileSync('src/pages/Connections.tsx', content);
