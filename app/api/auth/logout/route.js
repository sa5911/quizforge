import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/server/auth.js';
import { route } from '@/lib/server/http.js';

export const POST = route(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}, { auth: 'none' });
