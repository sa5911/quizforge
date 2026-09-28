import { nowIso } from '@/lib/server/firebase.js';
import { body, conflict, idParam, route } from '@/lib/server/http.js';
import { loadQuestions } from '@/lib/server/questions.js';
import { getQuiz, quizDto, quizSchema } from '@/lib/server/quizzes.js';

export const GET = route(async ({ params }) => {
  const { data, dto } = await getQuiz(idParam(params.id));
  return { quiz: dto, questions: await loadQuestions(data.questionIds) };
}, { auth: 'admin' });

export const PUT = route(async ({ req, params }) => {
  const id = idParam(params.id);
  const { ref } = await getQuiz(id);
  const b = await body(req, quizSchema);
  // Attempts already in progress keep the duration/expiry they started with (it is stored on the attempt).
  await ref.update({ ...b, updatedAt: nowIso() });
  return { quiz: (await getQuiz(id)).dto };
}, { auth: 'admin' });

export const DELETE = route(async ({ params }) => {
  const { ref, dto } = await getQuiz(idParam(params.id));
  if (dto.attemptCount > 0) throw conflict('This quiz has student attempts and cannot be deleted. Unpublish it instead.');
  await ref.delete();
  return { ok: true };
}, { auth: 'admin' });
