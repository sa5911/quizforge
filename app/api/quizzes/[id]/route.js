import { db } from '@/lib/server/firebase.js';
import { usageFor } from '@/lib/server/attempts.js';
import { idParam, notFound, route } from '@/lib/server/http.js';

export const GET = route(async ({ params, user }) => {
  const id = idParam(params.id);
  const s = await db.collection('quizzes').doc(id).get();
  if (!s.exists || s.data().status !== 'published') throw notFound('Quiz');
  const q = s.data();
  return {
    quiz: {
      id, title: q.title, description: q.description, durationMinutes: q.durationMinutes, maxAttempts: q.maxAttempts,
      questionCount: q.questionIds.length, instructions: q.instructions, ...(await usageFor(user.uid, id)),
    },
  };
});
