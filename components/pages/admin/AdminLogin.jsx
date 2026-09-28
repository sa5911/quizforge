'use client';

import { useState } from 'react';
import { Link, Navigate, useNavigate } from '@/lib/client/nav.jsx';
import { useAuth } from '@/lib/client/auth.jsx';

export default function AdminLogin() {
  const { user, login, logout } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user?.role === 'admin') return <Navigate to="/admin/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      if (user) await logout(); // switching from a student session
      await login(f.email, f.password, true);
      nav('/admin/dashboard', { replace: true });
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <main className="container">
      <form className="card narrow" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: '1rem' }}><i>Q</i> QuizForge <span className="admin-tag">ADMIN</span></div>
        <h1>Admin sign in</h1>
        <p className="muted">Restricted area for administrators.</p>
        {err && <div className="alert error" role="alert">{err}</div>}
        <div className="field"><label htmlFor="ae">Email</label><input id="ae" type="email" required autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label htmlFor="ap">Password</label><input id="ap" type="password" required autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <button className="btn primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted small" style={{ marginTop: '1rem', textAlign: 'center' }}><Link to="/login">Student sign in</Link></p>
      </form>
    </main>
  );
}
