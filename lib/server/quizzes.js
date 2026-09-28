import { z } from 'zod';
import { config } from './config.js';
import { db } from './firebase.js';
import { notFound } from './http.js';

export const quizSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).default(''),
  instructions: z.string().trim().max(5000).default(''),
  durationMinutes: z.number().int().min(1).max(600).default(config.quiz.defaultDurationMinutes),
  maxAttempts: z.number().int().min(0).max(100).default(1),
});

export const quizDto = (id, q) => ({
  id, title: q.title, description: q.description, instructions: q.instructions, durationMinutes: q.durationMinutes,
  maxAttempts: q.maxAttempts, status: q.status, questionCount: q.questionIds.length, attemptCount: q.attemptCount || 0,
  createdAt: q.createdAt, updatedAt: q.updatedAt,
});

export async function getQuiz(id) {
  const s = await db.collection('quizzes').doc(id).get();
  if (!s.exists) throw notFound('Quiz');
  return { ref: s.ref, data: s.data(), dto: quizDto(id, s.data()) };
}
