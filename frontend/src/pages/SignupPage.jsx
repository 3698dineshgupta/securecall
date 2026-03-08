import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuthStore } from '../store';

export default function SignupPage() {
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuthStore();
  const navigate = useNavigate();

  const validate = () => {
    const e = {};
    if (!form.username || form.username.length < 3) e.username = 'Min 3 characters';
    if (!/^[a-zA-Z0-9_]+$/.test(form.username)) e.username = 'Letters, numbers, underscores only';
    if (!form.email || !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Valid email required';
    if (form.password.length < 8) e.password = 'Min 8 characters';
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(form.password)) {
      e.password = 'Must include uppercase, lowercase, and number';
    }
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const res = await authAPI.signup({
        username: form.username,
        email: form.email,
        password: form.password,
      });
      const { user, accessToken, refreshToken } = res.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setUser(user);
      navigate('/dashboard');
    } catch (err) {
      const serverError = err.response?.data;
      if (serverError?.field) {
        setErrors({ [serverError.field]: serverError.error });
      } else if (serverError?.errors) {
        const e = {};
        serverError.errors.forEach(({ path, msg }) => { e[path] = msg; });
        setErrors(e);
      } else {
        setErrors({ general: serverError?.error || 'Signup failed' });
      }
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

        <h1 style={styles.title}>Create account</h1>
        <p style={styles.subtitle}>Join the encrypted calling network</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Username</label>
            <input
              type="text"
              value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              placeholder="your_handle"
              style={errors.username ? { borderColor: 'var(--accent-danger)' } : {}}
            />
            {errors.username && <span style={styles.fieldError}>{errors.username}</span>}
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="you@example.com"
              style={errors.email ? { borderColor: 'var(--accent-danger)' } : {}}
            />
            {errors.email && <span style={styles.fieldError}>{errors.email}</span>}
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              placeholder="Min 8 chars, mixed case + number"
              style={errors.password ? { borderColor: 'var(--accent-danger)' } : {}}
            />
            {errors.password && <span style={styles.fieldError}>{errors.password}</span>}
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Confirm Password</label>
            <input
              type="password"
              value={form.confirm}
              onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
              placeholder="••••••••"
              style={errors.confirm ? { borderColor: 'var(--accent-danger)' } : {}}
            />
            {errors.confirm && <span style={styles.fieldError}>{errors.confirm}</span>}
          </div>

          {errors.general && <div style={styles.error}>{errors.general}</div>}

          <button
            type="submit"
            disabled={loading}
            style={{ ...styles.btn, ...(loading ? { opacity: 0.7 } : {}) }}
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p style={styles.footer}>
          Already have an account?{' '}
          <Link to="/login" style={styles.link}>Sign in</Link>
        </p>

        <div style={styles.securityBadge}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span>Passwords hashed with bcrypt · E2E encrypted calls</span>
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
    background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(167, 139, 250, 0.06) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  card: {
    width: '100%', maxWidth: '420px',
    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-lg)', padding: '40px',
    boxShadow: 'var(--shadow-card)', position: 'relative', zIndex: 1,
  },
  logo: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' },
  logoText: {
    fontFamily: 'var(--font-mono)', fontSize: '13px', letterSpacing: '0.2em',
    color: 'var(--accent-primary)', fontWeight: 500,
  },
  title: {
    fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700,
    color: 'var(--text-primary)', marginBottom: '8px',
  },
  subtitle: { color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '32px' },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: {
    fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.1em',
    color: 'var(--text-secondary)', textTransform: 'uppercase',
  },
  fieldError: { color: 'var(--accent-danger)', fontSize: '12px' },
  error: {
    background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.3)',
    borderRadius: 'var(--radius-sm)', padding: '10px 14px',
    color: 'var(--accent-danger)', fontSize: '13px',
  },
  btn: {
    background: 'var(--accent-primary)', color: '#05050a',
    padding: '12px', borderRadius: 'var(--radius-md)',
    fontWeight: 600, fontSize: '14px', marginTop: '4px',
  },
  footer: { textAlign: 'center', color: 'var(--text-secondary)', marginTop: '24px', fontSize: '13px' },
  link: { color: 'var(--accent-primary)', textDecoration: 'none' },
  securityBadge: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '6px', marginTop: '24px', padding: '8px',
    background: 'rgba(52, 211, 153, 0.06)', borderRadius: 'var(--radius-sm)',
    color: '#34d399', fontSize: '11px', fontFamily: 'var(--font-mono)',
  },
};
