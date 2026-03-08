import React from 'react';
import { useNotificationStore } from '../../store';

const icons = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
  call: '📞',
};

const colors = {
  success: { bg: 'rgba(52, 211, 153, 0.1)', border: 'rgba(52, 211, 153, 0.3)', text: '#34d399' },
  error: { bg: 'rgba(248, 113, 113, 0.1)', border: 'rgba(248, 113, 113, 0.3)', text: '#f87171' },
  warning: { bg: 'rgba(251, 191, 36, 0.1)', border: 'rgba(251, 191, 36, 0.3)', text: '#fbbf24' },
  info: { bg: 'rgba(110, 231, 247, 0.08)', border: 'rgba(110, 231, 247, 0.2)', text: '#6ee7f7' },
  call: { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)', text: '#22c55e' },
};

export default function NotificationBar() {
  const { notifications, removeNotification } = useNotificationStore();

  if (notifications.length === 0) return null;

  return (
    <div style={styles.container}>
      {notifications.map(n => {
        const color = colors[n.type] || colors.info;
        return (
          <div
            key={n.id}
            className="animate-slide-up"
            style={{
              ...styles.notification,
              background: color.bg,
              border: `1px solid ${color.border}`,
            }}
          >
            <span style={{ color: color.text, fontSize: '14px' }}>
              {icons[n.type] || 'ℹ'}
            </span>
            <span style={{ color: 'var(--text-primary)', fontSize: '13px', flex: 1 }}>
              {n.message}
            </span>
            <button
              onClick={() => removeNotification(n.id)}
              style={{ color: 'var(--text-secondary)', background: 'none', fontSize: '16px', lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed', top: '20px', right: '20px',
    display: 'flex', flexDirection: 'column', gap: '8px',
    zIndex: 2000, maxWidth: '360px',
  },
  notification: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '12px 16px', borderRadius: '10px',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  },
};
