import re

with open('src/pages/Connections.tsx', 'r') as f:
    content = f.read()

# 1. Update imports
content = content.replace(
    "import { mockConnections, socialChannels, adChannels, communicationChannels } from '../data/mockApi';",
    "import { connectedAccounts, mockSubPagesToSelect, socialChannels, adChannels, communicationChannels } from '../data/mockApi';"
)

# 2. Update states
state_old = """  const [bannerState, setBannerState] = useState<'normal' | 'warning' | 'danger'>('normal');
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<{id: string, name: string, icon: string} | null>(null);
  const topGridRef = useRef<HTMLDivElement>(null);"""

state_new = """  const [bannerState, setBannerState] = useState<'normal' | 'warning' | 'danger'>('normal');
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
  };
"""
content = content.replace(state_old, state_new)

# 3. Update 'Kết nối kênh mới' button
btn_old = """onClick={() => {
            setSelectedPlatform({ id: 'fb', name: 'Facebook', icon: 'facebook' });
            setIsConnectModalOpen(true);
          }}"""
btn_new = """onClick={() => handleOpenConnect()}"""
content = content.replace(btn_old, btn_new, 1)

with open('src/pages/Connections.tsx', 'w') as f:
    f.write(content)
