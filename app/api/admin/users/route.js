import { z } from 'zod';
import { db } from '@/lib/server/firebase.js';
import { pagination, query, route } from '@/lib/server/http.js';

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

export const GET = route(async ({ req }) => {
  const q = query(req, pagination.extend({ search: z.string().trim().max(100).optional() }));
  const snap = await db.collection('users').get();
  const needle = q.search?.toLowerCase();
  const all = snap.docs.filter((d) => !needle || d.data().name?.toLowerCase().includes(needle) || d.data().email?.toLowerCase().includes(needle))
    .sort((a, b) => (b.data().createdAt || '').localeCompare(a.data().createdAt || ''));
  const page = all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
  return {
    total: all.length, page: q.page, pageSize: q.pageSize,
    users: page.map((d) => {
      const u = d.data();
      return {
        id: d.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt, attempts: u.attemptsStarted || 0,
        averagePercentage: u.attemptsCompleted ? Math.round((u.percentageSum / u.attemptsCompleted) * 10) / 10 : null, lastActive: iso(u.lastActive),
      };
    }),
  };
}, { auth: 'admin' });
