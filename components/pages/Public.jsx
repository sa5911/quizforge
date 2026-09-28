'use client';

import { useState } from 'react';
import { Link, Navigate, safeNext, useNavigate, useSearchParams } from '@/lib/client/nav.jsx';
import { useAuth } from '@/lib/client/auth.jsx';

export function Home() {
  const { user } = useAuth();
  return (
    <>
      <section className="hero">
        <h1>Practice smarter with timed quizzes</h1>
        <p className="muted">Take quizzes built from real course material, track your scores, and review every answer with explanations.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {user ? <Link className="btn primary lg" to="/quizzes">Browse quizzes</Link> : (
            <>
              <Link className="btn primary lg" to="/register">Get started</Link>
              <Link className="btn lg" to="/login">Sign in</Link>
            </>
          )}
        </div>
      </section>
      <div className="features">
        <div className="card"><h3>⏱ Fair, timed attempts</h3><p className="muted small">The clock runs on the server. Refreshing the page never resets it, and time-outs are submitted automatically.</p></div>
        <div className="card"><h3>📊 Instant results</h3><p className="muted small">See your score, percentage and time taken, then review each question with the correct answer explained.</p></div>
        <div className="card"><h3>📚 Built from books</h3><p className="muted small">Questions are generated from the source material and reviewed by an instructor before they reach you.</p></div>
      </div>
    </>
  );
}

function AuthForm({ mode }) {
  const { user, login, register } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = safeNext(sp.get('next'));
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const isReg = mode === 'register';
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  if (user) return <Navigate to={user.role === 'admin' && !next ? '/admin/dashboard' : next || '/quizzes'} />;

  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const u = isReg ? await register(f.name, f.email, f.password) : await login(f.email, f.password);
      nav(next || (u.role === 'admin' ? '/admin/dashboard' : '/quizzes'), { replace: true });
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <form className="card narrow" onSubmit={submit}>
      <h1>{isReg ? 'Create your account' : 'Welcome back'}</h1>
      <p className="muted">{isReg ? 'Register to take quizzes.' : 'Sign in to continue.'}</p>
      {err && <div className="alert error" role="alert">{err}</div>}
      {isReg && <div className="field"><label htmlFor="name">Full name</label><input id="name" required minLength={2} autoComplete="name" value={f.name} onChange={set('name')} /></div>}
      <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" required autoComplete="email" value={f.email} onChange={set('email')} /></div>
      <div className="field">
        <label htmlFor="pw">Password</label>
        <input id="pw" type="password" required minLength={isReg ? 8 : 1} autoComplete={isReg ? 'new-password' : 'current-password'} value={f.password} onChange={set('password')} />
        {isReg && <div className="hint">At least 8 characters.</div>}
      </div>
      <button className="btn primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Please wait…' : isReg ? 'Create account' : 'Sign in'}</button>
      <p className="muted small" style={{ marginTop: '1rem', textAlign: 'center' }}>
        {isReg ? <>Already registered? <Link to="/login">Sign in</Link></> : <>New here? <Link to="/register">Create an account</Link></>}
      </p>
    </form>
  );
}

export const Login = () => <AuthForm mode="login" />;
export const Register = () => <AuthForm mode="register" />;
