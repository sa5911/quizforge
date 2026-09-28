'use client';

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from '@/lib/client/nav.jsx';
import { api } from '@/lib/client/api.js';
import {
  Async, ConfirmButton, Empty, Modal, PageHeader, StatusBadge, fmtDate, useLoad, useToast,
} from '@/components/ui.jsx';

const size = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export function Books() {
  const toast = useToast();
  const state = useLoad(() => api.get('/admin/books'));
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef();

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (title.trim()) form.append('title', title.trim());
      await api('/admin/books', { method: 'POST', form });
      toast('Book uploaded and split into sections');
      setFile(null); setTitle(''); if (input.current) input.current.value = '';
      state.reload();
    } catch (x) { toast(x.message, 'err'); } finally { setUploading(false); }
  };

  const remove = async (id) => {
    try { await api.del(`/admin/books/${id}`); toast('Book deleted'); state.reload(); } catch (x) { toast(x.message, 'err'); }
  };

  return (
    <>
      <PageHeader title="Books" subtitle="Upload PDFs (or .txt/.md) to generate questions from." />
      <form className="card" onSubmit={upload}>
        <div
          className={`dropzone ${over ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
        >
          {file ? <p><b>{file.name}</b> <span className="muted">({size(file.size)})</span></p> : <p className="muted">Drag a file here, or choose one</p>}
          <input ref={input} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" onChange={(e) => setFile(e.target.files[0] || null)} />
        </div>
        <div className="row" style={{ marginTop: '1rem' }}>
          <div className="grow"><input placeholder="Title (optional, defaults to file name)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label="Book title" /></div>
          <button className="btn primary" disabled={!file || uploading}>{uploading ? 'Reading file…' : 'Upload'}</button>
        </div>
      </form>

      <div style={{ marginTop: '1.25rem' }}>
        <Async state={state} empty={(d) => !d.books.length && <Empty title="No books yet">Upload your first book above.</Empty>}>
          {(d) => (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Title</th><th>Status</th><th>Sections</th><th>Questions</th><th>Uploaded</th><th /></tr></thead>
                <tbody>
                  {d.books.map((b) => (
                    <tr key={b.id}>
                      <td><Link to={`/admin/books/${b.id}`}><b>{b.title}</b></Link><div className="muted small">{b.filename} · {size(b.sizeBytes)}</div></td>
                      <td><StatusBadge value={b.status} />{b.error && <div className="small" style={{ color: 'var(--red)', maxWidth: 260 }}>{b.error}</div>}</td>
                      <td>{b.sectionCount}</td>
                      <td>{b.questionCount}{b.pendingCount > 0 && <span className="muted small"> ({b.pendingCount} pending)</span>}</td>
                      <td className="nowrap">{fmtDate(b.createdAt)}</td>
                      <td className="right nowrap">
                        <Link className="btn sm" to={`/admin/books/${b.id}`}>Open</Link>{' '}
                        <ConfirmButton onConfirm={() => remove(b.id)} message="Delete this book? Its questions are kept, but the source text is removed.">Delete</ConfirmButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>
    </>
  );
}

export function BookDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const state = useLoad(() => api.get(`/admin/books/${id}`), [id]);

  // Generation is a persisted plan of small batches; the browser drives it one model call at a time.
  const runningJobId = state.data?.jobs.find((j) => j.status === 'running')?.id;
  useEffect(() => {
    if (!runningJobId) return;
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        let job;
        try { job = (await api.post(`/admin/jobs/${runningJobId}/step`)).job; } catch (e) { toast(e.message, 'err'); break; }
        state.reload();
        if (job.status !== 'running') break;
        await new Promise((r) => setTimeout(r, 1500)); // also avoids a hot loop if another tab holds the batch lock
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningJobId]);
  const [form, setForm] = useState({ count: 10, difficulty: 'medium', optionCount: 4 });
  const [picked, setPicked] = useState(null); // null = all sections
  const [starting, setStarting] = useState(false);
  const [view, setView] = useState(null);

  const generate = async (e) => {
    e.preventDefault();
    setStarting(true);
    try {
      await api.post(`/admin/books/${id}/generate`, { ...form, count: Number(form.count), optionCount: Number(form.optionCount), sectionIds: picked?.length ? picked : undefined });
      toast('Generation started'); state.reload();
    } catch (x) { toast(x.message, 'err'); } finally { setStarting(false); }
  };

  const openSection = async (sid) => {
    try { setView((await api.get(`/admin/books/${id}/sections/${sid}`)).section); } catch (x) { toast(x.message, 'err'); }
  };

  const toggle = (sid, all) => {
    const cur = picked ?? all;
    setPicked(cur.includes(sid) ? cur.filter((x) => x !== sid) : [...cur, sid]);
  };

  return (
    <Async state={state}>
      {({ book, sections, jobs, ai }) => {
        const allIds = sections.map((s) => s.id);
        const sel = picked ?? allIds;
        const running = jobs.some((j) => j.status === 'running');
        return (
          <>
            <PageHeader title={book.title} subtitle={`${book.filename} · ${book.pageCount ?? '?'} pages · ${sections.length} sections`}>
              <StatusBadge value={book.status} />
              <Link className="btn" to={`/admin/questions?bookId=${book.id}`}>Review questions ({book.questionCount})</Link>
              <button className="btn" onClick={() => nav('/admin/books')}>← Books</button>
            </PageHeader>

            {book.status === 'ready' && (
              <form className="card" onSubmit={generate}>
                <h2>Generate MCQs with AI <span className="muted small">(optional)</span></h2>
                {!ai?.configured && <div className="alert warn" style={{ display: 'block' }}>No AI provider is configured, so this uses a basic <b>demo generator</b>. To use your own questions instead, <Link to={`/admin/questions?import=1&bookId=${book.id}`}>paste them as JSON</Link>.</div>}
                <div className="grid2">
                  <div className="field"><label htmlFor="cnt">Number of questions</label><input id="cnt" type="number" min={1} max={100} required value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} /></div>
                  <div className="field"><label htmlFor="dif">Difficulty</label>
                    <select id="dif" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>
                  <div className="field"><label htmlFor="oc">Options per question</label>
                    <select id="oc" value={form.optionCount} onChange={(e) => setForm({ ...form, optionCount: e.target.value })}>{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
                </div>
                <div className="hint" style={{ marginBottom: '.75rem' }}>Generated questions are saved as <b>pending</b>. You review them before they can be used in a quiz. Using {sel.length} of {sections.length} sections (choose below).</div>
                <button className="btn primary" disabled={starting || running || !sel.length}>{running ? 'Generating…' : 'Generate questions'}</button>
              </form>
            )}

            {jobs.length > 0 && (
              <div className="card">
                <h2>Generation history</h2>
                <div className="table-wrap" style={{ border: 0 }}>
                  <table>
                    <thead><tr><th>Started</th><th>Status</th><th>Produced</th><th>Settings</th><th>Provider</th></tr></thead>
                    <tbody>{jobs.map((j) => (
                      <tr key={j.id}>
                        <td className="nowrap">{fmtDate(j.createdAt)}</td>
                        <td><StatusBadge value={j.status} />{j.status === 'running' && <span className="muted small"> batch {j.progress.done}/{j.progress.total}</span>}{j.error && <div className="small muted" style={{ maxWidth: 320 }}>{j.error}</div>}</td>
                        <td>{j.produced}/{j.requested}{j.skippedDuplicates > 0 && <span className="muted small"> · {j.skippedDuplicates} duplicates skipped</span>}</td>
                        <td>{j.difficulty}, {j.optionCount} options</td>
                        <td className="muted small">{j.provider || '—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {sections.length > 0 && (
              <div className="card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2>Sections</h2>
                  <div className="row"><button className="btn sm" onClick={() => setPicked(null)}>Select all</button><button className="btn sm" onClick={() => setPicked([])}>None</button></div>
                </div>
                <div className="pick-list" style={{ maxHeight: 520 }}>
                  {sections.map((s) => (
                    <div key={s.id} className="pick-item">
                      <input type="checkbox" aria-label={`Use section ${s.title}`} checked={sel.includes(s.id)} onChange={() => toggle(s.id, allIds)} />
                      <div className="t">
                        <b>{s.title}</b> <span className="muted small">{s.pageStart ? `p. ${s.pageStart}${s.pageEnd !== s.pageStart ? `–${s.pageEnd}` : ''} · ` : ''}{s.chars.toLocaleString()} chars · {s.questionCount} questions</span>
                        <div className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.preview}</div>
                      </div>
                      <button className="btn sm" onClick={() => openSection(s.id)}>Read</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {view && <Modal wide title={view.title} onClose={() => setView(null)}><div style={{ whiteSpace: 'pre-wrap' }}>{view.content}</div></Modal>}
          </>
        );
      }}
    </Async>
  );
}
