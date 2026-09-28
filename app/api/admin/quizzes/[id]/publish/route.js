import { db } from '@/lib/server/firebase.js';
import { conflict, idParam, route } from '@/lib/server/http.js';
import { getQuiz } from '@/lib/server/quizzes.js';

export const POST = route(async ({ params }) => {
  const id = idParam(params.id);
  const { ref, data } = await getQuiz(id);
  if (!data.questionIds.length) throw conflict('Add at least one question before publishing');
  const snaps = await db.getAll(...data.questionIds.map((q) => db.collection('questions').doc(q)));
  const bad = snaps.filter((s) => !s.exists || s.data().status !== 'approved').length;
  if (bad) throw conflict(`${bad} question(s) in this quiz are no longer approved`);
  await ref.update({ status: 'published' });
  return { quiz: (await getQuiz(id)).dto };
}, { auth: 'admin' });
