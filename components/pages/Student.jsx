'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from '@/lib/client/nav.jsx';
import { api } from '@/lib/client/api.js';
import { useAuth } from '@/lib/client/auth.jsx';
import {
  Async, Badge, Empty, ErrorBox, Modal, PageHeader, Spinner, fmtClock, fmtDate, fmtDuration, useLoad, useToast,
} from '@/components/ui.jsx';

/* ------------------------------------------------------------------ quiz list */
export function QuizList() {
  const state = useLoad(() => api.get('/quizzes'));
  return (
    <>
      <PageHeader title="Available quizzes" subtitle="Pick a quiz to see its details before you start." />
      <Async state={state} empty={(d) => !d.quizzes.length && <Empty title="No quizzes yet">Check back soon. Your instructor hasn't published any quizzes.</Empty>}>
        {(d) => (
          <div className="cards">
            {d.quizzes.map((q) => (
              <div key={q.id} className="card quiz-card">
                <h2>{q.title}</h2>
                {q.description && <p className="muted small">{q.description}</p>}
                <div className="meta">
                  <span>❓ {q.questionCount} questions</span>
                  <span>⏱ {q.durationMinutes} min</span>
                </div>
                <div className="row">
                  {q.inProgressAttemptId && <Badge kind="blue">In progress</Badge>}
                  {q.bestPercentage != null && <Badge kind="green">Best {q.bestPercentage}%</Badge>}
                  {q.maxAttempts > 0 && <span className="muted small">{q.attemptsUsed}/{q.maxAttempts} attempts</span>}
                </div>
                <div className="foot"><Link className="btn primary" to={`/quiz/${q.id}`}>{q.inProgressAttemptId ? 'Resume' : q.attemptsUsed ? 'View / retake' : 'View quiz'}</Link></div>
              </div>
            ))}
          </div>
        )}
      </Async>
    </>
  );
}

/* ------------------------------------------------------------------ quiz page: intro + player */
export function QuizPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [attempt, setAttempt] = useState(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState(null);
  const info = useLoad(() => api.get(`/quizzes/${id}`), [id]);

  const start = useCallback(async () => {
    setStarting(true); setErr(null);
    try { setAttempt((await api.post(`/quizzes/${id}/attempts`)).attempt); }
    catch (e) { setErr(e); } finally { setStarting(false); }
  }, [id]);

  // A refresh during a quiz lands here again: resume the open attempt straight away.
  const autoResumed = useRef(false);
  useEffect(() => {
    const q = info.data?.quiz;
    if (q?.inProgressAttemptId && !autoResumed.current) { autoResumed.current = true; start(); }
  }, [info.data, start]);

  if (attempt) return <Player attempt={attempt} onDone={() => nav(`/quiz/${id}/result?attempt=${attempt.id}`, { replace: true })} />;

  return (
    <>
      <div className="nav"><div className="nav-in"><Link to="/quizzes" className="brand"><i>Q</i> QuizForge</Link><Link to="/quizzes" className="btn sm">← All quizzes</Link></div></div>
      <main className="container">
        <Async state={info}>
          {({ quiz }) => (
            <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
              <h1>{quiz.title}</h1>
              {quiz.description && <p className="muted">{quiz.description}</p>}
              <div className="stats" style={{ marginTop: '1rem' }}>
                <div className="stat"><b>{quiz.questionCount}</b><span>Questions</span></div>
                <div className="stat"><b>{quiz.durationMinutes} min</b><span>Time limit</span></div>
                <div className="stat"><b>{quiz.maxAttempts === 0 ? '∞' : `${quiz.attemptsUsed}/${quiz.maxAttempts}`}</b><span>Attempts used</span></div>
              </div>
              <h3>Instructions</h3>
              <div className="instructions">
                {quiz.instructions || 'Answer all questions. You can move between questions and change answers until you submit.'}
                {'\n\n'}• The timer is controlled by the server and keeps running if you refresh or close the page.
                {'\n'}• The quiz is submitted automatically when time runs out.
                {'\n'}• Once submitted, you cannot change your answers.
              </div>
              {err && <div className="alert error" style={{ marginTop: '1rem' }} role="alert">{err.message}</div>}
              <div className="row" style={{ marginTop: '1.25rem' }}>
                <button className="btn primary lg" onClick={start} disabled={starting}>{starting ? 'Starting…' : quiz.inProgressAttemptId ? 'Resume quiz' : 'Start quiz'}</button>
                {quiz.lastAttemptId && <Link className="btn" to={`/quiz/${quiz.id}/result?attempt=${quiz.lastAttemptId}`}>Last result</Link>}
              </div>
            </div>
          )}
        </Async>
      </main>
    </>
  );
}

/* ------------------------------------------------------------------ player */
function Player({ attempt: initial, onDone }) {
  const toast = useToast();
  const [attempt, setAttempt] = useState(initial);
  const [answers, setAnswers] = useState(initial.answers || {});
  const [idx, setIdx] = useState(0);
  const [remaining, setRemaining] = useState(initial.remainingSeconds);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const deadline = useRef(performance.now() + initial.remainingSeconds * 1000); // monotonic clock, immune to device clock changes
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submitted = useRef(false);

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    for (let i = 0; i < 4; i++) {
      try {
        await api.post(`/attempts/${attempt.id}/submit`, { answers: answersRef.current });
        return onDone();
      } catch (e) {
        if (e.status === 401) break;
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
    }
    submitted.current = false;
    setSubmitting(false);
    toast('Could not submit. Check your connection and try again.', 'err');
  }, [attempt.id, onDone, toast]);

  // countdown: derived from the server-provided deadline, auto-submit at zero
  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000));
      setRemaining(left);
      if (left <= 0) submit();
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [submit]);

  // re-sync with the server (tab was throttled/asleep, or the admin/network drifted)
  const resync = useCallback(async () => {
    try {
      const { attempt: a } = await api.get(`/attempts/${attempt.id}`);
      if (a.status !== 'in_progress') return onDone();
      deadline.current = performance.now() + a.remainingSeconds * 1000;
      setAnswers((cur) => ({ ...a.answers, ...cur }));
    } catch { /* offline: keep local countdown */ }
  }, [attempt.id, onDone]);
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && resync();
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(resync, 60_000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(t); };
  }, [resync]);

  const q = attempt.questions[idx];
  const answeredCount = Object.keys(answers).length;

  const choose = async (optionId) => {
    const prev = answers[q.id];
    setAnswers((a) => ({ ...a, [q.id]: optionId }));
    try {
      await api.put(`/attempts/${attempt.id}/answers`, { questionId: q.id, optionId });
    } catch (e) {
      if (e.status === 409) return onDone(); // already submitted / time is up
      toast('Answer not saved yet. It will be sent again when you submit.', 'err');
      if (e.status === 400) setAnswers((a) => ({ ...a, [q.id]: prev }));
    }
  };

  const cls = remaining <= 60 ? 'critical' : remaining <= 300 ? 'low' : '';
  const unanswered = attempt.questions.length - answeredCount;

  return (
    <>
      <div className="player-bar">
        <div className="player-bar-in">
          <div style={{ minWidth: 0 }}>
            <div className="player-title">{attempt.title}</div>
            <div className="muted small">{answeredCount}/{attempt.questions.length} answered</div>
          </div>
          <div className={`timer ${cls}`} role="timer" aria-label={`Time remaining ${fmtClock(remaining)}`}>⏱ {fmtClock(remaining)}</div>
        </div>
        <div className="progress"><div style={{ width: `${(answeredCount / attempt.questions.length) * 100}%` }} /></div>
      </div>

      <main className="container">
        <div className="player">
          <section className="card" aria-live="polite">
            <div className="muted small" style={{ marginBottom: '.5rem' }}>Question {idx + 1} of {attempt.questions.length}</div>
            <div className="q-text">{q.text}</div>
            <div role="radiogroup" aria-label="Answer options">
              {q.options.map((o, i) => (
                <label key={o.id} className={`opt ${answers[q.id] === o.id ? 'sel' : ''}`}>
                  <input type="radio" name={`q${q.id}`} checked={answers[q.id] === o.id} onChange={() => choose(o.id)} disabled={submitting} />
                  <span className="letter">{String.fromCharCode(65 + i)}.</span>
                  <span>{o.text}</span>
                </label>
              ))}
            </div>
            {answers[q.id] != null && <button className="btn sm" onClick={() => choose(null)} disabled={submitting}>Clear answer</button>}
            <div className="q-nav">
              <button className="btn" onClick={() => setIdx(idx - 1)} disabled={idx === 0}>← Previous</button>
              {idx < attempt.questions.length - 1
                ? <button className="btn primary" onClick={() => setIdx(idx + 1)}>Next →</button>
                : <button className="btn primary" onClick={() => setConfirm(true)} disabled={submitting}>Finish & submit</button>}
            </div>
          </section>

          <aside className="card">
            <h3>Questions</h3>
            <div className="palette">
              {attempt.questions.map((x, i) => (
                <button key={x.id} className={`pal ${answers[x.id] != null ? 'answered' : ''} ${i === idx ? 'current' : ''}`} onClick={() => setIdx(i)}
                  aria-label={`Question ${i + 1}, ${answers[x.id] != null ? 'answered' : 'unanswered'}`}>{i + 1}</button>
              ))}
            </div>
            <div className="legend"><span><i className="a" />Answered</span><span><i />Unanswered</span></div>
            <button className="btn primary" style={{ width: '100%', marginTop: '1rem' }} onClick={() => setConfirm(true)} disabled={submitting}>Submit quiz</button>
          </aside>
        </div>
      </main>

      {confirm && (
        <Modal title="Submit quiz?" onClose={() => setConfirm(false)} footer={
          <>
            <button className="btn" onClick={() => setConfirm(false)}>Keep working</button>
            <button className="btn primary" onClick={() => { setConfirm(false); submit(); }}>Submit now</button>
          </>
        }>
          {unanswered > 0
            ? <div className="alert warn">You have <b>{unanswered}</b> unanswered question{unanswered > 1 ? 's' : ''}.</div>
            : <p>You answered every question.</p>}
          <p className="muted">You can't change your answers after submitting. Time left: <b>{fmtClock(remaining)}</b>.</p>
        </Modal>
      )}
      {submitting && <div className="modal-back"><div className="card center-pad"><Spinner label="Submitting…" /></div></div>}
    </>
  );
}

