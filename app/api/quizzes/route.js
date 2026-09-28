import { db } from '@/lib/server/firebase.js';
import { usageFor } from '@/lib/server/attempts.js';
import { route } from '@/lib/server/http.js';

const quizCard = (id, q) => ({
  id, title: q.title, description: q.description, durationMinutes: q.durationMinutes, maxAttempts: q.maxAttempts, questionCount: q.questionIds.length,
});

export const GET = route(async ({ user }) => {
  const snap = await db.collection('quizzes').where('status', '==', 'published').get();
  const docs = snap.docs.filter((d) => d.data().questionIds.length > 0)
    .sort((a, b) => b.data().createdAt.localeCompare(a.data().createdAt));
  const quizzes = await Promise.all(docs.map(async (d) => ({ ...quizCard(d.id, d.data()), ...(await usageFor(user.uid, d.id)) })));
  return { quizzes };
});
