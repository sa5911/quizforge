'use client';

import { useState } from 'react';
import { Link } from '@/lib/client/nav.jsx';
import { api } from '@/lib/client/api.js';
import { Modal, useToast } from '@/components/ui.jsx';

const EXAMPLE = `{
  "quiz": { "title": "Biology Midterm", "durationMinutes": 60 },
  "questions": [
    {
      "question": "Which organelle produces most of the cell's ATP?",
      "options": ["Mitochondrion", "Ribosome", "Nucleus", "Golgi body"],
      "answer": "Mitochondrion",
      "explanation": "Mitochondria produce ATP through cellular respiration.",
      "difficulty": "easy"
    },
    {
      "question": "Which base pairs with adenine in DNA?",
      "options": ["Cytosine", "Thymine", "Guanine", "Uracil"],
      "answer": "B",
      "explanation": "Adenine pairs with thymine."
    }
  ]
}`;

/** Paste (or upload) JSON questions: no AI required. Can also create a draft quiz from them. */
export function ImportModal({ onClose, onDone, books = [], defaultBookId = '', defaultQuiz = false }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [status, setStatus] = useState('approved');
  const [difficulty, setDifficulty] = useState('medium');
  const [bookId, setBookId] = useState(defaultBookId);
  const [makeQuiz, setMakeQuiz] = useState(defaultQuiz);
  const [quiz, setQuiz] = useState({ title: '', durationMinutes: 60, maxAttempts: 1 });
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [check, setCheck] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const parse = () => {
    try { return JSON.parse(text); } catch (e) { setErr(`Not valid JSON: ${e.message}`); return undefined; }
  };

  const send = async (dryRun) => {
    setErr(null);
    const payload = parse();
    if (payload === undefined) return;
    const embeddedQuiz = !Array.isArray(payload) && payload?.quiz;
    if (makeQuiz && !embeddedQuiz && !quiz.title.trim()) return setErr('Enter a quiz title');
    setBusy(true);
    try {
      const d = await api.post('/admin/questions/import', {
        payload, status: makeQuiz ? 'approved' : status, difficulty, bookId: bookId || null, skipInvalid, dryRun,
        ...(makeQuiz && !embeddedQuiz ? { createQuiz: { ...quiz, title: quiz.title.trim(), durationMinutes: Number(quiz.durationMinutes), maxAttempts: Number(quiz.maxAttempts) } } : {}),
      });
      if (dryRun) setCheck(d);
      else if (d.blocked) setCheck(d);
      else {
        toast(`Imported ${d.created} question(s)${d.quizId ? ' and created a draft quiz' : ''}${d.duplicates ? ` (${d.duplicates} duplicate(s) skipped)` : ''}`);
        onDone(d);
      }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const loadFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { setText(String(r.result)); setCheck(null); };
    r.readAsText(f);
  };

  return (
    <Modal wide title="Import questions from JSON" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy || !text.trim()} onClick={() => send(true)}>Check</button>
        <button className="btn primary" disabled={busy || !text.trim()} onClick={() => send(false)}>{busy ? 'Working…' : 'Import'}</button>
      </>
    }>
      <p className="muted small">Paste a list of questions with their options and correct answer. No AI needed. <button className="btn sm" onClick={() => { setText(EXAMPLE); setCheck(null); }}>Insert example</button></p>
      {err && <div className="alert error" role="alert">{err}</div>}
      <div className="field">
        <textarea aria-label="Questions JSON" spellCheck={false} style={{ minHeight: 220, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '.85rem' }}
          placeholder='[{"question": "...", "options": ["A", "B", "C", "D"], "answer": "B", "explanation": "..."}]' value={text} onChange={(e) => { setText(e.target.value); setCheck(null); }} />
        <div className="hint">Also accepted: <code>question|text</code>, <code>options|choices</code>, <code>answer</code> (option text or letter <b>A–F</b>, or 1-based number), <code>correctIndex</code> (0-based), <code>explanation</code>, <code>difficulty</code>. <label style={{ display: 'inline', fontWeight: 500 }}>Or load a file: <input type="file" accept=".json,application/json" onChange={loadFile} style={{ width: 'auto', minHeight: 0, border: 0, padding: 0 }} /></label></div>
      </div>

      {check && (
        <div className={`alert ${check.invalid.length ? 'warn' : 'ok'}`} style={{ display: 'block' }} role="status">
          <b>{check.valid} of {check.total} question(s) are valid</b>{check.duplicates > 0 && <> · {check.duplicates} duplicate(s) already exist and will be skipped</>}
          {check.invalid.length > 0 && (
            <>
              <ul style={{ margin: '.4rem 0', paddingLeft: '1.2rem' }}>{check.invalid.slice(0, 20).map((x) => <li key={x.index}>Question {x.index}: {x.message}</li>)}</ul>
              <label className="row" style={{ fontWeight: 500 }}><input type="checkbox" checked={skipInvalid} onChange={(e) => setSkipInvalid(e.target.checked)} /> Import the valid ones and skip the invalid</label>
            </>
          )}
        </div>
      )}

      <div className="grid2">
        <div className="field"><label htmlFor="is">Save as</label>
          <select id="is" value={makeQuiz ? 'approved' : status} disabled={makeQuiz} onChange={(e) => setStatus(e.target.value)}><option value="approved">Approved (ready for quizzes)</option><option value="pending">Pending (review first)</option></select></div>
        <div className="field"><label htmlFor="id">Default difficulty</label>
          <select id="id" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>
        <div className="field"><label htmlFor="ib">Book (optional)</label>
          <select id="ib" value={bookId} onChange={(e) => setBookId(e.target.value)}><option value="">— none —</option>{books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select></div>
      </div>

      <label className="row" style={{ fontWeight: 600 }}><input type="checkbox" checked={makeQuiz} onChange={(e) => setMakeQuiz(e.target.checked)} /> Also create a quiz from these questions</label>
      {makeQuiz && (
        <div className="grid2" style={{ marginTop: '.5rem' }}>
          <div className="field"><label htmlFor="qt">Quiz title <span className="muted">(or put a "quiz" object in the JSON)</span></label><input id="qt" value={quiz.title} onChange={(e) => setQuiz({ ...quiz, title: e.target.value })} /></div>
          <div className="field"><label htmlFor="qd">Time limit (minutes)</label><input id="qd" type="number" min={1} max={600} value={quiz.durationMinutes} onChange={(e) => setQuiz({ ...quiz, durationMinutes: e.target.value })} /></div>
          <div className="field"><label htmlFor="qa">Attempts allowed (0 = unlimited)</label><input id="qa" type="number" min={0} max={100} value={quiz.maxAttempts} onChange={(e) => setQuiz({ ...quiz, maxAttempts: e.target.value })} /></div>
        </div>
      )}
      {makeQuiz && <p className="muted small">The quiz is created as a <b>draft</b>. Open it under <Link to="/admin/quizzes">Quizzes</Link> to review and publish.</p>}
    </Modal>
  );
}
