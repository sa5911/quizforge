import { db, bucket, nowIso } from './firebase.js';
import { HttpError } from './http.js';

const TARGET = 3500;       // preferred characters per section
const HARD_MAX = 6000;     // never exceed (split even mid-paragraph)
const MIN_SECTION = 400;   // shorter tails are merged into the previous section
const HEADING = /^\s*(chapter|unit|part|section|lesson|module)\s+([0-9]+|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten)\b.{0,80}$/i;

/** Returns [{ page, text }]. Plain text/markdown are treated as a single "page". */
export async function extractPages(buffer, ext) {
  if (ext === '.pdf') {
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js'); // lib path avoids the package's debug-mode self-test
    const pages = [];
    await pdfParse(buffer, {
      pagerender: async (page) => {
        const content = await page.getTextContent();
        let lastY, text = '';
        for (const item of content.items) {
          text += lastY === undefined || lastY === item.transform[5] ? item.str : `\n${item.str}`;
          lastY = item.transform[5];
        }
        pages.push({ page: page.pageNumber, text });
        return text;
      },
    });
    return pages.sort((a, b) => a.page - b.page);
  }
  return [{ page: 1, text: buffer.toString('utf8') }];
}

const clean = (t) => t.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/\r/g, '');

/** Split page text into sections at chapter headings / size limits, remembering page ranges. */
export function chunkPages(pages) {
  const sections = [];
  let cur = null;
  let heading = null;
  const start = (page) => {
    const parts = sections.filter((s) => s.heading === heading).length; // same chapter split by size
    cur = { heading, title: parts && heading ? `${heading} (cont.)` : heading, content: '', pageStart: page, pageEnd: page };
  };
  const flush = () => {
    if (cur && cur.content.trim().length) sections.push(cur);
    cur = null;
  };

  for (const { page, text } of pages) {
    for (const rawLine of clean(text).split('\n')) {
      const line = rawLine.trim();
      if (!line) { if (cur) cur.content += '\n'; continue; }
      if (HEADING.test(line) && line.length < 90) {
        if (cur && cur.content.trim().length >= MIN_SECTION) flush(); else if (cur && !cur.content.trim()) cur = null;
        heading = line;
        if (!cur) start(page);
        else { cur.title = cur.title || heading; cur.heading = cur.heading || heading; }
      }
      if (!cur) start(page);
      cur.content += `${line}\n`;
      cur.pageEnd = page;
      const atBoundary = /[.!?"”]$/.test(line);
      if ((cur.content.length >= TARGET && atBoundary) || cur.content.length >= HARD_MAX) flush();
    }
  }
  flush();

  const merged = [];
  for (const s of sections) {
    const prev = merged[merged.length - 1];
    if (prev && s.content.trim().length < MIN_SECTION) {
      prev.content += `\n${s.content}`;
      prev.pageEnd = s.pageEnd;
    } else merged.push({ ...s });
  }
  return merged.map((s, i) => ({
    position: i + 1,
    title: (s.title || `Section ${i + 1}`).slice(0, 120),
    pageStart: s.pageStart,
    pageEnd: s.pageEnd,
    content: s.content.replace(/\n{3,}/g, '\n\n').trim(),
  }));
}

/** Extract + chunk + persist. Throws HttpError(422) if nothing readable was found. */
export async function createBook({ buffer, ext, filename, title, mimeType, uid }) {
  let pages;
  try {
    pages = await extractPages(buffer, ext);
  } catch (e) {
    console.error('extract failed', e);
    throw new HttpError(422, 'Could not read this file. Is it a valid, unencrypted PDF?');
  }
  const sections = chunkPages(pages);
  const chars = sections.reduce((n, s) => n + s.content.length, 0);
  if (chars < 200) throw new HttpError(422, 'No readable text found. Scanned/image-only PDFs are not supported (no OCR).');

  const ref = db.collection('books').doc();
  let storagePath = null;
  const b = bucket();
  if (b) {
    storagePath = `books/${ref.id}/original${ext}`;
    await b.file(storagePath).save(buffer, { contentType: mimeType, resumable: false });
  }
  await ref.set({
    title, filename, mimeType, sizeBytes: buffer.length, status: 'ready', error: null, storagePath,
    pageCount: pages.length, charCount: chars, sectionCount: sections.length, uploadedBy: uid, createdAt: nowIso(),
  });
  for (let i = 0; i < sections.length; i += 400) {
    const batch = db.batch();
    for (const s of sections.slice(i, i + 400)) batch.set(ref.collection('sections').doc(), s);
    await batch.commit();
  }
  return ref.id;
}

export async function deleteBook(id) {
  const ref = db.collection('books').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;
  // Questions survive (detached) so quizzes and history are never affected.
  const qs = await db.collection('questions').where('bookId', '==', id).get();
  for (let i = 0; i < qs.docs.length; i += 400) {
    const batch = db.batch();
    qs.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { bookId: null, sectionId: null }));
    await batch.commit();
  }
  await db.recursiveDelete(ref);
  const b = bucket();
  if (b && snap.data().storagePath) await b.file(snap.data().storagePath).delete({ ignoreNotFound: true }).catch(() => {});
  return true;
}

export async function bookDto(id, b) {
  const [q, p] = await Promise.all([
    db.collection('questions').where('bookId', '==', id).count().get(),
    db.collection('questions').where('bookId', '==', id).where('status', '==', 'pending').count().get(),
  ]);
  return {
    id, title: b.title, filename: b.filename, sizeBytes: b.sizeBytes, status: b.status, error: b.error, pageCount: b.pageCount,
    charCount: b.charCount, createdAt: b.createdAt, sectionCount: b.sectionCount, questionCount: q.data().count, pendingCount: p.data().count,
  };
}

