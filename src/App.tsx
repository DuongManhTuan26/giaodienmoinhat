import { Routes, Route, Navigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
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
import { api, ApiError, type User } from './lib/api';
import { ActivePageProvider } from './lib/ActivePage';

type AppState = 'loading' | 'auth' | 'onboarding' | 'setup_complete' | 'main';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Kiểm tra phiên hiện có khi mở trang. Người dùng đã đăng nhập rồi thì
  // không bắt đăng nhập lại mỗi lần tải lại trang.
  useEffect(() => {
    let cancelled = false;

    api.auth
      .me()
      .then(({ user }) => {
        if (cancelled) return;
        setUser(user);
        setAppState('main');
      })
      .catch((error) => {
        if (cancelled) return;
        if (!(error instanceof ApiError) || !error.isUnauthorized) {
          console.error('Không kiểm tra được phiên đăng nhập:', error);
        }
        setAppState('auth');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Ảnh đại diện trên thanh trên lấy từ kênh đã kết nối, không dùng ảnh dựng sẵn.
  useEffect(() => {
    if (appState !== 'main') return;
    let cancelled = false;

    api.connections
      .accounts()
      .then(({ data }) => {
        if (cancelled) return;
        const active = data.find((account) => account.connected && account.profile_picture);
        setAvatarUrl(active?.profile_picture ?? null);
      })
      .catch(() => {
        /* Không lấy được ảnh thì hiển thị chữ cái đầu, không cần báo lỗi. */
      });

    return () => {
      cancelled = true;
    };
  }, [appState]);

  const handleLogout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch (error) {
      console.error('Đăng xuất thất bại:', error);
    }
    setUser(null);
    setAppState('auth');
  }, []);

  if (appState === 'loading') {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background gap-4">
        <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="font-body-md text-on-surface-variant">Đang tải hệ thống…</p>
      </div>
    );
  }

  if (appState === 'auth') {
    return (
      <Auth
        onLogin={(loggedIn) => {
          setUser(loggedIn);
          setAppState('main');
        }}
        onRegister={(registered) => {
          setUser(registered);
          setAppState('onboarding');
        }}
      />
    );
  }

  if (appState === 'onboarding') {
    return (
      <Onboarding
        onComplete={() => setAppState('setup_complete')}
        onSkip={() => setAppState('main')}
      />
    );
  }

  if (appState === 'setup_complete') {
    return <SetupComplete onFinish={() => setAppState('main')} />;
  }

  return (
    <ActivePageProvider>
    <div className="flex h-screen w-full bg-background">
      <Sidebar onLogout={handleLogout} />
      <div className="flex-1 ml-72 flex flex-col h-screen relative">
        <TopNavBar user={user} avatarUrl={avatarUrl} />
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
    </ActivePageProvider>
  );
}
