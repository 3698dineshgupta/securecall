import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store';
import { authAPI } from './services/api';
import signalingService from './services/signaling';

import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import NotificationBar from './components/ui/NotificationBar';
import IncomingCallModal from './components/call/IncomingCallModal';
import ActiveCall from './components/call/ActiveCall';
import { useCallStore } from './store';

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return <LoadingScreen />;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function LoadingScreen() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#0a0a0f', color: '#6ee7f7',
      fontFamily: "'DM Mono', monospace", fontSize: '1.2rem',
      letterSpacing: '0.2em'
    }}>
      <div className="loading-pulse">SECURECALL</div>
    </div>
  );
}

export default function App() {
  const { setUser, setLoading, isAuthenticated } = useAuthStore();
  const { callState, incomingCall } = useCallStore();

  // ── Restore session on mount ──
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      return;
    }
    authAPI.me()
      .then(res => setUser(res.data.user))
      .catch(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setUser(null);
      });
  }, []);

  // ── Connect signaling when authenticated ──
  useEffect(() => {
    if (isAuthenticated) {
      const token = localStorage.getItem('accessToken');
      signalingService.connect(token);
    } else {
      signalingService.disconnect();
    }
    return () => {};
  }, [isAuthenticated]);

  return (
    <BrowserRouter>
      <NotificationBar />
      {incomingCall && callState === 'idle' && <IncomingCallModal />}
      {['ringing', 'incoming', 'connecting', 'active'].includes(callState) && <ActiveCall />}

      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/dashboard/*" element={
          <ProtectedRoute><DashboardPage /></ProtectedRoute>
        } />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
