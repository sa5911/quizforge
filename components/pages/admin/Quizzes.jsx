'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from '@/lib/client/nav.jsx';
import { ImportModal } from './ImportModal.jsx';
import { api } from '@/lib/client/api.js';
import {
  Async, ConfirmButton, Empty, PageHeader, Spinner, StatusBadge, fmtDate, useDebounced, useLoad, useToast,
} from '@/components/ui.jsx';

export function AdminQuizzes() {
  const toast = useToast();
  const state = useLoad(() => api.get('/admin/quizzes'));
  const nav = useNavigate();
  const [importing, setImporting] = useState(false);
  const act = async (fn, msg) => {
    try { await fn(); if (msg) toast(msg); state.reload(); } catch (x) { toast(x.message, 'err'); }
  };
  return (
    <>
      <PageHeader title="Quizzes">
        <button className="btn" onClick={() => setImporting(true)}>Create from JSON</button>
        <Link className="btn primary" to="/admin/quizzes/create">+ Create quiz</Link>
      </PageHeader>
      {importing && <ImportModal defaultQuiz onClose={() => setImporting(false)} onDone={(d) => { setImporting(false); d.quizId ? nav(`/admin/quizzes/${d.quizId}`) : state.reload(); }} />}
      <Async state={state} empty={(d) => !d.quizzes.length && <Empty title="No quizzes yet">Create a quiz from your approved questions.</Empty>}>
        {(d) => (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Title</th><th>Status</th><th>Questions</th><th>Duration</th><th>Attempts</th><th>Updated</th><th /></tr></thead>
              <tbody>
                {d.quizzes.map((q) => (
                  <tr key={q.id}>
                    <td><Link to={`/admin/quizzes/${q.id}`}><b>{q.title}</b></Link></td>
                    <td><StatusBadge value={q.status} /></td>
                    <td>{q.questionCount}</td>
                    <td>{q.durationMinutes} min</td>
                    <td><Link to={`/admin/results?quizId=${q.id}`}>{q.attemptCount}</Link></td>
                    <td className="nowrap">{fmtDate(q.updatedAt)}</td>
                    <td className="right nowrap">
                      {q.status === 'draft'
                        ? <button className="btn sm good" onClick={() => act(() => api.post(`/admin/quizzes/${q.id}/publish`), 'Published')}>Publish</button>
                        : <button className="btn sm" onClick={() => act(() => api.post(`/admin/quizzes/${q.id}/unpublish`), 'Unpublished')}>Unpublish</button>}{' '}
                      <Link className="btn sm" to={`/admin/quizzes/${q.id}`}>Edit</Link>{' '}
                      <ConfirmButton onConfirm={() => act(() => api.del(`/admin/quizzes/${q.id}`), 'Deleted')} message="Delete this quiz?">Delete</ConfirmButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
    </>
  );
}

const PRESETS = [30, 60, 90];

/** Used for both /admin/quizzes/create and /admin/quizzes/:id */
export function QuizEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const isNew = !id;
  const loaded = useLoad(() => (isNew ? Promise.resolve(null) : api.get(`/admin/quizzes/${id}`)), [id]);

  const [form, setForm] = useState({ title: '', description: '', instructions: '', durationMinutes: 60, maxAttempts: 1 });
  const [chosen, setChosen] = useState([]); // question objects, in order
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const d = loaded.data;
    if (!d) return;
    setForm({ title: d.quiz.title, description: d.quiz.description, instructions: d.quiz.instructions, durationMinutes: d.quiz.durationMinutes, maxAttempts: d.quiz.maxAttempts });
    setChosen(d.questions);
    setDirty(false);
  }, [loaded.data]);

  const edit = (patch) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };

  // pool of approved questions
  const [search, setSearch] = useState('');
  const [bookId, setBookId] = useState('');
  const debounced = useDebounced(search);
  const books = useLoad(() => api.get('/admin/books'));
  const pool = useLoad(() => {
    const qs = new URLSearchParams({ status: 'approved', pageSize: 100 });
    if (debounced) qs.set('search', debounced);
    if (bookId) qs.set('bookId', bookId);
    return api.get(`/admin/questions?${qs}`);
  }, [debounced, bookId]);
  const chosenIds = useMemo(() => new Set(chosen.map((q) => q.id)), [chosen]);

  const add = (q) => { setChosen((c) => [...c, q]); setDirty(true); };
  const remove = (qid) => { setChosen((c) => c.filter((q) => q.id !== qid)); setDirty(true); };
  const move = (i, d) => setChosen((c) => { const n = [...c]; [n[i], n[i + d]] = [n[i + d], n[i]]; setDirty(true); return n; });
  const addAllVisible = () => { const fresh = (pool.data?.questions || []).filter((q) => !chosenIds.has(q.id)); setChosen((c) => [...c, ...fresh]); setDirty(true); };

  const save = async (publish) => {
    setErr(null); setSaving(true);
    try {
      const body = { ...form, durationMinutes: Number(form.durationMinutes), maxAttempts: Number(form.maxAttempts) };
      const quizId = isNew ? (await api.post('/admin/quizzes', body)).quiz.id : (await api.put(`/admin/quizzes/${id}`, body), id);
      await api.put(`/admin/quizzes/${quizId}/questions`, { questionIds: chosen.map((q) => q.id) });
      if (publish === true) await api.post(`/admin/quizzes/${quizId}/publish`);
      if (publish === false) await api.post(`/admin/quizzes/${quizId}/unpublish`);
      toast(publish ? 'Saved and published' : 'Quiz saved');
      setDirty(false);
      if (isNew) nav(`/admin/quizzes/${quizId}`, { replace: true }); else loaded.reload();
    } catch (x) { setErr(x.message); window.scrollTo({ top: 0, behavior: 'smooth' }); } finally { setSaving(false); }
  };

  if (!isNew && loaded.loading && !loaded.data) return <Spinner />;
  const quiz = loaded.data?.quiz;
  const custom = !PRESETS.includes(Number(form.durationMinutes));

  return (
    <>
      <PageHeader title={isNew ? 'Create quiz' : 'Edit quiz'} subtitle={quiz ? `${quiz.attemptCount} attempt(s) so far. Changes never alter attempts already started.` : 'Set details, choose questions, then publish.'}>
        {quiz && <StatusBadge value={quiz.status} />}
        <Link className="btn" to="/admin/quizzes">← Quizzes</Link>
      </PageHeader>
      {err && <div className="alert error" role="alert">{err}</div>}

      <div className="card">
        <h2>Details</h2>
        <div className="field"><label htmlFor="t">Title</label><input id="t" required maxLength={200} value={form.title} onChange={(e) => edit({ title: e.target.value })} /></div>
        <div className="field"><label htmlFor="d">Description</label><textarea id="d" style={{ minHeight: 60 }} value={form.description} onChange={(e) => edit({ description: e.target.value })} /></div>
        <div className="field"><label htmlFor="i">Instructions for students</label><textarea id="i" value={form.instructions} onChange={(e) => edit({ instructions: e.target.value })} placeholder="Shown before the quiz starts" /></div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="dur">Time limit (minutes)</label>
            <div className="row" style={{ gap: '.4rem' }}>
              <input id="dur" type="number" min={1} max={600} style={{ width: 110 }} value={form.durationMinutes} onChange={(e) => edit({ durationMinutes: e.target.value })} />
              {PRESETS.map((p) => <button key={p} type="button" className={`tab ${Number(form.durationMinutes) === p ? 'on' : ''}`} onClick={() => edit({ durationMinutes: p })}>{p}</button>)}
            </div>
            <div className="hint">Default is 60 minutes.{custom && ' Custom duration.'} Enforced by the server.</div>
          </div>
          <div className="field">
            <label htmlFor="ma">Attempts allowed per student</label>
            <input id="ma" type="number" min={0} max={100} value={form.maxAttempts} onChange={(e) => edit({ maxAttempts: e.target.value })} />
            <div className="hint">0 = unlimited.</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Questions <span className="muted">({chosen.length} selected — this is the quiz's total)</span></h2>
        </div>
        <div className="picker">
          <div>
            <h3>In this quiz</h3>
            <div className="pick-list">
              {!chosen.length && <div className="pick-item muted">No questions selected. Add some from the right.</div>}
              {chosen.map((q, i) => (
                <div key={q.id} className="pick-item">
                  <span className="muted small">{i + 1}.</span>
                  <div className="t">{q.text}</div>
                  <button className="btn sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                  <button className="btn sm" disabled={i === chosen.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                  <button className="btn sm danger" onClick={() => remove(q.id)} aria-label="Remove">×</button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3>Approved question pool</h3>
            <div className="row" style={{ marginBottom: '.5rem' }}>
              <div className="grow"><input type="search" placeholder="Search…" aria-label="Search pool" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <select aria-label="Book" style={{ width: 'auto', maxWidth: 180 }} value={bookId} onChange={(e) => setBookId(e.target.value)}>
                <option value="">All books</option>{books.data?.books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
              <button className="btn sm" onClick={addAllVisible}>Add all shown</button>
            </div>
            <div className="pick-list">
              {pool.loading && !pool.data && <Spinner />}
              {pool.data && !pool.data.questions.length && <div className="pick-item muted">No approved questions. <Link to="/admin/questions">Review questions</Link></div>}
              {pool.data?.questions.map((q) => (
                <div key={q.id} className="pick-item">
                  <div className="t">{q.text}<div className="muted small">{q.difficulty}{q.bookTitle && ` · ${q.bookTitle}`}</div></div>
                  <button className="btn sm" disabled={chosenIds.has(q.id)} onClick={() => add(q)}>{chosenIds.has(q.id) ? 'Added' : 'Add'}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: '1rem', justifyContent: 'flex-end' }}>
        {dirty && <span className="muted small">Unsaved changes</span>}
        {!isNew && quiz?.status === 'published' && <button className="btn" disabled={saving} onClick={() => save(false)}>Save & unpublish</button>}
        <button className="btn" disabled={saving || !form.title.trim()} onClick={() => save(undefined)}>{saving ? 'Saving…' : 'Save draft'}</button>
        <button className="btn primary" disabled={saving || !form.title.trim() || !chosen.length} onClick={() => save(true)}>Save & publish</button>
      </div>
    </>
  );
}
