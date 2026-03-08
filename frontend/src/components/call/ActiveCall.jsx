import React, { useEffect, useRef } from 'react';
import { useCallStore } from '../../store';
import { useCall } from '../../hooks/useCall';

function CallTimer({ startTime }) {
  const [elapsed, setElapsed] = React.useState(0);

  useEffect(() => {
    if (!startTime) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const format = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--accent-success)' }}>
      {format(elapsed)}
    </span>
  );
}

function ControlBtn({ onClick, active, danger, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: '52px', height: '52px', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: danger
          ? 'var(--accent-danger)'
          : active
          ? 'rgba(110, 231, 247, 0.15)'
          : 'rgba(255,255,255,0.08)',
        color: danger ? '#fff' : active ? 'var(--accent-primary)' : 'var(--text-primary)',
        border: active && !danger ? '1px solid var(--border-active)' : '1px solid transparent',
        transition: 'var(--transition)',
        fontSize: '18px',
      }}
    >
      {children}
    </button>
  );
}

export default function ActiveCall() {
  const {
    callState, callType, remoteUser, callStartTime,
    isMicMuted, isCameraOff, localStream, remoteStream,
  } = useCallStore();

  const { endCall, toggleMic, toggleCamera, rejectCall } = useCall();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Attach local stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const statusLabel = {
    ringing: 'Calling...',
    incoming: 'Incoming call',
    connecting: 'Connecting...',
    active: 'Connected',
  }[callState] || '';

  const isVideo = callType === 'video';

  return (
    <div style={styles.overlay}>
      {/* Remote video / audio background */}
      {isVideo ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={styles.remoteVideo}
        />
      ) : (
        <div style={styles.audioBackground}>
          <div style={styles.audioWave}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{
                ...styles.audioBar,
                animationDelay: `${i * 0.15}s`,
                height: callState === 'active' ? `${20 + Math.random() * 40}px` : '20px',
              }} />
            ))}
          </div>
        </div>
      )}

      {/* Overlay gradient */}
      <div style={styles.gradient} />

      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.callInfo}>
          <div style={styles.callerName}>
            {remoteUser?.username || 'Unknown'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '12px', color: callState === 'active' ? '#34d399' : '#fbbf24',
              fontFamily: 'var(--font-mono)',
            }}>
              {statusLabel}
            </span>
            {callState === 'active' && callStartTime && (
              <>
                <span style={{ color: 'var(--text-secondary)' }}>·</span>
                <CallTimer startTime={callStartTime} />
              </>
            )}
          </div>
        </div>

        <div style={styles.encBadge}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#34d399', letterSpacing: '0.05em' }}>
            E2E ENCRYPTED
          </span>
        </div>
      </div>

      {/* Local video (picture-in-picture) */}
      {isVideo && (
        <div style={styles.localVideoWrapper}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              ...styles.localVideo,
              opacity: isCameraOff ? 0.3 : 1,
            }}
          />
          {isCameraOff && (
            <div style={styles.cameraOffOverlay}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <line x1="1" y1="1" x2="23" y2="23"/>
                <path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h4a2 2 0 012 2v9.34m-7.72-2.06A4 4 0 1111.06 11"/>
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Ringing animation */}
      {['ringing', 'connecting'].includes(callState) && (
        <div style={styles.ringingContainer}>
          <div style={styles.ringingAvatar}>
            <div style={styles.ringingRing1} />
            <div style={styles.ringingRing2} />
            <div style={styles.avatarInner}>
              {(remoteUser?.username || 'U').slice(0, 2).toUpperCase()}
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={styles.controls}>
        <ControlBtn
          onClick={toggleMic}
          active={isMicMuted}
          title={isMicMuted ? 'Unmute' : 'Mute'}
        >
          {isMicMuted ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/>
              <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
              <path d="M19 10v2a7 7 0 01-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
        </ControlBtn>

        {isVideo && (
          <ControlBtn
            onClick={toggleCamera}
            active={isCameraOff}
            title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
          >
            {isCameraOff ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="1" y1="1" x2="23" y2="23"/>
                <path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h4a2 2 0 012 2v9.34"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7"/>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
            )}
          </ControlBtn>
        )}

        <ControlBtn onClick={endCall} danger title="End call">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7 2 2 0 011.72 2v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.42 19.42 0 013.07 9.13 19.79 19.79 0 01.22 0.5 2 2 0 012.22.5h3a2 2 0 011.72 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L5.91 8.41"/>
            <line x1="23" y1="1" x2="1" y2="23"/>
          </svg>
        </ControlBtn>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: '#05050a', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
  },
  remoteVideo: {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'cover',
  },
  audioBackground: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(ellipse at center, rgba(110, 231, 247, 0.06) 0%, transparent 70%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  audioWave: { display: 'flex', alignItems: 'center', gap: '6px', height: '60px' },
  audioBar: {
    width: '4px', background: 'var(--accent-primary)', borderRadius: '2px',
    animation: 'audioWave 1s ease-in-out infinite',
    transition: 'height 0.3s ease',
  },
  gradient: {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(to bottom, rgba(5,5,10,0.7) 0%, transparent 30%, transparent 60%, rgba(5,5,10,0.9) 100%)',
    pointerEvents: 'none', zIndex: 1,
  },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: '24px', zIndex: 2,
  },
  callInfo: { display: 'flex', flexDirection: 'column', gap: '4px' },
  callerName: {
    fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700,
    color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.5)',
  },
  encBadge: {
    display: 'flex', alignItems: 'center', gap: '6px',
    background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.2)',
    padding: '6px 12px', borderRadius: '20px',
  },
  localVideoWrapper: {
    position: 'absolute', bottom: '120px', right: '24px',
    width: '180px', height: '120px',
    borderRadius: '12px', overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.15)',
    zIndex: 3, background: '#000',
  },
  localVideo: {
    width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)',
  },
  cameraOffOverlay: {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.6)',
  },
  ringingContainer: {
    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  ringingAvatar: { position: 'relative', width: '100px', height: '100px' },
  ringingRing1: {
    position: 'absolute', inset: '-15px', borderRadius: '50%',
    border: '2px solid rgba(110, 231, 247, 0.3)',
    animation: 'ringPulse 2s ease infinite',
  },
  ringingRing2: {
    position: 'absolute', inset: '-30px', borderRadius: '50%',
    border: '2px solid rgba(110, 231, 247, 0.15)',
    animation: 'ringPulse 2s ease infinite 0.5s',
  },
  avatarInner: {
    width: '100px', height: '100px', borderRadius: '50%',
    background: 'rgba(110, 231, 247, 0.1)', border: '2px solid rgba(110, 231, 247, 0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-mono)', fontSize: '28px', color: 'var(--accent-primary)',
    position: 'absolute',
  },
  controls: {
    position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: '16px', zIndex: 3,
    background: 'rgba(13, 13, 24, 0.8)',
    backdropFilter: 'blur(20px)',
    padding: '16px 24px', borderRadius: '40px',
    border: '1px solid var(--border-subtle)',
  },
};
