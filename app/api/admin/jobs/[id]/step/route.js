import { stepJob } from '@/lib/server/generation.js';
import { idParam, route } from '@/lib/server/http.js';

export const maxDuration = 300;

/** Runs the next batch (one model call). Idempotent and lock-protected: safe to call repeatedly / from several tabs. */
export const POST = route(async ({ params }) => ({ job: await stepJob(idParam(params.id)) }), { auth: 'admin' });
