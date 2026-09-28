import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/lib/server/auth.js';
import { config } from '@/lib/server/config.js';
import { adminAuth, db, nowIso } from '@/lib/server/firebase.js';
import { body, HttpError, route } from '@/lib/server/http.js';

/** Exchanges a freshly minted Firebase ID token for an httpOnly session cookie. */
export const POST = route(async ({ req }) => {
  const { idToken, admin } = await body(req, z.object({ idToken: z.string().min(20), admin: z.boolean().optional() }));
  let decoded;
  try { decoded = await adminAuth.verifyIdToken(idToken); } catch { throw new HttpError(401, 'Invalid sign-in'); }
  if (Date.now() / 1000 - decoded.auth_time > 300) throw new HttpError(401, 'Recent sign-in required');
  const role = decoded.role === 'admin' ? 'admin' : 'student';
  if (admin && role !== 'admin') throw new HttpError(401, 'Invalid email or password');

  const ref = db.collection('users').doc(decoded.uid);
  let snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ name: decoded.name || decoded.email, email: decoded.email, role, createdAt: nowIso(), attemptsStarted: 0, attemptsCompleted: 0, percentageSum: 0 });
    snap = await ref.get();
  }
  const u = snap.data();
  const cookie = await adminAuth.createSessionCookie(idToken, { expiresIn: config.sessionMaxAgeMs });
  const res = NextResponse.json({ user: { id: decoded.uid, name: u.name, email: u.email, role, createdAt: u.createdAt } });
  res.cookies.set(SESSION_COOKIE, cookie, { httpOnly: true, secure: config.isProd, sameSite: 'lax', path: '/', maxAge: config.sessionMaxAgeMs / 1000 });
  return res;
}, { auth: 'none' });
