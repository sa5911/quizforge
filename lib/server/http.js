import { NextResponse } from 'next/server.js';
import { z } from 'zod';
import { config } from './config.js';
import { getSessionUser } from './auth.js';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const badRequest = (m, d) => new HttpError(400, m, d);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const conflict = (m) => new HttpError(409, m);

/** Route ids are Firestore document ids. */
export function idParam(v, what = 'id') {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(v)) throw badRequest(`Invalid ${what}`);
  return v;
}

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Parse + validate a JSON body. */
export async function body(req, schema) {
  let raw;
  try { raw = await req.json(); } catch { throw badRequest('Malformed or missing JSON body'); }
  return schema.parse(raw);
}
export async function optionalBody(req, schema) {
  let raw = {};
  try { raw = await req.json(); } catch { /* empty body */ }
  return schema.parse(raw ?? {});
}
export const query = (req, schema) => schema.parse(Object.fromEntries(req.nextUrl.searchParams));

/** Basic CSRF defence on top of SameSite cookies: reject cross-origin state-changing requests. */
function originCheck(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.get('origin');
  if (!origin) return;
  try {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    if (new URL(origin).host === host || config.allowedOrigins.includes(origin)) return;
  } catch { /* fall through */ }
  throw new HttpError(403, 'Cross-origin request blocked');
}

export function errorResponse(err) {
  if (err instanceof z.ZodError) {
    return NextResponse.json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    }, { status: 400 });
  }
  if (err instanceof HttpError) return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
  console.error(err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

/**
 * Wraps a route handler with CSRF check, authentication/authorization and error mapping.
 * auth: 'user' (default) | 'admin' | 'none'.  handler({ req, params, user }) returns JSON-able data or a Response.
 */
export function route(handler, { auth = 'user' } = {}) {
  return async (req, ctx) => {
    try {
      originCheck(req);
      const params = ctx?.params ? await ctx.params : {};
      const user = auth === 'none' ? null : await getSessionUser(req, { admin: auth === 'admin' });
      const out = await handler({ req, params, user });
      return out instanceof Response ? out : NextResponse.json(out);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
