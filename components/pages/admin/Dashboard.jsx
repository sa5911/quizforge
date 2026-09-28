'use client';

import { Link } from '@/lib/client/nav.jsx';
import { api } from '@/lib/client/api.js';
import { Async, Empty, PageHeader, fmtDate, useLoad } from '@/components/ui.jsx';

export default function Dashboard() {
  const state = useLoad(() => api.get('/admin/stats'));
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Overview of your platform">
        <Link className="btn" to="/admin/books">Upload book</Link>
        <Link className="btn primary" to="/admin/quizzes/create">Create quiz</Link>
      </PageHeader>
      <Async state={state}>
        {({ stats: s, recent }) => (
          <>
            <div className="stats">
              <div className="stat"><b>{s.students}</b><span>Students</span></div>
              <div className="stat"><b>{s.books}</b><span>Books</span></div>
              <Link to="/admin/questions?status=pending" style={{ color: 'inherit', textDecoration: 'none' }}><div className="stat"><b style={{ color: s.pendingQuestions ? 'var(--amber)' : undefined }}>{s.pendingQuestions}</b><span>Questions to review</span></div></Link>
              <div className="stat"><b>{s.approvedQuestions}</b><span>Approved questions</span></div>
              <div className="stat"><b>{s.publishedQuizzes}</b><span>Published quizzes</span></div>
              <div className="stat"><b>{s.attempts}</b><span>Attempts ({s.inProgress} live)</span></div>
              <div className="stat"><b>{s.averagePercentage != null ? `${s.averagePercentage}%` : '—'}</b><span>Average score</span></div>
            </div>
            <div className="card">
              <h2>Recent submissions</h2>
              {!recent.length ? <Empty title="Nothing yet">Results appear here as students finish quizzes.</Empty> : (
                <div className="table-wrap" style={{ border: 0 }}>
                  <table>
                    <thead><tr><th>Student</th><th>Quiz</th><th>Score</th><th>When</th></tr></thead>
                    <tbody>{recent.map((r) => (
                      <tr key={r.attemptId}><td>{r.userName}</td><td>{r.quizTitle}</td><td>{r.percentage}%</td><td className="nowrap">{fmtDate(r.submittedAt)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </Async>
    </>
  );
}
