import { z } from 'zod';
import { db, nowIso } from '@/lib/server/firebase.js';
import { body, idParam, notFound, route } from '@/lib/server/http.js';
import { loadQuestions, statusSchema } from '@/lib/server/questions.js';

export const PATCH = route(async ({ req, params }) => {
  const id = idParam(params.id);
  const { status } = await body(req, z.object({ status: statusSchema }));
  const ref = db.collection('questions').doc(id);
  if (!(await ref.get()).exists) throw notFound('Question');
  await ref.update({ status, updatedAt: nowIso() });
  return { question: (await loadQuestions([id]))[0] };
}, { auth: 'admin' });
