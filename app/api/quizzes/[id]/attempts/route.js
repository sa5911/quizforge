import { NextResponse } from 'next/server';
import { attemptView, startAttempt } from '@/lib/server/attempts.js';
import { idParam, route } from '@/lib/server/http.js';

export const POST = route(async ({ params, user }) => {
  const attempt = await startAttempt(user, idParam(params.id));
  return NextResponse.json({ attempt: attemptView(attempt) }, { status: 201 });
});
