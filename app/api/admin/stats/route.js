import { sweepExpired } from '@/lib/server/attempts.js';
import { db } from '@/lib/server/firebase.js';
import { route } from '@/lib/server/http.js';

const count = async (q) => (await q.count().get()).data().count;
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

export const GET = route(async () => {
  await sweepExpired(25);
  const [students, books, pending, approved, published, attempts, inProgress, meta, recent] = await Promise.all([
    count(db.collection('users').where('role', '==', 'student')),
    count(db.collection('books')),
    count(db.collection('questions').where('status', '==', 'pending')),
    count(db.collection('questions').where('status', '==', 'approved')),
    count(db.collection('quizzes').where('status', '==', 'published')),
    count(db.collection('attempts')),
    count(db.collection('attempts').where('status', '==', 'in_progress')),
    db.doc('meta/stats').get(),
    db.collection('attempts').orderBy('submittedAt', 'desc').limit(8).select('quizTitle', 'userName', 'submittedAt', 'result').get(),
  ]);
  const m = meta.data();
  return {
    stats: {
      students, books, pendingQuestions: pending, approvedQuestions: approved, publishedQuizzes: published, attempts, inProgress,
      averagePercentage: m?.completed ? Math.round((m.percentageSum / m.completed) * 10) / 10 : null,
    },
    recent: recent.docs.map((d) => ({
      attemptId: d.id, quizTitle: d.data().quizTitle, userName: d.data().userName, percentage: d.data().result?.percentage, submittedAt: iso(d.data().submittedAt),
    })),
  };
}, { auth: 'admin' });
