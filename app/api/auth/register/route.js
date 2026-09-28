import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, db, nowIso } from '@/lib/server/firebase.js';
import { body, conflict, route } from '@/lib/server/http.js';

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

// Role is never taken from the request: every self-registered account is a student.
export const POST = route(async ({ req }) => {
  const { name, email, password } = await body(req, schema);
  let user;
  try {
    user = await adminAuth.createUser({ email, password, displayName: name });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') throw conflict('An account with this email already exists');
    throw e;
  }
  await adminAuth.setCustomUserClaims(user.uid, { role: 'student' });
  await db.collection('users').doc(user.uid).set({ name, email, role: 'student', createdAt: nowIso(), attemptsStarted: 0, attemptsCompleted: 0, percentageSum: 0 });
  return NextResponse.json({ ok: true }, { status: 201 });
}, { auth: 'none' });
