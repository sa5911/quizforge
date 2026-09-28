import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { sweepExpired } from '@/lib/server/attempts.js';
import { HttpError, route } from '@/lib/server/http.js';

/** Grades attempts whose timer expired while the student was away. Call from a scheduler (Vercel Cron sends CRON_SECRET). */
export const GET = route(async ({ req }) => {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const a = Buffer.from(given), b = Buffer.from(secret || '');
  if (!secret || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'Unauthorized');
  return NextResponse.json({ graded: await sweepExpired(500) });
}, { auth: 'none' });
