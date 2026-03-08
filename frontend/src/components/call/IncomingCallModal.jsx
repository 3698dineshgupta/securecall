import React, { useEffect, useState } from 'react';
import { useCallStore } from '../../store';
import { useCall } from '../../hooks/useCall';
import { usersAPI } from '../../services/api';

export default function IncomingCallModal() {
  const { incomingCall } = useCallStore();
  const { acceptCall, rejectCall } = useCall();
  const [callerInfo, setCallerInfo] = useState(null);

  useEffect(() => {
    if (incomingCall?.callerId) {
      usersAPI.getProfile(incomingCall.callerId)
        .then(res => setCallerInfo(res.data.user))
        .catch(() => setCallerInfo({ username: 'Unknown', id: incomingCall.callerId }));
    }
  }, [incomingCall?.callerId]);

  if (!incomingCall) return null;

  const initials = callerInfo?.username?.slice(0, 2).toUpperCase() || '??';

  return (
    <div style={styles.overlay}>
      <div style={styles.modal} className="animate-slide-up">
        {/* Pulsing background */}
        <div style={styles.bg} />

        <div style={styles.typeLabel}>
          {incomingCall.callType === 'video' ? '📹 Video call' : '📞 Voice call'}
        </div>

        <div style={styles.avatar} className="animate-ring">
          {initials}
        </div>

        <div style={styles.callerName}>
          {callerInfo?.username || 'Unknown caller'}
        </div>

        <div style={styles.subtext}>Incoming {incomingCall.callType} call</div>

        <div style={styles.encBadge}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span>End-to-end encrypted</span>
        </div>

        <div style={styles.actions}>
          <button onClick={rejectCall} style={styles.rejectBtn} title="Reject">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45"/>
              <line x1="23" y1="1" x2="1" y2="23"/>
            </svg>
            <span>Decline</span>
          </button>

          <button onClick={acceptCall} style={styles.acceptBtn} title="Accept">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.27"/>
            </svg>
            <span>Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 900,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(5, 5, 10, 0.85)', backdropFilter: 'blur(12px)',
  },
  modal: {
    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-lg)', padding: '48px 40px',
    width: '320px', textAlign: 'center',
    boxShadow: '0 20px 80px rgba(0,0,0,0.6)',
    position: 'relative', overflow: 'hidden',
  },
  bg: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(ellipse at 50% 0%, rgba(52, 211, 153, 0.08) 0%, transparent 60%)',
    pointerEvents: 'none',
  },
  typeLabel: {
    fontFamily: 'var(--font-mono)', fontSize: '12px', letterSpacing: '0.1em',
    color: 'var(--text-secondary)', marginBottom: '24px', position: 'relative', zIndex: 1,
  },
  avatar: {
    width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto 20px',
    background: 'rgba(52, 211, 153, 0.1)', border: '2px solid rgba(52, 211, 153, 0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-mono)', fontSize: '24px', color: '#34d399',
    position: 'relative', zIndex: 1,
  },
  callerName: {
    fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700,
    color: 'var(--text-primary)', marginBottom: '8px', position: 'relative', zIndex: 1,
  },
  subtext: {
    color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px',
    position: 'relative', zIndex: 1,
  },
  encBadge: {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.2)',
    padding: '5px 12px', borderRadius: '20px',
    color: '#34d399', fontSize: '11px', fontFamily: 'var(--font-mono)',
    marginBottom: '32px', position: 'relative', zIndex: 1,
  },
  actions: {
    display: 'flex', gap: '16px', justifyContent: 'center',
    position: 'relative', zIndex: 1,
  },
  rejectBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
    background: 'rgba(248, 113, 113, 0.15)', color: 'var(--accent-danger)',
    border: '1px solid rgba(248, 113, 113, 0.3)',
    width: '80px', height: '80px', borderRadius: '50%',
    fontSize: '11px', fontFamily: 'var(--font-mono)',
    transition: 'var(--transition)',
  },
  acceptBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
    background: 'rgba(34, 197, 94, 0.15)', color: 'var(--accent-call)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    width: '80px', height: '80px', borderRadius: '50%',
    fontSize: '11px', fontFamily: 'var(--font-mono)',
    transition: 'var(--transition)',
  },
};
