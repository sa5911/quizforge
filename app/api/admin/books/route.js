import { NextResponse } from 'next/server';
import path from 'node:path';
import { bookDto, createBook } from '@/lib/server/books.js';
import { config } from '@/lib/server/config.js';
import { db } from '@/lib/server/firebase.js';
import { badRequest, route } from '@/lib/server/http.js';

export const maxDuration = 120;

const ALLOWED = { '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown' };

export const GET = route(async () => {
  const snap = await db.collection('books').orderBy('createdAt', 'desc').get();
  return { books: await Promise.all(snap.docs.map((d) => bookDto(d.id, d.data()))) };
}, { auth: 'admin' });

export const POST = route(async ({ req, user }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') throw badRequest('A file is required (field name "file")');
  const ext = path.extname(file.name || '').toLowerCase();
  if (!(ext in ALLOWED)) throw badRequest('Only PDF, TXT or MD files are supported');
  if (file.size > config.maxUploadBytes) throw badRequest(`File is too large (max ${Math.round(config.maxUploadBytes / 1048576)} MB)`);
  const title = String(form.get('title') || '').trim().slice(0, 200) || path.parse(file.name).name;
  const id = await createBook({
    buffer: Buffer.from(await file.arrayBuffer()), ext, filename: file.name.slice(0, 255), title, mimeType: ALLOWED[ext], uid: user.uid,
  });
  const snap = await db.collection('books').doc(id).get();
  return NextResponse.json({ book: await bookDto(id, snap.data()) }, { status: 201 });
}, { auth: 'admin' });
