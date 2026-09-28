import { z } from 'zod';
import { body, badRequest, route } from '@/lib/server/http.js';
import { importQuestions } from '@/lib/server/importer.js';
import { quizSchema } from '@/lib/server/quizzes.js';

export const maxDuration = 60;

const schema = z.object({
  payload: z.any(),
  status: z.enum(['approved', 'pending']).default('approved'),
  bookId: z.string().max(128).nullish(),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  skipInvalid: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  createQuiz: quizSchema.nullish(),
});

/** Paste-JSON import: no AI needed. Optionally creates a draft quiz from the imported questions. */
export const POST = route(async ({ req }) => {
  const b = await body(req, schema);
  if (b.payload === undefined || b.payload === null) throw badRequest('Missing "payload"');
  // quiz details may also live inside the pasted JSON:  { "quiz": { "title": "...", "durationMinutes": 30 }, "questions": [...] }
  let createQuiz = b.createQuiz ?? null;
  if (!createQuiz && !Array.isArray(b.payload) && b.payload?.quiz) createQuiz = quizSchema.parse(b.payload.quiz);
  if (createQuiz && b.status !== 'approved') throw badRequest('Questions must be imported as approved to create a quiz from them');
  return importQuestions({ ...b, createQuiz });
}, { auth: 'admin' });
