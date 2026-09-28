import { NextResponse } from 'next/server';
import { db, nowIso } from '@/lib/server/firebase.js';
import { body, route } from '@/lib/server/http.js';
import { quizDto, quizSchema } from '@/lib/server/quizzes.js';

export const GET = route(async () => {
  const snap = await db.collection('quizzes').orderBy('createdAt', 'desc').get();
  return { quizzes: snap.docs.map((d) => quizDto(d.id, d.data())) };
}, { auth: 'admin' });

export const POST = route(async ({ req }) => {
  const b = await body(req, quizSchema);
  const at = nowIso();
  const ref = db.collection('quizzes').doc();
  const doc = { ...b, status: 'draft', questionIds: [], attemptCount: 0, createdAt: at, updatedAt: at };
  await ref.set(doc);
  return NextResponse.json({ quiz: quizDto(ref.id, doc) }, { status: 201 });
}, { auth: 'admin' });
