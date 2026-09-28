import { db } from '@/lib/server/firebase.js';
import { idParam, notFound, route } from '@/lib/server/http.js';

export const GET = route(async ({ params }) => {
  const s = await db.collection('books').doc(idParam(params.id)).collection('sections').doc(idParam(params.sid)).get();
  if (!s.exists) throw notFound('Section');
  const d = s.data();
  return { section: { id: s.id, title: d.title, pageStart: d.pageStart, pageEnd: d.pageEnd, content: d.content } };
}, { auth: 'admin' });