/* ------------------------------------------------------------------ result */
export function ResultView({ result }) {
  const pct = result.percentage;
  const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)';
  return (
    <>
      <div className="card score-hero">
        <div className="ring" style={{ '--p': pct, '--ring': color }}><div>{Math.round(pct)}%</div></div>
        <h2>{result.quizTitle}</h2>
        <p className="muted">{result.score} / {result.totalQuestions} points{result.submitReason === 'timeout' && ' · auto-submitted when time ran out'}</p>
      </div>
      <div className="stats" style={{ marginTop: '1rem' }}>
        <div className="stat"><b>{result.totalQuestions}</b><span>Total questions</span></div>
        <div className="stat"><b style={{ color: 'var(--green)' }}>{result.correct}</b><span>Correct</span></div>
        <div className="stat"><b style={{ color: 'var(--red)' }}>{result.incorrect}</b><span>Incorrect</span></div>
        <div className="stat"><b style={{ color: 'var(--amber)' }}>{result.unanswered}</b><span>Unanswered</span></div>
        <div className="stat"><b>{result.score}</b><span>Score</span></div>
        <div className="stat"><b>{fmtDuration(result.timeTakenSeconds)}</b><span>Time taken (of {result.durationMinutes} min)</span></div>
      </div>
      {result.review && (
        <div className="card">
          <h2>Review</h2>
          {result.review.map((q) => (
            <div key={q.position} className={`review-q ${q.selected == null ? 'skip' : q.isCorrect ? 'ok' : 'bad'}`}>
              <div className="muted small">Question {q.position} · {q.selected == null ? 'Unanswered' : q.isCorrect ? 'Correct' : 'Incorrect'}</div>
              <p style={{ fontWeight: 600, whiteSpace: 'pre-wrap' }}>{q.text}</p>
              {q.options.map((o, i) => (
                <div key={o.id} className={`rev-opt ${o.correct ? 'correct' : q.selected === o.id ? 'wrong' : ''}`}>
                  {String.fromCharCode(65 + i)}. {o.text}
                  {o.correct && <b> ✓ correct</b>}{q.selected === o.id && !o.correct && <b> ✗ your answer</b>}{q.selected === o.id && o.correct && <b> (your answer)</b>}
                </div>
              ))}
              {q.explanation && <div className="explain"><b>Explanation:</b> {q.explanation}{q.sourceRef && <div className="muted small">Source: {q.sourceRef}</div>}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function ResultPage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const state = useLoad(async () => {
    let attemptId = sp.get('attempt');
    if (!attemptId) attemptId = (await api.get(`/quizzes/${id}`)).quiz.lastAttemptId;
    if (!attemptId) throw new Error('No completed attempt found for this quiz');
    return api.get(`/attempts/${attemptId}/result`);
  }, [id, sp.get('attempt')]);
  return (
    <>
      <PageHeader title="Your result"><Link className="btn" to="/history">History</Link><Link className="btn primary" to="/quizzes">All quizzes</Link></PageHeader>
      <Async state={state}>{(d) => <ResultView result={d.result} />}</Async>
    </>
  );
}

/* ------------------------------------------------------------------ history */
export function History() {
  const state = useLoad(() => api.get('/attempts'));
  return (
    <>
      <PageHeader title="Quiz history" subtitle="All your previous attempts." />
      <Async state={state} empty={(d) => !d.attempts.length && <Empty title="No attempts yet"><Link to="/quizzes">Take your first quiz</Link></Empty>}>
        {(d) => (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Quiz</th><th>Date</th><th>Score</th><th>%</th><th>Time</th><th /></tr></thead>
              <tbody>
                {d.attempts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.quizTitle}</td>
                    <td className="nowrap">{fmtDate(a.startedAt)}</td>
                    <td>{a.status === 'in_progress' ? <Badge kind="blue">In progress</Badge> : `${a.correct}/${a.totalQuestions}`}</td>
                    <td>{a.percentage != null ? `${a.percentage}%` : '—'}</td>
                    <td className="nowrap">{fmtDuration(a.timeTakenSeconds)}{a.submitReason === 'timeout' && <> <Badge kind="amber">timed out</Badge></>}</td>
                    <td className="right">
                      {a.status === 'in_progress' ? <Link className="btn sm primary" to={`/quiz/${a.quizId}`}>Resume</Link> : <Link className="btn sm" to={`/quiz/${a.quizId}/result?attempt=${a.id}`}>View</Link>}
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

/* ------------------------------------------------------------------ profile */
export function Profile() {
  const { user, setUser, changePassword } = useAuth();
  const toast = useToast();
  const hist = useLoad(() => api.get('/attempts'));
  const [name, setName] = useState(user.name);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [err, setErr] = useState(null);

  const done = (hist.data?.attempts || []).filter((a) => a.percentage != null);
  const avg = done.length ? Math.round((done.reduce((s, a) => s + a.percentage, 0) / done.length) * 10) / 10 : null;

  const saveName = async (e) => {
    e.preventDefault();
    try { setUser((await api.patch('/auth/me', { name })).user); toast('Profile updated'); } catch (x) { toast(x.message, 'err'); }
  };
  const savePw = async (e) => {
    e.preventDefault(); setErr(null);
    try { await changePassword(pw.currentPassword, pw.newPassword); setPw({ currentPassword: '', newPassword: '' }); toast('Password changed'); } catch (x) { setErr(x.message); }
  };

  return (
    <>
      <PageHeader title="Profile" subtitle={user.email} />
      <div className="stats">
        <div className="stat"><b>{done.length}</b><span>Quizzes completed</span></div>
        <div className="stat"><b>{avg != null ? `${avg}%` : '—'}</b><span>Average score</span></div>
        <div className="stat"><b>{done.length ? `${Math.max(...done.map((a) => a.percentage))}%` : '—'}</b><span>Best score</span></div>
      </div>
      <div className="grid2">
        <form className="card" onSubmit={saveName}>
          <h2>Your details</h2>
          <div className="field"><label htmlFor="pn">Name</label><input id="pn" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></div>
          <button className="btn primary">Save</button>
        </form>
        <form className="card" onSubmit={savePw} style={{ marginTop: 0 }}>
          <h2>Change password</h2>
          {err && <div className="alert error">{err}</div>}
          <div className="field"><label htmlFor="cp">Current password</label><input id="cp" type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></div>
          <div className="field"><label htmlFor="np">New password</label><input id="np" type="password" autoComplete="new-password" minLength={8} required value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></div>
          <button className="btn primary">Update password</button>
        </form>
      </div>
    </>
  );
}
