import { answerSchema, getAttemptFor, saveAnswers } from '@/lib/server/attempts.js';
import { body, idParam, route } from '@/lib/server/http.js';

export const PUT = route(async ({ req, params, user }) => {
  const entry = await body(req, answerSchema);
  const id = idParam(params.id);
  await getAttemptFor(id, user.uid); // grades it if the timer already ran out, so the save below is refused
  return { ok: true, remainingSeconds: await saveAnswers(id, user.uid, [entry]) };
});
