import { bookDto, deleteBook } from '@/lib/server/books.js';
import { db } from '@/lib/server/firebase.js';
import { aiStatus } from '@/lib/server/ai/index.js';
import { jobDto } from '@/lib/server/generation.js';
import { idParam, notFound, route } from '@/lib/server/http.js';

export const GET = route(async ({ params }) => {
  const id = idParam(params.id);
  const ref = db.collection('books').doc(id);
  const [snap, secs, jobs, qs] = await Promise.all([
    ref.get(),
    ref.collection('sections').orderBy('position').get(),
    db.collection('generationJobs').where('bookId', '==', id).get(),
    db.collection('questions').where('bookId', '==', id).select('sectionId').get(),
  ]);
  if (!snap.exists) throw notFound('Book');
  const perSection = new Map();
  for (const d of qs.docs) perSection.set(d.data().sectionId, (perSection.get(d.data().sectionId) || 0) + 1);
  return {
    ai: aiStatus(),
    book: await bookDto(id, snap.data()),
    sections: secs.docs.map((d) => {
      const s = d.data();
      return {
        id: d.id, position: s.position, title: s.title, pageStart: s.pageStart, pageEnd: s.pageEnd,
        chars: s.content.length, preview: s.content.slice(0, 240), questionCount: perSection.get(d.id) || 0,
      };
    }),
    jobs: jobs.docs.map((d) => jobDto(d.id, d.data())).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10),
  };
}, { auth: 'admin' });

export const DELETE = route(async ({ params }) => {
  if (!(await deleteBook(idParam(params.id)))) throw notFound('Book');
  return { ok: true };
}, { auth: 'admin' });
