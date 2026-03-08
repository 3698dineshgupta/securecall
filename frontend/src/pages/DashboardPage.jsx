import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useContactsStore, useNotificationStore } from '../store';
import { authAPI, usersAPI, callsAPI } from '../services/api';
import signalingService from '../services/signaling';
import { useCall } from '../hooks/useCall';
import { formatDistanceToNow } from 'date-fns';

function Avatar({ user, size = 36 }) {
  const initials = user?.username?.slice(0, 2).toUpperCase() || '??';
  const colors = ['#6ee7f7', '#a78bfa', '#34d399', '#fbbf24', '#f87171'];
  const color = colors[(user?.username?.charCodeAt(0) || 0) % colors.length];

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `${color}20`, border: `1.5px solid ${color}40`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-mono)', fontSize: size * 0.32, color,
      fontWeight: 500, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

function ContactItem({ contact, onCall }) {
  const { onlineUsers } = useContactsStore();
  const isOnline = onlineUsers.has(contact.id);

  return (
    <div style={styles.contactItem}>
      <div style={{ position: 'relative' }}>
        <Avatar user={contact} />
        <span
          className={`status-dot ${isOnline ? 'online' : 'offline'}`}
          style={{ position: 'absolute', bottom: 0, right: 0 }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.contactName}>{contact.username}</div>
        <div style={styles.contactStatus}>
          {isOnline ? 'Online' : `Last seen ${contact.last_seen ? formatDistanceToNow(new Date(contact.last_seen), { addSuffix: true }) : 'unknown'}`}
        </div>
      </div>
      <div style={styles.callBtns}>
        <button
          onClick={() => onCall(contact, 'audio', isOnline)}
          style={styles.callBtn}
          title="Audio call"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.27 19.79 19.79 0 01.22 0.7 2 2 0 012.22.7h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
          </svg>
        </button>
        <button
          onClick={() => onCall(contact, 'video', isOnline)}
          style={{ ...styles.callBtn, background: 'rgba(110, 231, 247, 0.1)', color: 'var(--accent-primary)' }}
          title="Video call"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function CallHistoryItem({ call }) {
  const isIncoming = call.direction === 'incoming';
  const missed = call.status === 'missed';

  const formatDuration = (secs) => {
    if (!secs) return '';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={styles.historyItem}>
      <div style={{ position: 'relative' }}>
        <Avatar user={{ username: call.other_username }} size={32} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={styles.contactName}>{call.other_username}</span>
          <span style={{
            fontSize: '10px', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em',
            padding: '2px 6px', borderRadius: '4px',
            background: call.call_type === 'video' ? 'rgba(110, 231, 247, 0.1)' : 'rgba(167, 139, 250, 0.1)',
            color: call.call_type === 'video' ? 'var(--accent-primary)' : 'var(--accent-secondary)',
          }}>
            {call.call_type}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
          <span style={{ color: missed ? 'var(--accent-danger)' : isIncoming ? 'var(--accent-success)' : 'var(--text-secondary)', fontSize: '12px' }}>
            {missed ? '↘ Missed' : isIncoming ? '↙ Incoming' : '↗ Outgoing'}
          </span>
          {call.duration_seconds > 0 && (
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              {formatDuration(call.duration_seconds)}
            </span>
          )}
        </div>
      </div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
        {call.created_at ? formatDistanceToNow(new Date(call.created_at), { addSuffix: true }) : ''}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, logout } = useAuthStore();
  const { contacts, setContacts, setUserOnline, setOnlineUsers } = useContactsStore();
  const navigate = useNavigate();
  const { initiateCall } = useCall();

  const [tab, setTab] = useState('contacts'); // contacts | history | search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [callHistory, setCallHistory] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(true);

  // Load contacts
  useEffect(() => {
    usersAPI.getContacts()
      .then(res => setContacts(res.data.contacts))
      .catch(console.error)
      .finally(() => setLoadingContacts(false));
  }, []);

  // Load call history when tab changes
  useEffect(() => {
    if (tab === 'history') {
      callsAPI.getHistory({ limit: 50 })
        .then(res => setCallHistory(res.data.calls))
        .catch(console.error);
    }
  }, [tab]);

  // Setup presence listener
  useEffect(() => {
    signalingService.on('user:status', ({ userId, isOnline }) => {
      setUserOnline(userId, isOnline);
    });
    signalingService.on('users:online', ({ userIds }) => {
      setOnlineUsers(userIds);
    });
    return () => {
      signalingService.off('user:status');
      signalingService.off('users:online');
    };
  }, []);

  // Search users
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await usersAPI.search(searchQuery);
        setSearchResults(res.data.users);
      } catch (e) { }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleAddContact = async (userId) => {
    try {
      await usersAPI.addContact(userId);
      const res = await usersAPI.getContacts();
      setContacts(res.data.contacts);
    } catch (err) {
      console.error('Add contact error:', err);
    }
  };

  const handleLogout = async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      await authAPI.logout(refreshToken);
    } catch (e) { }
    logout();
    navigate('/login');
  };

  return (
    <div style={styles.layout}>
      {/* ── Sidebar ── */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          <div style={styles.brandRow}>
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="15" stroke="#6ee7f7" strokeWidth="1.5" />
              <path d="M10 22L16 10L22 22" stroke="#6ee7f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 18H20" stroke="#6ee7f7" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={styles.brand}>SECURECALL</span>
          </div>

          <div style={styles.userCard}>
            <Avatar user={user} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.userName}>{user?.username}</div>
              <div style={styles.userEmail}>{user?.email}</div>
            </div>
            <button onClick={handleLogout} style={styles.logoutBtn} title="Sign out">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>

          <div style={styles.tabs}>
            {[
              { id: 'contacts', label: 'Contacts' },
              { id: 'history', label: 'History' },
              { id: 'search', label: 'Search' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{ ...styles.tab, ...(tab === t.id ? styles.tabActive : {}) }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.sidebarContent}>
          {/* Contacts */}
          {tab === 'contacts' && (
            <div>
              {loadingContacts ? (
                <div style={styles.empty}>Loading contacts...</div>
              ) : contacts.length === 0 ? (
                <div style={styles.empty}>
                  <div>No contacts yet</div>
                  <button onClick={() => setTab('search')} style={styles.emptyAction}>
                    Find people →
                  </button>
                </div>
              ) : (
                contacts.map(contact => (
                  <ContactItem
                    key={contact.id}
                    contact={contact}
                    onCall={async (contact, type, isOnline) => {
                      if (!isOnline) {
                        try {
                          await callsAPI.recordCall({
                            calleeId: contact.id,
                            callType: type,
                            status: 'missed',
                            startedAt: new Date().toISOString()
                          });
                          useNotificationStore.getState().addNotification({
                            type: 'warning',
                            message: `User is offline. Missed call recorded.`
                          });
                        } catch (e) {
                          console.error('Failed to log offline call', e);
                        }
                      } else {
                        initiateCall(contact, type);
                      }
                    }}
                  />
                ))
              )}
            </div>
          )}

          {/* History */}
          {tab === 'history' && (
            <div>
              {callHistory.length === 0 ? (
                <div style={styles.empty}>No call history</div>
              ) : (
                callHistory.map(call => (
                  <CallHistoryItem key={call.id} call={call} />
                ))
              )}
            </div>
          )}

          {/* Search */}
          {tab === 'search' && (
            <div>
              <div style={{ padding: '12px 16px' }}>
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by username or email..."
                  autoFocus
                />
              </div>
              {searching && <div style={styles.empty}>Searching...</div>}
              {searchResults.map(result => {
                const isContact = contacts.some(c => c.id === result.id);
                return (
                  <div key={result.id} style={styles.searchResult}>
                    <Avatar user={result} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.contactName}>{result.username}</div>
                      <div style={styles.contactStatus}>{result.email}</div>
                    </div>
                    {!isContact && (
                      <button
                        onClick={() => handleAddContact(result.id)}
                        style={styles.addBtn}
                      >
                        + Add
                      </button>
                    )}
                    {isContact && (
                      <span style={{ color: 'var(--accent-success)', fontSize: '12px' }}>✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={styles.sidebarFooter}>
          <div style={styles.encBadge}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>All calls end-to-end encrypted</span>
          </div>
        </div>
      </div>

      {/* ── Main Area ── */}
      <div style={styles.main}>
        <div style={styles.welcomeArea}>
          <div style={styles.welcomeGlow} />
          <div style={styles.welcomeContent}>
            <h2 style={styles.welcomeTitle}>
              Encrypted calls,<br />zero compromise.
            </h2>
            <p style={styles.welcomeDesc}>
              Select a contact and start a voice or video call.<br />
              Your media is protected by DTLS-SRTP — the server never sees your content.
            </p>
            <div style={styles.featureGrid}>
              {[
                { icon: '🔒', label: 'DTLS-SRTP Encryption', desc: 'Military-grade E2E' },
                { icon: '⚡', label: 'WebRTC P2P', desc: 'Direct peer connections' },
                { icon: '🛡️', label: 'Zero trust server', desc: 'Media never touches us' },
                { icon: '🔑', label: 'JWT Auth', desc: 'Secure session management' },
              ].map(f => (
                <div key={f.label} style={styles.featureCard}>
                  <span style={{ fontSize: '20px' }}>{f.icon}</span>
                  <div>
                    <div style={styles.featureLabel}>{f.label}</div>
                    <div style={styles.featureDesc}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  layout: {
    display: 'flex', height: '100vh', overflow: 'hidden',
    background: 'var(--bg-deep)',
  },
  sidebar: {
    width: '320px', flexShrink: 0,
    background: 'var(--bg-surface)',
    borderRight: '1px solid var(--border-subtle)',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  },
  sidebarTop: {
    padding: '20px 0 0', borderBottom: '1px solid var(--border-subtle)',
  },
  brandRow: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '0 20px', marginBottom: '20px',
  },
  brand: {
    fontFamily: 'var(--font-mono)', fontSize: '12px', letterSpacing: '0.2em',
    color: 'var(--accent-primary)', fontWeight: 500,
  },
  userCard: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '12px 16px', margin: '0 12px 16px',
    background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-subtle)',
  },
  userName: {
    fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  userEmail: {
    fontSize: '11px', color: 'var(--text-secondary)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  logoutBtn: {
    background: 'transparent', color: 'var(--text-secondary)', padding: '4px',
    borderRadius: '6px', flexShrink: 0,
    ':hover': { color: 'var(--accent-danger)' },
  },
  tabs: {
    display: 'flex', padding: '0 12px 0',
  },
  tab: {
    flex: 1, padding: '10px 8px',
    background: 'transparent', color: 'var(--text-secondary)',
    fontSize: '13px', fontWeight: 500,
    borderBottom: '2px solid transparent',
    transition: 'var(--transition)',
  },
  tabActive: {
    color: 'var(--accent-primary)',
    borderBottomColor: 'var(--accent-primary)',
  },
  sidebarContent: {
    flex: 1, overflowY: 'auto', padding: '8px 0',
  },
  contactItem: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '10px 16px', transition: 'var(--transition)',
    cursor: 'default',
    ':hover': { background: 'var(--bg-hover)' },
  },
  contactName: {
    fontWeight: 500, fontSize: '14px', color: 'var(--text-primary)',
  },
  contactStatus: { fontSize: '12px', color: 'var(--text-secondary)' },
  callBtns: { display: 'flex', gap: '6px' },
  callBtn: {
    width: '30px', height: '30px', borderRadius: '50%',
    background: 'rgba(52, 211, 153, 0.1)', color: 'var(--accent-success)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'var(--transition)',
    ':hover': { opacity: 0.8 },
    ':disabled': { opacity: 0.3 },
  },
  historyItem: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '10px 16px',
  },
  searchResult: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '10px 16px',
  },
  addBtn: {
    background: 'rgba(110, 231, 247, 0.1)', color: 'var(--accent-primary)',
    padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
    border: '1px solid var(--border-normal)',
  },
  empty: {
    textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 20px',
    fontSize: '14px',
  },
  emptyAction: {
    background: 'transparent', color: 'var(--accent-primary)', fontSize: '13px',
    marginTop: '12px', display: 'block', margin: '12px auto 0',
  },
  sidebarFooter: {
    padding: '12px 16px',
    borderTop: '1px solid var(--border-subtle)',
  },
  encBadge: {
    display: 'flex', alignItems: 'center', gap: '6px',
    color: '#34d399', fontSize: '11px', fontFamily: 'var(--font-mono)',
  },
  main: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden',
  },
  welcomeGlow: {
    position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
    width: '400px', height: '400px', borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(110, 231, 247, 0.04) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  welcomeContent: {
    textAlign: 'center', maxWidth: '520px', padding: '40px', position: 'relative', zIndex: 1,
  },
  welcomeTitle: {
    fontFamily: 'var(--font-display)', fontSize: '40px', fontWeight: 800,
    color: 'var(--text-primary)', lineHeight: 1.15, marginBottom: '20px',
  },
  welcomeDesc: {
    color: 'var(--text-secondary)', fontSize: '15px', lineHeight: 1.7, marginBottom: '40px',
  },
  featureGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px',
    textAlign: 'left',
  },
  featureCard: {
    display: 'flex', gap: '12px', alignItems: 'flex-start',
    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-md)', padding: '14px',
  },
  featureLabel: {
    fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px',
  },
  featureDesc: { fontSize: '11px', color: 'var(--text-secondary)' },
};
