import { getAttemptFor, resultView } from '@/lib/server/attempts.js';
import { idParam, route } from '@/lib/server/http.js';

export const GET = route(async ({ params }) => {
  const a = await getAttemptFor(idParam(params.attemptId), null);
  return {
    user: { name: a.userName, email: a.userEmail },
    result: a.status === 'submitted' ? resultView(a) : null,
  };
}, { auth: 'admin' });
