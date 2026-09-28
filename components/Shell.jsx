'use client';
import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Link, NavLink, Navigate, useNavigate } from '@/lib/client/nav.jsx';
import { useAuth } from '@/lib/client/auth.jsx';
import { Spinner } from '@/components/ui.jsx';

/** Client-side route guard. (Data is protected by the API, this only decides what to render.) */
export function Guard({ role, children }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  if (loading) return <Spinner />;
  if (!user) {
    const from = encodeURIComponent(pathname + (search ? `?${search}` : ''));
    return <Navigate to={`${role === 'admin' ? '/admin/login' : '/login'}?next=${from}`} />;
  }
  if (role === 'admin' && user.role !== 'admin') return <Navigate to="/" />;
  return children;
}

function Nav({ admin }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const links = admin
    ? [['/admin/dashboard', 'Dashboard'], ['/admin/books', 'Books'], ['/admin/questions', 'Questions'], ['/admin/quizzes', 'Quizzes'], ['/admin/users', 'Users'], ['/admin/results', 'Results']]
    : [['/quizzes', 'Quizzes'], ['/history', 'History'], ['/profile', 'Profile']];
  const out = async () => { await logout(); nav(admin ? '/admin/login' : '/'); };
  return (
    <header className="nav">
      <div className="nav-in">
        <Link to={admin ? '/admin/dashboard' : '/'} className="brand"><i>Q</i> QuizForge{admin && <span className="admin-tag">ADMIN</span>}</Link>
        <button className="icon-btn menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>☰</button>
        <nav className={`nav-links ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
          {user && links.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>)}
          {user && user.role === 'admin' && !admin && <NavLink to="/admin/dashboard">Admin</NavLink>}
          {user && admin && <NavLink to="/quizzes">Student view</NavLink>}
          {user ? <button onClick={out}>Sign out</button> : (
            <>
              <NavLink to="/login">Sign in</NavLink>
              <NavLink to="/register">Register</NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function Shell({ admin, children }) {
  return (
    <>
      <Nav admin={admin} />
      <main className="container">{children}</main>
    </>
  );
}
