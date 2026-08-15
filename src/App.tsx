import { Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from './components/Sidebar';
import TopNavBar from './components/TopNavBar';
import Dashboard from './pages/Dashboard';
import Inbox from './pages/Inbox';
import Orders from './pages/Orders';
import Content from './pages/Content';
import Ads from './pages/Ads';
import AutoScripts from './pages/AutoScripts';
import TelegramAlerts from './pages/TelegramAlerts';
import Connections from './pages/Connections';
import Pricing from './pages/Pricing';
import Analytics from './pages/Analytics';
import Auth from './pages/Auth';
import Onboarding from './pages/Onboarding';
import SetupComplete from './pages/SetupComplete';

type AppState = 'auth' | 'onboarding' | 'setup_complete' | 'main';

export default function App() {
  const [appState, setAppState] = useState<AppState>('auth');

  if (appState === 'auth') {
    return <Auth onLogin={() => setAppState('main')} onRegister={() => setAppState('onboarding')} />;
  }

  if (appState === 'onboarding') {
    return <Onboarding onComplete={() => setAppState('setup_complete')} onSkip={() => setAppState('main')} />;
  }

  if (appState === 'setup_complete') {
    return <SetupComplete onFinish={() => setAppState('main')} />;
  }

  return (
    <div className="flex h-screen w-full bg-background">
      <Sidebar />
      <div className="flex-1 ml-72 flex flex-col h-screen relative">
        <TopNavBar />
        <main className="flex-1 overflow-y-auto custom-scrollbar pt-16">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/content" element={<Content />} />
            <Route path="/auto-scripts" element={<AutoScripts />} />
            <Route path="/ads" element={<Ads />} />
            <Route path="/telegram" element={<TelegramAlerts />} />
            <Route path="/connections" element={<Connections />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/analytics" element={<Analytics />} />
            {/* Default fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
