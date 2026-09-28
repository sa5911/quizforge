import { z } from 'zod';
import { db, nowIso } from '@/lib/server/firebase.js';
import { body, conflict, idParam, route } from '@/lib/server/http.js';
import { getQuiz } from '@/lib/server/quizzes.js';

export const PUT = route(async ({ req, params }) => {
  const id = idParam(params.id);
  const { ref } = await getQuiz(id);
  const { questionIds } = await body(req, z.object({ questionIds: z.array(z.string().max(128)).max(500) }));
  if (new Set(questionIds).size !== questionIds.length) throw conflict('Duplicate questions in list');
  if (questionIds.length) {
    const snaps = await db.getAll(...questionIds.map((q) => db.collection('questions').doc(q)));
    if (snaps.some((s) => !s.exists || s.data().status !== 'approved')) throw conflict('Only existing, approved questions can be added to a quiz');
  }
  await ref.update({ questionIds, updatedAt: nowIso() });
  return { quiz: (await getQuiz(id)).dto };
}, { auth: 'admin' });
