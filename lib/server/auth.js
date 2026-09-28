import { adminAuth } from './firebase.js';
import { HttpError } from './http.js';

export const SESSION_COOKIE = 'session';

/**
 * Authenticates a request from its httpOnly Firebase session cookie.
 * Role comes from the signed `role` custom claim (only settable server-side).
 * Admin routes additionally check that the session has not been revoked.
 */
export async function getSessionUser(req, { admin = false } = {}) {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!cookie) throw new HttpError(401, 'Authentication required');
  let decoded;
  try {
    decoded = await adminAuth.verifySessionCookie(cookie, admin);
  } catch {
    throw new HttpError(401, 'Session expired, please sign in again');
  }
  const role = decoded.role === 'admin' ? 'admin' : 'student';
  if (admin && role !== 'admin') throw new HttpError(403, 'Admin access required');
  return { uid: decoded.uid, email: decoded.email, name: decoded.name || decoded.email, role };
}
