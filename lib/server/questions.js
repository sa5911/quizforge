import { z } from 'zod';
import { db } from './firebase.js';

export const questionInput = z.object({
  text: z.string().trim().min(5).max(1000),
  explanation: z.string().trim().max(3000).default(''),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  sourceRef: z.string().trim().max(300).nullish(),
  bookId: z.string().max(128).nullish(),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
  correctIndex: z.number().int().min(0),
}).refine((q) => q.correctIndex < q.options.length, { message: 'correctIndex out of range', path: ['correctIndex'] })
  .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === q.options.length, { message: 'Options must be distinct', path: ['options'] });

export const statusSchema = z.enum(['pending', 'approved', 'rejected']);

/** Lookup maps used to decorate question DTOs (books are few; quizzes are few). */
export async function decorations() {
  const [books, quizzes] = await Promise.all([
    db.collection('books').select('title').get(),
    db.collection('quizzes').select('questionIds').get(),
  ]);
  const bookTitles = new Map(books.docs.map((d) => [d.id, d.data().title]));
  const quizCounts = new Map();
  for (const d of quizzes.docs) for (const qid of d.data().questionIds || []) quizCounts.set(qid, (quizCounts.get(qid) || 0) + 1);
  return { bookTitles, quizCounts };
}

export function questionDto(doc, deco) {
  const d = doc.data ? doc.data() : doc;
  const id = doc.id;
  return {
    id, text: d.text, explanation: d.explanation, difficulty: d.difficulty, sourceRef: d.sourceRef ?? null, status: d.status,
    origin: d.origin, aiProvider: d.aiProvider ?? null, bookId: d.bookId ?? null,
    bookTitle: d.bookId ? deco?.bookTitles.get(d.bookId) ?? null : null,
    quizCount: deco?.quizCounts.get(id) ?? 0, createdAt: d.createdAt,
    options: d.options, correctIndex: d.correctIndex,
  };
}

/** Load several questions by id, preserving the requested order. */
export async function loadQuestions(ids) {
  if (!ids.length) return [];
  const [snaps, deco] = await Promise.all([db.getAll(...ids.map((id) => db.collection('questions').doc(id))), decorations()]);
  return snaps.filter((s) => s.exists).map((s) => questionDto(s, deco));
}
