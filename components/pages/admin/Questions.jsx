'use client';

import { useState } from 'react';
import { useSearchParams } from '@/lib/client/nav.jsx';
import { ImportModal } from './ImportModal.jsx';
import { api } from '@/lib/client/api.js';
import {
  Async, Badge, ConfirmButton, Empty, Modal, PageHeader, Pager, StatusBadge, useDebounced, useLoad, useToast,
} from '@/components/ui.jsx';

export function QuestionEditor({ question, bookId, onClose, onSaved }) {
  const toast = useToast();
  const [q, setQ] = useState(() => question
    ? { text: question.text, explanation: question.explanation, difficulty: question.difficulty, sourceRef: question.sourceRef || '', options: [...question.options], correctIndex: question.correctIndex }
    : { text: '', explanation: '', difficulty: 'medium', sourceRef: '', options: ['', '', '', ''], correctIndex: 0 });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const setOpt = (i, v) => setQ({ ...q, options: q.options.map((o, j) => (j === i ? v : o)) });
  const removeOpt = (i) => setQ({ ...q, options: q.options.filter((_, j) => j !== i), correctIndex: q.correctIndex === i ? 0 : q.correctIndex > i ? q.correctIndex - 1 : q.correctIndex });

  const save = async (e) => {
    e.preventDefault(); setErr(null); setSaving(true);
    try {
      const body = { ...q, sourceRef: q.sourceRef || null, bookId: question?.bookId ?? bookId ?? null };
      const d = question ? await api.put(`/admin/questions/${question.id}`, body) : await api.post('/admin/questions', body);
      toast('Question saved'); onSaved(d.question);
    } catch (x) { setErr(x.message); } finally { setSaving(false); }
  };

  return (
    <Modal wide title={question ? 'Edit question' : 'New question'} onClose={onClose}>
      <form onSubmit={save}>
        {err && <div className="alert error" role="alert">{err}</div>}
        <div className="field"><label htmlFor="qt">Question</label><textarea id="qt" required minLength={5} value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} /></div>
        <div className="field">
          <label>Options <span className="muted">(select the correct one)</span></label>
          {q.options.map((o, i) => (
            <div key={i} className="opt-edit">
              <input type="radio" name="correct" aria-label={`Option ${i + 1} is correct`} checked={q.correctIndex === i} onChange={() => setQ({ ...q, correctIndex: i })} />
              <input required aria-label={`Option ${i + 1}`} value={o} placeholder={`Option ${String.fromCharCode(65 + i)}`} onChange={(e) => setOpt(i, e.target.value)} />
              {q.options.length > 2 && <button type="button" className="icon-btn" aria-label="Remove option" onClick={() => removeOpt(i)}>×</button>}
            </div>
          ))}
          {q.options.length < 6 && <button type="button" className="btn sm" onClick={() => setQ({ ...q, options: [...q.options, ''] })}>+ Add option</button>}
        </div>
        <div className="field"><label htmlFor="qe">Explanation of the correct answer</label><textarea id="qe" value={q.explanation} onChange={(e) => setQ({ ...q, explanation: e.target.value })} /></div>
        <div className="grid2">
          <div className="field"><label htmlFor="qd">Difficulty</label><select id="qd" value={q.difficulty} onChange={(e) => setQ({ ...q, difficulty: e.target.value })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>
          <div className="field"><label htmlFor="qs">Source reference</label><input id="qs" value={q.sourceRef} onChange={(e) => setQ({ ...q, sourceRef: e.target.value })} placeholder="Chapter / page" /></div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function QuestionCard({ q, selected, onSelect, onStatus, onEdit, onDelete }) {
  return (
    <div className="card q-card">
      {onSelect && <input type="checkbox" checked={!!selected} onChange={onSelect} aria-label={`Select question ${q.id}`} style={{ marginTop: '.4rem' }} />}
      <div className="body">
        <div className="row" style={{ gap: '.4rem', marginBottom: '.35rem' }}>
          <StatusBadge value={q.status} /><StatusBadge value={q.difficulty} />
          {q.origin === 'ai' && <Badge kind="blue">AI</Badge>}
          {q.quizCount > 0 && <Badge>in {q.quizCount} quiz{q.quizCount > 1 ? 'zes' : ''}</Badge>}
          <span className="muted small">{q.bookTitle}{q.sourceRef && ` · ${q.sourceRef}`}</span>
        </div>
        <div style={{ fontWeight: 600, whiteSpace: 'pre-wrap' }}>{q.text}</div>
        <ol type="A">{q.options.map((o, i) => <li key={i} className={i === q.correctIndex ? 'correct' : ''}>{o}{i === q.correctIndex && ' ✓'}</li>)}</ol>
        {q.explanation && <div className="explain"><b>Explanation:</b> {q.explanation}</div>}
        <div className="actions">
          {q.status !== 'approved' && <button className="btn sm good" onClick={() => onStatus(q, 'approved')}>Approve</button>}
          {q.status !== 'rejected' && <button className="btn sm danger" onClick={() => onStatus(q, 'rejected')}>Reject</button>}
          {q.status !== 'pending' && <button className="btn sm" onClick={() => onStatus(q, 'pending')}>Mark pending</button>}
          <button className="btn sm" onClick={() => onEdit(q)}>Edit</button>
          <ConfirmButton onConfirm={() => onDelete(q)} message="Delete this question permanently?">Delete</ConfirmButton>
        </div>
      </div>
    </div>
  );
}

const TABS = [['pending', 'To review'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['', 'All']];

export default function Questions() {
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const status = sp.get('status') ?? 'pending';
  const bookId = sp.get('bookId') || '';
  const [difficulty, setDifficulty] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState(new Set());
  const [editing, setEditing] = useState(null); // question | 'new'
  const [importing, setImporting] = useState(sp.get('import') === '1');
  const debounced = useDebounced(search);
  const books = useLoad(() => api.get('/admin/books'));

  const qs = new URLSearchParams({ page, pageSize: 20 });
  if (status) qs.set('status', status);
  if (bookId) qs.set('bookId', bookId);
  if (difficulty) qs.set('difficulty', difficulty);
  if (debounced) qs.set('search', debounced);
  const state = useLoad(() => api.get(`/admin/questions?${qs}`), [status, bookId, difficulty, debounced, page]);

  const change = (fn) => { setPage(1); setSel(new Set()); fn(); };
  const setStatus = (s) => change(() => { const n = new URLSearchParams(sp); n.set('status', s); setSp(n); });

  const setQStatus = async (q, s) => {
    try { await api.patch(`/admin/questions/${q.id}/status`, { status: s }); state.reload(); } catch (x) { toast(x.message, 'err'); }
  };
  const bulk = async (s) => {
    try { const d = await api.post('/admin/questions/bulk-status', { ids: [...sel], status: s }); toast(`${d.updated} question(s) ${s}`); setSel(new Set()); state.reload(); } catch (x) { toast(x.message, 'err'); }
  };
  const remove = async (q) => {
    try { await api.del(`/admin/questions/${q.id}`); toast('Deleted'); state.reload(); } catch (x) { toast(x.message, 'err'); }
  };
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <PageHeader title="Questions" subtitle="Review AI-generated questions. Only approved questions can be added to quizzes.">
        <button className="btn" onClick={() => setImporting(true)}>Import JSON</button>
        <button className="btn primary" onClick={() => setEditing('new')}>+ New question</button>
      </PageHeader>

      <div className="tabs" role="tablist">{TABS.map(([v, l]) => <button key={v} role="tab" aria-selected={status === v} className={`tab ${status === v ? 'on' : ''}`} onClick={() => setStatus(v)}>{l}</button>)}</div>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <div className="grow"><input type="search" placeholder="Search question text…" aria-label="Search" value={search} onChange={(e) => change(() => setSearch(e.target.value))} /></div>
        <select aria-label="Difficulty" style={{ width: 'auto' }} value={difficulty} onChange={(e) => change(() => setDifficulty(e.target.value))}>
          <option value="">Any difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
        <select aria-label="Book" style={{ width: 'auto', maxWidth: 220 }} value={bookId} onChange={(e) => change(() => { const n = new URLSearchParams(sp); e.target.value ? n.set('bookId', e.target.value) : n.delete('bookId'); setSp(n); })}>
          <option value="">All books</option>{books.data?.books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </select>
      </div>

      {sel.size > 0 && (
        <div className="alert info" style={{ position: 'sticky', top: 60, zIndex: 5 }}>
          <span>{sel.size} selected</span>
          <span className="row"><button className="btn sm good" onClick={() => bulk('approved')}>Approve</button><button className="btn sm danger" onClick={() => bulk('rejected')}>Reject</button><button className="btn sm" onClick={() => setSel(new Set())}>Clear</button></span>
        </div>
      )}

      <Async state={state} empty={(d) => !d.questions.length && <Empty title="No questions here">{status === 'pending' ? 'Nothing waiting for review. Generate questions from a book.' : 'Try changing the filters.'}</Empty>}>
        {(d) => (
          <>
            <div className="row" style={{ marginBottom: '.5rem' }}>
              <label className="row small" style={{ margin: 0, fontWeight: 500 }}>
                <input type="checkbox" checked={d.questions.every((q) => sel.has(q.id))} onChange={(e) => setSel(e.target.checked ? new Set(d.questions.map((q) => q.id)) : new Set())} /> Select page
              </label>
            </div>
            {d.questions.map((q) => <QuestionCard key={q.id} q={q} selected={sel.has(q.id)} onSelect={() => toggle(q.id)} onStatus={setQStatus} onEdit={setEditing} onDelete={remove} />)}
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </Async>

      {importing && <ImportModal books={books.data?.books || []} defaultBookId={bookId} onClose={() => setImporting(false)} onDone={() => { setImporting(false); state.reload(); }} />}
      {editing && (
        <QuestionEditor question={editing === 'new' ? null : editing} bookId={bookId || null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload(); }} />
      )}
    </>
  );
}
