import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, nowIso } from '@/lib/server/firebase.js';
import { pagination, query, body, route } from '@/lib/server/http.js';
import { decorations, loadQuestions, questionDto, questionInput } from '@/lib/server/questions.js';

/**
 * Filtering is done in memory on top of one equality query, so no composite indexes are needed.
 * Fine up to a few thousand questions.
 */
export const GET = route(async ({ req }) => {
  const q = query(req, pagination.extend({
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    bookId: z.string().max(128).optional(),
    search: z.string().trim().max(200).optional(),
  }));
  let ref = db.collection('questions');
  if (q.status) ref = ref.where('status', '==', q.status);
  else if (q.bookId) ref = ref.where('bookId', '==', q.bookId);
  const snap = await ref.get();
  const needle = q.search?.toLowerCase();
  const docs = snap.docs.filter((d) => {
    const x = d.data();
    return (!q.bookId || x.bookId === q.bookId) && (!q.difficulty || x.difficulty === q.difficulty) && (!needle || x.text.toLowerCase().includes(needle));
  }).sort((a, b) => b.data().createdAt.localeCompare(a.data().createdAt));
  const page = docs.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
  const deco = await decorations();
  return { questions: page.map((d) => questionDto(d, deco)), total: docs.length, page: q.page, pageSize: q.pageSize };
}, { auth: 'admin' });

export const POST = route(async ({ req }) => {
  const b = await body(req, questionInput);
  const at = nowIso();
  const ref = db.collection('questions').doc();
  await ref.set({
    bookId: b.bookId ?? null, sectionId: null, text: b.text, explanation: b.explanation, difficulty: b.difficulty,
    sourceRef: b.sourceRef ?? null, status: 'pending', origin: 'manual', options: b.options, correctIndex: b.correctIndex, createdAt: at, updatedAt: at,
  });
  return NextResponse.json({ question: (await loadQuestions([ref.id]))[0] }, { status: 201 });
}, { auth: 'admin' });
