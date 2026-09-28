import { db } from '@/lib/server/firebase.js';
import { finalizeAttempt } from '@/lib/server/attempts.js';
import { route } from '@/lib/server/http.js';

const FIELDS = ['quizId', 'quizTitle', 'status', 'submitReason', 'startedAt', 'submittedAt', 'expiresAt', 'result'];
const load = (uid) => db.collection('attempts').where('userId', '==', uid).select(...FIELDS).get();
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

export const GET = route(async ({ user }) => {
  let snap = await load(user.uid);
  const now = Date.now();
  const stale = snap.docs.filter((d) => d.data().status === 'in_progress' && d.data().expiresAt <= now);
  if (stale.length) {
    await Promise.all(stale.map((d) => finalizeAttempt(d.id, 'timeout', now)));
    snap = await load(user.uid);
  }
  const attempts = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.startedAt - a.startedAt).map((a) => ({
    id: a.id, quizId: a.quizId, quizTitle: a.quizTitle, status: a.status, submitReason: a.submitReason,
    startedAt: iso(a.startedAt), submittedAt: iso(a.submittedAt),
    correct: a.result?.correct ?? null, totalQuestions: a.result?.totalQuestions ?? null, score: a.result?.score ?? null,
    percentage: a.result?.percentage ?? null, timeTakenSeconds: a.result?.timeTakenSeconds ?? null,
  }));
  return { attempts };
});
