import { z } from 'zod';
import { db, FieldValue } from './firebase.js';
import { conflict, HttpError, notFound } from './http.js';

const attempts = () => db.collection('attempts');
const usageRef = (uid, quizId) => db.collection('usage').doc(`${uid}_${quizId}`);
const isoMs = (ms) => (ms == null ? null : new Date(ms).toISOString());
const withId = (s) => ({ id: s.id, ...s.data() });

/** Fetch an attempt (owned by uid, or any when uid is null). Grades it first if its timer has run out. */
export async function getAttemptFor(id, uid) {
  const snap = await attempts().doc(id).get();
  if (!snap.exists || (uid && snap.data().userId !== uid)) throw notFound('Attempt');
  return finalizeIfExpired(withId(snap));
}

export async function finalizeIfExpired(a, now = Date.now()) {
  if (a.status === 'in_progress' && now >= a.expiresAt) {
    await finalizeAttempt(a.id, 'timeout', now);
    return withId(await attempts().doc(a.id).get());
  }
  return a;
}

/** Per-user/per-quiz summary; resolves an expired open attempt first so callers never see a stale "in progress". */
export async function usageFor(uid, quizId) {
  let u = (await usageRef(uid, quizId).get()).data() || {};
  if (u.openAttemptId) {
    const s = await attempts().doc(u.openAttemptId).get();
    if (!s.exists || s.data().status !== 'in_progress' || Date.now() >= s.data().expiresAt) {
      if (s.exists && s.data().status === 'in_progress') await finalizeAttempt(s.id, 'timeout');
      u = (await usageRef(uid, quizId).get()).data() || {};
    }
  }
  return {
    attemptsUsed: u.attemptsUsed || 0,
    inProgressAttemptId: u.openAttemptId || null,
    lastAttemptId: u.lastAttemptId || null,
    bestPercentage: u.bestPercentage ?? null,
  };
}

/** Start a new attempt, or resume the open one. The questions are snapshotted into the attempt here. */
export async function startAttempt(user, quizId) {
  const quizSnap = await db.collection('quizzes').doc(quizId).get();
  if (!quizSnap.exists || quizSnap.data().status !== 'published') throw notFound('Quiz');
  const quiz = quizSnap.data();

  await usageFor(user.uid, quizId); // clears an expired open attempt, if any

  const qsnaps = quiz.questionIds.length ? await db.getAll(...quiz.questionIds.map((id) => db.collection('questions').doc(id))) : [];
  const questions = qsnaps.filter((s) => s.exists && s.data().status === 'approved').map((s) => {
    const q = s.data();
    return { sourceQuestionId: s.id, text: q.text, explanation: q.explanation || '', sourceRef: q.sourceRef || null, options: q.options.map((text, i) => ({ text, correct: i === q.correctIndex })) };
  });
  if (!questions.length) throw conflict('This quiz has no questions yet');

  const userDoc = (await db.collection('users').doc(user.uid).get()).data() || {};
  const newRef = attempts().doc();
  const now = Date.now();

  const id = await db.runTransaction(async (t) => {
    const us = await t.get(usageRef(user.uid, quizId));
    const u = us.data() || {};
    if (u.openAttemptId) return u.openAttemptId; // concurrent/refresh start: resume
    if (quiz.maxAttempts > 0 && (u.attemptsUsed || 0) >= quiz.maxAttempts) {
      throw conflict(`You have used all ${quiz.maxAttempts} attempt(s) for this quiz`);
    }
    t.set(newRef, {
      quizId, userId: user.uid, userName: userDoc.name || user.name, userEmail: userDoc.email || user.email,
      quizTitle: quiz.title, durationMinutes: quiz.durationMinutes, totalQuestions: questions.length,
      status: 'in_progress', submitReason: null, startedAt: now, expiresAt: now + quiz.durationMinutes * 60_000, submittedAt: null,
      questions, answers: {}, result: null,
    });
    t.set(usageRef(user.uid, quizId), { userId: user.uid, quizId, attemptsUsed: FieldValue.increment(1), openAttemptId: newRef.id }, { merge: true });
    t.update(db.collection('quizzes').doc(quizId), { attemptCount: FieldValue.increment(1) });
    t.set(db.collection('users').doc(user.uid), { attemptsStarted: FieldValue.increment(1), lastActive: now }, { merge: true });
    return newRef.id;
  });
  return withId(await attempts().doc(id).get());
}

/** The student-facing view of an in-progress attempt. Never includes correct answers. */
export function attemptView(a, now = Date.now()) {
  const answers = {};
  for (const [k, v] of Object.entries(a.answers || {})) if (v != null) answers[k] = v;
  return {
    id: a.id, quizId: a.quizId, title: a.quizTitle, status: a.status, durationMinutes: a.durationMinutes,
    startedAt: isoMs(a.startedAt), expiresAt: isoMs(a.expiresAt), serverNow: now,
    remainingSeconds: Math.max(0, Math.ceil((a.expiresAt - now) / 1000)),
    questions: a.questions.map((q, i) => ({ id: i, position: i + 1, text: q.text, options: q.options.map((o, idx) => ({ id: idx, text: o.text })) })),
    answers,
  };
}

