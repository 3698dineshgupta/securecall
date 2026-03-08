import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuthStore } from '../store';

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.login(form);
      const { user, accessToken, refreshToken } = res.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setUser(user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.bg} />
      <div style={styles.card} className="animate-slide-up">
        <div style={styles.logo}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="15" stroke="#6ee7f7" strokeWidth="1.5"/>
            <path d="M10 22L16 10L22 22" stroke="#6ee7f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 18H20" stroke="#6ee7f7" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span style={styles.logoText}>SECURECALL</span>
        </div>

        <h1 style={styles.title}>Welcome back</h1>
        <p style={styles.subtitle}>Sign in to your encrypted communications</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.btn,
              ...(loading ? styles.btnLoading : {})
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p style={styles.footer}>
          No account?{' '}
          <Link to="/signup" style={styles.link}>Create one</Link>
        </p>

        <div style={styles.securityBadge}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span>End-to-end encrypted • DTLS-SRTP</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-deep)', position: 'relative', overflow: 'hidden', padding: '20px',
  },
  bg: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(110, 231, 247, 0.06) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  card: {
    width: '100%', maxWidth: '400px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-lg)',
    padding: '40px',
    boxShadow: 'var(--shadow-card)',
    position: 'relative',
    zIndex: 1,
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px',
  },
  logoText: {
    fontFamily: 'var(--font-mono)', fontSize: '13px', letterSpacing: '0.2em',
    color: 'var(--accent-primary)', fontWeight: 500,
  },
  title: {
    fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700,
    color: 'var(--text-primary)', marginBottom: '8px', lineHeight: 1.2,
  },
  subtitle: {
    color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '32px',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  field: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: {
    fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.1em',
    color: 'var(--text-secondary)', textTransform: 'uppercase',
  },
  error: {
    background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.3)',
    borderRadius: 'var(--radius-sm)', padding: '10px 14px',
    color: 'var(--accent-danger)', fontSize: '13px',
  },
  btn: {
    background: 'var(--accent-primary)', color: '#05050a',
    padding: '12px', borderRadius: 'var(--radius-md)',
    fontWeight: 600, fontSize: '14px', letterSpacing: '0.02em',
    transition: 'var(--transition)',
    ':hover': { opacity: 0.9 },
  },
  btnLoading: { opacity: 0.7 },
  footer: { textAlign: 'center', color: 'var(--text-secondary)', marginTop: '24px', fontSize: '13px' },
  link: { color: 'var(--accent-primary)', textDecoration: 'none' },
  securityBadge: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '6px', marginTop: '24px', padding: '8px',
    background: 'rgba(52, 211, 153, 0.06)', borderRadius: 'var(--radius-sm)',
    color: '#34d399', fontSize: '11px', fontFamily: 'var(--font-mono)',
  },
};
