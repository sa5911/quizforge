import { getAttemptFor, resultView } from '@/lib/server/attempts.js';
import { HttpError, idParam, route } from '@/lib/server/http.js';

export const GET = route(async ({ params, user }) => {
  const a = await getAttemptFor(idParam(params.id), user.uid);
  if (a.status === 'in_progress') throw new HttpError(409, 'Attempt is still in progress');
  return { result: resultView(a) };
});
