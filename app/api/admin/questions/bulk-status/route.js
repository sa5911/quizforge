import { z } from 'zod';
import { db, nowIso } from '@/lib/server/firebase.js';
import { body, route } from '@/lib/server/http.js';
import { statusSchema } from '@/lib/server/questions.js';

export const POST = route(async ({ req }) => {
  const { ids, status } = await body(req, z.object({ ids: z.array(z.string().max(128)).min(1).max(500), status: statusSchema }));
  const snaps = await db.getAll(...ids.map((id) => db.collection('questions').doc(id)));
  const batch = db.batch();
  let updated = 0;
  for (const s of snaps) if (s.exists) { batch.update(s.ref, { status, updatedAt: nowIso() }); updated++; }
  await batch.commit();
  return { updated };
}, { auth: 'admin' });
