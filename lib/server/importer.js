import { db, nowIso } from './firebase.js';
import { badRequest } from './http.js';
import { questionInput } from './questions.js';

const LETTERS = 'ABCDEF';
const MAX_ITEMS = 500;
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const optText = (o) => (typeof o === 'string' || typeof o === 'number' ? String(o).trim() : String(o?.text ?? o?.label ?? o?.option ?? o?.value ?? '').trim());

/**
 * Accepts many reasonable JSON shapes for one question and returns the canonical form.
 *   question | text | q
 *   options | choices   (array of strings / {text} objects, or a {A:"..",B:".."} map)
 *   answer | correctAnswer | correct_answer | correct   = option text, letter ("B", "B)"), or 1-based number
 *   correctIndex | correct_index                        = 0-based number
 *   an option object with correct/isCorrect:true also works
 *   explanation | reason,  difficulty,  source | sourceRef | reference
 */
export function normalizeItem(raw, defaults) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Each question must be an object');
  const text = String(raw.question ?? raw.text ?? raw.q ?? '').trim();

  let rawOpts = raw.options ?? raw.choices;
  let labels = null;
  if (rawOpts && typeof rawOpts === 'object' && !Array.isArray(rawOpts)) {
    labels = Object.keys(rawOpts);
    rawOpts = Object.values(rawOpts);
  }
  if (!Array.isArray(rawOpts)) throw new Error('"options" must be an array of answer choices');
  const options = rawOpts.map(optText);

  let correctIndex = -1;
  const flagged = rawOpts.findIndex((o) => o && typeof o === 'object' && (o.correct === true || o.isCorrect === true));
  const zeroBased = raw.correctIndex ?? raw.correct_index;
  const ans = raw.answer ?? raw.correctAnswer ?? raw.correct_answer ?? raw.correct;

  if (Number.isInteger(zeroBased)) correctIndex = zeroBased;
  else if (flagged >= 0) correctIndex = flagged;
  else if (typeof ans === 'number') correctIndex = ans - 1;
  else if (typeof ans === 'string' && ans.trim()) {
    const a = ans.trim();
    const byText = options.findIndex((o) => norm(o) === norm(a));
    const byLabel = labels ? labels.findIndex((l) => norm(l) === norm(a)) : -1;
    const m = a.match(/^([A-Fa-f])(?:[.):\-]\s*(.*))?$/);
    if (byText >= 0) correctIndex = byText;
    else if (byLabel >= 0) correctIndex = byLabel;
    else if (m) {
      const idx = LETTERS.indexOf(m[1].toUpperCase());
      correctIndex = m[2] && options.findIndex((o) => norm(o) === norm(m[2])) >= 0 ? options.findIndex((o) => norm(o) === norm(m[2])) : idx;
    }
  }
  if (correctIndex < 0 || correctIndex >= options.length) throw new Error('Could not tell which option is the correct answer (use "answer": "<option text>" or "answer": "B")');

  const difficulty = ['easy', 'medium', 'hard'].includes(String(raw.difficulty).toLowerCase()) ? String(raw.difficulty).toLowerCase() : defaults.difficulty;
  const parsed = questionInput.safeParse({
    text, options, correctIndex, difficulty, explanation: String(raw.explanation ?? raw.reason ?? '').trim(),
    sourceRef: raw.source ?? raw.sourceRef ?? raw.reference ?? null, bookId: defaults.bookId ?? null,
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join('.') || 'question'}: ${i.message}`).join('; '));
  return parsed.data;
}

export function extractItems(payload) {
  const items = Array.isArray(payload) ? payload : payload?.questions;
  if (!Array.isArray(items)) throw badRequest('JSON must be an array of questions, or an object with a "questions" array');
  if (!items.length) throw badRequest('No questions found in the JSON');
  if (items.length > MAX_ITEMS) throw badRequest(`Too many questions (max ${MAX_ITEMS} per import)`);
  return items;
}

/** Validates, de-duplicates and (unless dryRun) writes the questions. Returns a summary. */
export async function importQuestions({ payload, status, bookId, difficulty, skipInvalid, dryRun, createQuiz }) {
  const items = extractItems(payload);
  const valid = [];
  const invalid = [];
  items.forEach((raw, i) => {
    try { valid.push({ index: i, q: normalizeItem(raw, { difficulty, bookId }) }); }
    catch (e) { invalid.push({ index: i + 1, message: e.message }); }
  });

  const existing = new Map(); // normalized text -> { id, status }
  (await db.collection('questions').select('text', 'status').get()).docs.forEach((d) => existing.set(norm(d.data().text), { id: d.id, status: d.data().status }));
  const seen = new Set();
  const fresh = [];
  const quizIds = [];
  let duplicates = 0;
  for (const v of valid) {
    const key = norm(v.q.text);
    const dup = existing.get(key);
    if (dup || seen.has(key)) {
      duplicates++;
      if (dup?.status === 'approved') quizIds.push(dup.id); // reuse an already-approved identical question in the new quiz
      continue;
    }
    seen.add(key);
    fresh.push(v);
    quizIds.push(null); // placeholder, filled with the new id below
  }

  const summary = { total: items.length, valid: valid.length, invalid, duplicates, willCreate: fresh.length, created: 0, quizId: null, dryRun };
  if (dryRun) return summary;
  if (invalid.length && !skipInvalid) return { ...summary, blocked: true };

  const at = nowIso();
  const newIds = [];
  for (let i = 0; i < fresh.length; i += 400) {
    const batch = db.batch();
    for (const { q } of fresh.slice(i, i + 400)) {
      const ref = db.collection('questions').doc();
      newIds.push(ref.id);
      batch.set(ref, {
        bookId: q.bookId ?? null, sectionId: null, text: q.text, explanation: q.explanation, difficulty: q.difficulty, sourceRef: q.sourceRef ?? null,
        status, origin: 'manual', options: q.options, correctIndex: q.correctIndex, createdAt: at, updatedAt: at,
      });
    }
    await batch.commit();
  }
  summary.created = newIds.length;

  if (createQuiz) {
    let n = 0;
    const questionIds = quizIds.map((id) => id ?? newIds[n++]).filter(Boolean);
    const ref = db.collection('quizzes').doc();
    await ref.set({ ...createQuiz, status: 'draft', questionIds, attemptCount: 0, createdAt: at, updatedAt: at });
    summary.quizId = ref.id;
    summary.quizQuestionCount = questionIds.length;
  }
  return summary;
}
