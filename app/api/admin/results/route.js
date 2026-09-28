import { z } from 'zod';
import { sweepExpired } from '@/lib/server/attempts.js';
import { db } from '@/lib/server/firebase.js';
import { pagination, query, route } from '@/lib/server/http.js';

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

export const GET = route(async ({ req }) => {
  const q = query(req, pagination.extend({ quizId: z.string().max(128).optional(), userId: z.string().max(128).optional() }));
  await sweepExpired(25);
  let ref = db.collection('attempts');
  if (q.quizId) ref = ref.where('quizId', '==', q.quizId);
  else if (q.userId) ref = ref.where('userId', '==', q.userId);
  const [total, snap] = await Promise.all([
    ref.count().get(),
    ref.orderBy('startedAt', 'desc').offset((q.page - 1) * q.pageSize).limit(q.pageSize)
      .select('quizId', 'quizTitle', 'userId', 'userName', 'userEmail', 'status', 'submitReason', 'startedAt', 'submittedAt', 'result').get(),
  ]);
  return {
    total: total.data().count, page: q.page, pageSize: q.pageSize,
    results: snap.docs.map((d) => {
      const a = d.data();
      return {
        attemptId: d.id, quizId: a.quizId, quizTitle: a.quizTitle, status: a.status, submitReason: a.submitReason,
        userId: a.userId, userName: a.userName, userEmail: a.userEmail, startedAt: iso(a.startedAt), submittedAt: iso(a.submittedAt),
        correct: a.result?.correct ?? null, totalQuestions: a.result?.totalQuestions ?? null, percentage: a.result?.percentage ?? null,
        timeTakenSeconds: a.result?.timeTakenSeconds ?? null,
      };
    }),
  };
}, { auth: 'admin' });
