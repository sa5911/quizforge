import { z } from 'zod';
import { adminAuth, db } from '@/lib/server/firebase.js';
import { body, route } from '@/lib/server/http.js';

const dto = (uid, u, role) => ({ id: uid, name: u.name, email: u.email, role, createdAt: u.createdAt });

export const GET = route(async ({ user }) => {
  const u = (await db.collection('users').doc(user.uid).get()).data() || { name: user.name, email: user.email };
  return { user: dto(user.uid, u, user.role) };
});

export const PATCH = route(async ({ req, user }) => {
  const { name } = await body(req, z.object({ name: z.string().trim().min(2).max(80) }));
  await adminAuth.updateUser(user.uid, { displayName: name });
  await db.collection('users').doc(user.uid).set({ name }, { merge: true });
  const u = (await db.collection('users').doc(user.uid).get()).data();
  return { user: dto(user.uid, u, user.role) };
});
