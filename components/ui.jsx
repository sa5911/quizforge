'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/* ---------- formatting ---------- */
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export function fmtDuration(sec) {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}h ${m}m ${s}s` : m ? `${m}m ${s}s` : `${s}s`;
}
export const fmtClock = (sec) => {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(r).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/* ---------- data loading ---------- */
/** Loads data on mount / when deps change; optional polling while `poll(data)` is true. */
export function useLoad(fn, deps = [], { poll } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const load = useCallback(async (silent) => {
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      setState((s) => ({ data: silent ? s.data : null, error, loading: false }));
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, deps);
  useEffect(() => {
    if (!poll || !poll(state.data)) return;
    const t = setInterval(() => load(true), 2500);
    return () => clearInterval(t);
  }, [state.data, poll, load]);
  return { ...state, reload: () => load(true), setData: (data) => setState((s) => ({ ...s, data })) };
}

/* ---------- toast ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- small components ---------- */
export const Spinner = ({ label = 'Loading…' }) => (
  <div className="center-pad" role="status"><span className="spinner" aria-hidden="true" /><span className="muted">{label}</span></div>
);

export const Empty = ({ title, children }) => (
  <div className="empty"><div className="empty-icon" aria-hidden="true">∅</div><h3>{title}</h3>{children && <p className="muted">{children}</p>}</div>
);

export const ErrorBox = ({ error, onRetry }) => (
  <div className="alert error" role="alert">
    <span>{error?.message || 'Something went wrong'}</span>
    {onRetry && <button className="btn sm" onClick={onRetry}>Retry</button>}
  </div>
);

/** Renders loading / error / children(data). */
export function Async({ state, children, empty }) {
  if (state.loading && !state.data) return <Spinner />;
  if (state.error && !state.data) return <ErrorBox error={state.error} onRetry={state.reload} />;
  if (!state.data) return null;
  return empty?.(state.data) || children(state.data);
}

export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close">×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Badge = ({ kind, children }) => <span className={`badge ${kind || ''}`}>{children}</span>;
export const statusKind = { approved: 'green', published: 'green', ready: 'green', done: 'green', pending: 'amber', draft: 'gray', processing: 'blue', running: 'blue', queued: 'blue', rejected: 'red', failed: 'red', easy: 'green', medium: 'amber', hard: 'red' };
export const StatusBadge = ({ value }) => <Badge kind={statusKind[value]}>{value}</Badge>;

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</button>
      <span className="muted">Page {page} of {pages} · {total} total</span>
      <button className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function ConfirmButton({ children, onConfirm, message = 'Are you sure?', className = 'btn danger sm', disabled }) {
  return (
    <button className={className} disabled={disabled} onClick={() => window.confirm(message) && onConfirm()}>{children}</button>
  );
}
