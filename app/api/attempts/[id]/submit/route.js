import { z } from 'zod';
import { config } from '@/lib/server/config.js';
import { finalizeAttempt, saveAnswers } from '@/lib/server/attempts.js';
import { db } from '@/lib/server/firebase.js';
import { HttpError, idParam, notFound, optionalBody, route } from '@/lib/server/http.js';

const schema = z.object({ answers: z.record(z.string(), z.number().int().min(0).nullable()).optional() });

export const POST = route(async ({ req, params, user }) => {
  const id = idParam(params.id);
  const { answers } = await optionalBody(req, schema);
  const snap = await db.collection('attempts').doc(id).get();
  if (!snap.exists || snap.data().userId !== user.uid) throw notFound('Attempt');
  const a = snap.data();
  if (a.status === 'submitted') return { attemptId: id, status: 'submitted' };

  const now = Date.now();
  // Final answers sent with the submit are honoured only inside the short network-grace window.
  if (answers && now <= a.expiresAt + config.quiz.submitGraceMs) {
    const entries = Object.entries(answers).filter(([k]) => /^\d+$/.test(k)).map(([k, v]) => ({ questionId: Number(k), optionId: v }));
    try { await saveAnswers(id, user.uid, entries, { now, graceMs: config.quiz.submitGraceMs, strict: false }); }
    catch (e) { if (!(e instanceof HttpError)) throw e; }
  }
  await finalizeAttempt(id, now >= a.expiresAt ? 'timeout' : 'manual', now);
  return { attemptId: id, status: 'submitted' };
});
