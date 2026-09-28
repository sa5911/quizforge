'use client';

import { useState } from 'react';
import { useSearchParams } from '@/lib/client/nav.jsx';
import { api } from '@/lib/client/api.js';
import {
  Async, Badge, Empty, Modal, PageHeader, Pager, Spinner, fmtDate, fmtDuration, useDebounced, useLoad,
} from '@/components/ui.jsx';
import { ResultView } from '@/components/pages/Student.jsx';

export function Users() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const state = useLoad(() => api.get(`/admin/users?page=${page}&pageSize=25${debounced ? `&search=${encodeURIComponent(debounced)}` : ''}`), [page, debounced]);
  return (
    <>
      <PageHeader title="Users" subtitle="Registered accounts" />
      <div className="field"><input type="search" placeholder="Search name or email…" aria-label="Search users" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
      <Async state={state} empty={(d) => !d.users.length && <Empty title="No users found" />}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Attempts</th><th>Avg score</th><th>Last active</th><th>Joined</th></tr></thead>
                <tbody>{d.users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td><td>{u.email}</td><td><Badge kind={u.role === 'admin' ? 'blue' : ''}>{u.role}</Badge></td>
                    <td>{u.attempts}</td><td>{u.averagePercentage != null ? `${u.averagePercentage}%` : '—'}</td>
                    <td className="nowrap">{fmtDate(u.lastActive)}</td><td className="nowrap">{fmtDate(u.createdAt)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </Async>
    </>
  );
}

export function Results() {
  const [sp, setSp] = useSearchParams();
  const quizId = sp.get('quizId') || '';
  const userId = sp.get('userId') || '';
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const quizzes = useLoad(() => api.get('/admin/quizzes'));
  const state = useLoad(() => {
    const qs = new URLSearchParams({ page, pageSize: 25 });
    if (quizId) qs.set('quizId', quizId);
    if (userId) qs.set('userId', userId);
    return api.get(`/admin/results?${qs}`);
  }, [quizId, userId, page]);

  const open = async (attemptId) => {
    setDetail({ loading: true });
    try { setDetail(await api.get(`/admin/results/${attemptId}`)); } catch (e) { setDetail({ error: e.message }); }
  };

  return (
    <>
      <PageHeader title="Results" subtitle="Every attempt, with scores and time taken." />
      <div className="row" style={{ marginBottom: '1rem' }}>
        <select aria-label="Quiz" style={{ width: 'auto', maxWidth: 300 }} value={quizId} onChange={(e) => { const n = new URLSearchParams(sp); e.target.value ? n.set('quizId', e.target.value) : n.delete('quizId'); setSp(n); setPage(1); }}>
          <option value="">All quizzes</option>{quizzes.data?.quizzes.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
        </select>
        {userId && <button className="btn sm" onClick={() => { const n = new URLSearchParams(sp); n.delete('userId'); setSp(n); }}>Clear student filter ×</button>}
      </div>
      <Async state={state} empty={(d) => !d.results.length && <Empty title="No attempts yet">Results appear once students take quizzes.</Empty>}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Student</th><th>Quiz</th><th>Score</th><th>%</th><th>Time</th><th>Started</th><th /></tr></thead>
                <tbody>{d.results.map((r) => (
                  <tr key={r.attemptId}>
                    <td>{r.userName}<div className="muted small">{r.userEmail}</div></td>
                    <td>{r.quizTitle}</td>
                    <td>{r.status === 'in_progress' ? <Badge kind="blue">in progress</Badge> : `${r.correct}/${r.totalQuestions}`}</td>
                    <td>{r.percentage != null ? `${r.percentage}%` : '—'}</td>
                    <td className="nowrap">{fmtDuration(r.timeTakenSeconds)}{r.submitReason === 'timeout' && <> <Badge kind="amber">timed out</Badge></>}</td>
                    <td className="nowrap">{fmtDate(r.startedAt)}</td>
                    <td className="right">{r.status === 'submitted' && <button className="btn sm" onClick={() => open(r.attemptId)}>Details</button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </Async>
      {detail && (
        <Modal wide title={detail.user ? `${detail.user.name} (${detail.user.email})` : 'Attempt'} onClose={() => setDetail(null)}>
          {detail.loading ? <Spinner /> : detail.error ? <div className="alert error">{detail.error}</div> : detail.result ? <ResultView result={detail.result} /> : <p>Attempt not submitted yet.</p>}
        </Modal>
      )}
    </>
  );
}
