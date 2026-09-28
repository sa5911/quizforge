import { idParam, route } from '@/lib/server/http.js';
import { getQuiz } from '@/lib/server/quizzes.js';

export const POST = route(async ({ params }) => {
  const id = idParam(params.id);
  const { ref } = await getQuiz(id);
  await ref.update({ status: 'draft' });
  return { quiz: (await getQuiz(id)).dto };
}, { auth: 'admin' });
