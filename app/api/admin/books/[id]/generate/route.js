import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createJob } from '@/lib/server/generation.js';
import { body, idParam, route } from '@/lib/server/http.js';

const schema = z.object({
  count: z.number().int().min(1).max(100),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  optionCount: z.number().int().min(2).max(6).default(4),
  sectionIds: z.array(z.string().max(128)).max(500).optional(),
});

/** Creates a job (a plan of small batches). The UI then drives it with POST /api/admin/jobs/:id/step. */
export const POST = route(async ({ req, params }) => {
  const b = await body(req, schema);
  const job = await createJob({ bookId: idParam(params.id), ...b });
  return NextResponse.json({ job }, { status: 202 });
}, { auth: 'admin' });
