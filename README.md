# QuizForge — AI quiz platform (Next.js + Firebase)

Admins upload books (PDF/TXT/MD), generate MCQs with an LLM, review/approve them, and publish timed quizzes.
Students take quizzes with a **server-enforced timer** and **server-side grading**.
Design, data model and security model: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Local development (no Firebase project needed)
Requires Node 20.6+ and Java 11+ (for the Firestore emulator).

```bash
npm install
cp .env.example .env.local        # emulator settings are on by default
npm run emulators                 # terminal 1: Auth + Firestore emulators
npm run seed:admin                # terminal 2: creates admin@example.com (set ADMIN_PASSWORD first, or one is printed)
npm run dev
```
Open http://localhost:3000. Admin sign-in: http://localhost:3000/admin/login

## Using a real Firebase project
1. Firebase console: create a project, enable **Authentication → Email/Password**, create a **Firestore** database (production mode).
2. Project settings → Your apps → add a **Web app**; copy its config into `NEXT_PUBLIC_FIREBASE_*` in `.env.local`.
3. Project settings → Service accounts → **Generate new private key**; put the JSON (one line, or base64) in `FIREBASE_SERVICE_ACCOUNT`. Never commit it.
4. Remove/comment the emulator variables in `.env.local`, then `npm run seed:admin` to create the admin.
5. Deploy rules and indexes: `npx firebase-tools deploy --only firestore:rules,firestore:indexes` (rules deny all client access; the app talks to Firestore only through the server).
6. (Optional) set `FIREBASE_STORAGE_BUCKET` to keep the original uploaded files in Cloud Storage.

Production: `npm run build && npm start`, with `NODE_ENV=production`. Deploy anywhere that runs Node (Vercel, Cloud Run, a VM). On Vercel note the ~4.5 MB request-body limit for uploads (lower `MAX_UPLOAD_MB` or self-host), and add a cron hitting `/api/cron/sweep` with `Authorization: Bearer $CRON_SECRET`.

## AI providers
`AI_PROVIDER=mock` (default, offline, basic cloze questions, demos only) · `anthropic` (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`) · `openai` (`OPENAI_API_KEY`; `OPENAI_BASE_URL` for any OpenAI-compatible server).
New vendor = one `complete({system,user}) => text` function in `lib/server/ai/providers/` + one line in `lib/server/ai/index.js`.

## Tests
The automated integration suite is being rewritten for the Firebase backend and is not included yet. Manual check: `npm run emulators`, `npm run seed:data`, `npm run dev:local`.

## Limits
Scanned (image-only) PDFs are rejected (no OCR). 1 point per question. 
# sabir-quiz-forge
