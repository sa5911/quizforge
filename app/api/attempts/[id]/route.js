import { attemptView, getAttemptFor } from '@/lib/server/attempts.js';
import { idParam, route } from '@/lib/server/http.js';

export const GET = route(async ({ params, user }) => {
  const a = await getAttemptFor(idParam(params.id), user.uid);
  if (a.status !== 'in_progress') return { attempt: { id: a.id, quizId: a.quizId, status: a.status } };
  return { attempt: attemptView(a) };
});
