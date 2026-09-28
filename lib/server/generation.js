import { db, nowIso } from './firebase.js';
import { getProvider } from './ai/index.js';
import { rawQuestionSchema } from './ai/prompt.js';
import { conflict, notFound } from './http.js';

const BATCH = 5;
const MAX_PASSAGE = 12000;
const LOCK_MS = 170_000;

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => new Set(normalize(s).split(' ').filter((w) => w.length > 2));

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

/** Validate one model question; returns a clean question (options shuffled) or null. */
export function cleanQuestion(raw, optionCount) {
  const parsed = rawQuestionSchema.safeParse(raw);
  if (!parsed.success) return null;
  const q = parsed.data;
  if (q.options.length !== optionCount || q.correctIndex >= q.options.length) return null;
  if (new Set(q.options.map(normalize)).size !== q.options.length) return null;
  const correctText = q.options[q.correctIndex];
  const options = shuffle(q.options); // remove any positional bias from the model
  return { text: q.question, explanation: q.explanation, sourceRef: q.sourceReference || '', options, correctIndex: options.indexOf(correctText) };
}

/** Spread `count` questions over sections, at most BATCH per model call. */
export function planBatches(sections, count) {
  const usable = sections.length > count ? sections.filter((_, i) => i % Math.ceil(sections.length / count) === 0).slice(0, count) : sections;
  const per = usable.map(() => Math.floor(count / usable.length));
  for (let i = 0; i < count % usable.length; i++) per[i]++;
  const batches = [];
  usable.forEach((section, i) => {
    for (let left = per[i]; left > 0; left -= BATCH) batches.push({ sectionId: section.id, n: Math.min(BATCH, left) });
  });
  return batches;
}

export const jobDto = (id, j) => ({
  id, bookId: j.bookId, status: j.status, requested: j.requested, produced: j.produced, skippedDuplicates: j.skippedDuplicates,
  difficulty: j.difficulty, optionCount: j.optionCount, provider: j.provider ?? null, error: j.error ?? null, createdAt: j.createdAt,
  progress: { done: j.cursor, total: j.batches.length },
});

/**
 * Serverless functions can't run long background work, so a job is a persisted plan of small batches.
 * The admin UI calls stepJob() repeatedly; each call does ONE model call and is safe to retry.
 */
export async function createJob({ bookId, count, difficulty, optionCount, sectionIds }) {
  const bookRef = db.collection('books').doc(bookId);
  const book = await bookRef.get();
  if (!book.exists) throw notFound('Book');
  const running = await db.collection('generationJobs').where('bookId', '==', bookId).where('status', '==', 'running').limit(1).get();
  if (!running.empty) {
    const j = running.docs[0].data();
    const stale = Date.parse(j.createdAt) < Date.now() - 30 * 60_000 && (j.lockUntil || 0) < Date.now();
    if (stale) await running.docs[0].ref.update({ status: 'failed', error: 'Abandoned' });
    else throw conflict('A generation job is already running for this book');
  }
  let sections = (await bookRef.collection('sections').orderBy('position').select('position').get()).docs.map((d) => ({ id: d.id }));
  if (sectionIds?.length) sections = sections.filter((s) => sectionIds.includes(s.id));
  if (!sections.length) throw conflict('The book has no sections to generate from');
  const ref = db.collection('generationJobs').doc();
  const job = {
    bookId, status: 'running', requested: count, produced: 0, skippedDuplicates: 0, difficulty, optionCount,
    batches: planBatches(sections, count), cursor: 0, lockUntil: 0, provider: null, error: null, lastError: null, createdAt: nowIso(),
  };
  await ref.set(job);
  return jobDto(ref.id, job);
}

export async function stepJob(jobId) {
  const ref = db.collection('generationJobs').doc(jobId);
  const now = Date.now();
  const claim = await db.runTransaction(async (t) => {
    const s = await t.get(ref);
    if (!s.exists) throw notFound('Job');
    const j = s.data();
    if (j.status !== 'running' || j.lockUntil > now) return { job: j, run: false };
    t.update(ref, { lockUntil: now + LOCK_MS });
    return { job: j, run: true };
  });
  const j = claim.job;
  if (!claim.run) return jobDto(jobId, j);

  const fail = async (message) => {
    const upd = { status: 'failed', error: message, lockUntil: 0 };
    await ref.update(upd);
    return jobDto(jobId, { ...j, ...upd });
  };

  let provider;
  try { provider = getProvider(); } catch (e) { return fail(e.message); }

  const { sectionId, n } = j.batches[j.cursor];
  const sectionSnap = await db.collection('books').doc(j.bookId).collection('sections').doc(sectionId).get();
  if (!sectionSnap.exists) return fail('A source section no longer exists');
  const sec = sectionSnap.data();
  const view = { title: sec.title, pageStart: sec.pageStart, pageEnd: sec.pageEnd, content: sec.content.slice(0, MAX_PASSAGE) };

  const existingSnap = await db.collection('questions').where('bookId', '==', j.bookId).select('text').get();
  const existing = existingSnap.docs.map((d) => ({ text: d.data().text, tok: tokens(d.data().text) }));

  let produced = 0, dups = 0, lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await provider.generateQuestions({
        section: view, count: n, difficulty: j.difficulty, optionCount: j.optionCount, avoid: existing.slice(-25).map((e) => e.text),
      });
      const batch = db.batch();
      for (const r of raw.slice(0, n + 2)) {
        const q = cleanQuestion(r, j.optionCount);
        if (!q) continue;
        const tok = tokens(q.text);
        if (existing.some((e) => jaccard(tok, e.tok) >= 0.7)) { dups++; continue; }
        const at = nowIso();
        batch.set(db.collection('questions').doc(), {
          bookId: j.bookId, sectionId, text: q.text, explanation: q.explanation, difficulty: j.difficulty,
          sourceRef: q.sourceRef || `${sec.title}${sec.pageStart ? `, p. ${sec.pageStart}` : ''}`,
          status: 'pending', origin: 'ai', aiProvider: provider.name, options: q.options, correctIndex: q.correctIndex,
          createdAt: at, updatedAt: at,
        });
        existing.push({ text: q.text, tok });
        produced++;
      }
      await batch.commit();
      lastError = null;
      break;
    } catch (e) {
      lastError = e.message;
      produced = 0; dups = 0;
      console.error(`Generation job ${jobId}: batch failed (try ${attempt + 1}):`, e.message);
    }
  }

  const next = {
    cursor: j.cursor + 1, produced: j.produced + produced, skippedDuplicates: j.skippedDuplicates + dups,
    provider: provider.name, lockUntil: 0, lastError: lastError ?? j.lastError,
  };
  if (next.cursor >= j.batches.length) {
    if (next.produced === 0 && next.lastError) { next.status = 'failed'; next.error = next.lastError; }
    else {
      next.status = 'done';
      next.error = next.produced < j.requested ? `Generated ${next.produced} of ${j.requested} requested (the rest were duplicates, invalid, or unsupported by the text).` : null;
    }
  }
  await ref.update(next);
  return jobDto(jobId, { ...j, ...next });
}