/**
 * Save answers atomically. Rejected once the attempt is submitted or past expiresAt (+graceMs).
 * strict=true throws on invalid input (single answer); strict=false silently skips bad entries (final batch).
 */
export async function saveAnswers(attemptId, uid, entries, { now = Date.now(), graceMs = 0, strict = true } = {}) {
  return db.runTransaction(async (t) => {
    const ref = attempts().doc(attemptId);
    const s = await t.get(ref);
    if (!s.exists || s.data().userId !== uid) throw notFound('Attempt');
    const a = s.data();
    if (a.status !== 'in_progress') throw new HttpError(409, 'This attempt has already been submitted');
    if (now > a.expiresAt + graceMs) throw new HttpError(409, 'Time is up');
    const update = {};
    for (const { questionId, optionId } of entries) {
      const q = a.questions[questionId];
      if (!q || (optionId != null && !q.options[optionId])) {
        if (strict) throw new HttpError(q ? 400 : 404, q ? 'Invalid option' : 'Question not found');
        continue;
      }
      update[`answers.${questionId}`] = optionId == null ? FieldValue.delete() : optionId;
    }
    if (Object.keys(update).length) t.update(ref, update);
    return Math.max(0, Math.ceil((a.expiresAt - now) / 1000));
  });
}

/** Grade and lock the attempt. Idempotent. Time taken is capped at expiresAt. */
export async function finalizeAttempt(attemptId, reason, now = Date.now()) {
  return db.runTransaction(async (t) => {
    const ref = attempts().doc(attemptId);
    const s = await t.get(ref);
    if (!s.exists || s.data().status !== 'in_progress') return false;
    const a = s.data();
    const uRef = usageRef(a.userId, a.quizId);
    const us = await t.get(uRef);

    const submittedAt = Math.min(now, a.expiresAt);
    let correct = 0, incorrect = 0, unanswered = 0;
    a.questions.forEach((q, i) => {
      const sel = a.answers?.[i];
      if (sel == null) { unanswered++; return; }
      q.options[sel]?.correct ? correct++ : incorrect++;
    });
    const total = a.questions.length;
    const percentage = total ? Math.round((correct / total) * 10000) / 100 : 0;
    const result = {
      totalQuestions: total, correct, incorrect, unanswered, score: correct, percentage,
      timeTakenSeconds: Math.round((submittedAt - a.startedAt) / 1000),
    };
    const best = us.data()?.bestPercentage;

    t.update(ref, { status: 'submitted', submitReason: reason, submittedAt, result });
    t.set(uRef, { openAttemptId: null, lastAttemptId: attemptId, bestPercentage: best == null ? percentage : Math.max(best, percentage) }, { merge: true });
    t.set(db.collection('users').doc(a.userId), { attemptsCompleted: FieldValue.increment(1), percentageSum: FieldValue.increment(percentage), lastActive: submittedAt }, { merge: true });
    t.set(db.doc('meta/stats'), { completed: FieldValue.increment(1), percentageSum: FieldValue.increment(percentage) }, { merge: true });
    return true;
  });
}

export function resultView(a, { withReview = true } = {}) {
  const r = a.result;
  if (!r) throw notFound('Result');
  const out = {
    attemptId: a.id, quizId: a.quizId, quizTitle: a.quizTitle, submitReason: a.submitReason,
    startedAt: isoMs(a.startedAt), submittedAt: isoMs(a.submittedAt), durationMinutes: a.durationMinutes,
    totalQuestions: r.totalQuestions, correct: r.correct, incorrect: r.incorrect, unanswered: r.unanswered,
    score: r.score, percentage: r.percentage, timeTakenSeconds: r.timeTakenSeconds,
  };
  if (withReview) {
    out.review = a.questions.map((q, i) => {
      const sel = a.answers?.[i] ?? null;
      return {
        position: i + 1, text: q.text, explanation: q.explanation, sourceRef: q.sourceRef,
        options: q.options.map((o, idx) => ({ id: idx, text: o.text, correct: o.correct })),
        selected: sel, isCorrect: sel == null ? null : !!q.options[sel]?.correct,
      };
    });
  }
  return out;
}

/** Safety net for serverless (no background process): grade attempts whose timer has run out. */
export async function sweepExpired(limit = 100, now = Date.now()) {
  try {
    const snap = await attempts().where('status', '==', 'in_progress').where('expiresAt', '<=', now).limit(limit).get();
    for (const d of snap.docs) await finalizeAttempt(d.id, 'timeout', now).catch((e) => console.error('sweep failed', d.id, e));
    return snap.size;
  } catch (e) {
    console.error('sweepExpired failed (is the firestore index deployed?)', e.message);
    return 0;
  }
}

export const answerSchema = z.object({ questionId: z.number().int().min(0), optionId: z.number().int().min(0).nullable() });
