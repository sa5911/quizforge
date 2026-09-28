import { db, nowIso } from '@/lib/server/firebase.js';
import { body, conflict, idParam, notFound, route } from '@/lib/server/http.js';
import { loadQuestions, questionInput } from '@/lib/server/questions.js';

export const GET = route(async ({ params }) => {
  const [question] = await loadQuestions([idParam(params.id)]);
  if (!question) throw notFound('Question');
  return { question };
}, { auth: 'admin' });

export const PUT = route(async ({ req, params }) => {
  const id = idParam(params.id);
  const b = await body(req, questionInput);
  const ref = db.collection('questions').doc(id);
  if (!(await ref.get()).exists) throw notFound('Question');
  await ref.update({
    text: b.text, explanation: b.explanation, difficulty: b.difficulty, sourceRef: b.sourceRef ?? null,
    options: b.options, correctIndex: b.correctIndex, updatedAt: nowIso(),
  });
  return { question: (await loadQuestions([id]))[0] };
}, { auth: 'admin' });

export const DELETE = route(async ({ params }) => {
  const id = idParam(params.id);
  const ref = db.collection('questions').doc(id);
  if (!(await ref.get()).exists) throw notFound('Question');
  const used = await db.collection('quizzes').where('questionIds', 'array-contains', id).limit(1).get();
  if (!used.empty) throw conflict('This question is used in a quiz. Remove it from the quiz first (or reject it).');
  await ref.delete();
  return { ok: true };
}, { auth: 'admin' });
