# Architecture (Next.js + Firebase)

## Stack
| Layer | Choice | Why |
|---|---|---|
| App + API | **Next.js (App Router)**; API = Route Handlers under `app/api` | One deployable; UI and API share types/validation |
| Auth | **Firebase Authentication** (email/password) → exchanged for an **httpOnly Firebase session cookie** | Password storage/reset/abuse protection handled by Firebase; token never reachable from JS |
| Database | **Cloud Firestore**, accessed **only by the server** (`firebase-admin`) | Security rules deny all client access, so answers/timers/scores can't be read or tampered with from the browser |
| Files | Cloud Storage (optional, original uploads) | Only used if `FIREBASE_STORAGE_BUCKET` is set |
| Validation | zod on every request | |
| AI | `lib/server/ai/` provider interface (Anthropic, OpenAI-compatible, mock) | Swap with `AI_PROVIDER` env only |

## Trust boundaries
* Browser ⇄ Firebase Auth: only to verify a password and get an ID token.
* Browser ⇄ Next API: everything else. `POST /api/auth/session` verifies the ID token (must be < 5 min old) and sets the session cookie (5 days, `HttpOnly; SameSite=Lax; Secure` in prod).
* Every API route runs through `route()` (`lib/server/http.js`): origin check (CSRF), session verification, role check, zod parsing, error mapping.
* Role comes from a **signed custom claim** (`role: "admin"`) that can only be set with the Admin SDK (`npm run seed:admin`). Registration always creates students. Admin routes also check that the session isn't revoked.
* `firestore.rules` / `storage.rules`: `allow read, write: if false`.

## Server-authoritative quiz rules
* `expiresAt = startedAt + durationMinutes` is computed once, when the attempt document is created, and stored. The client only gets `remainingSeconds` (computed against server time) and counts down with a monotonic clock; it re-syncs on tab focus and every 60 s.
* Answers are saved in Firestore **transactions** that re-check `status === 'in_progress'` and `now <= expiresAt` (+3 s grace, only for the final batch sent with *submit*).
* Grading (`finalizeAttempt`) is a transaction: idempotent, time-capped at `expiresAt`, writes result, updates per-user/per-quiz usage and aggregate counters atomically.
* Expiry without a background process: attempts are graded lazily on any read/write of them, when a student opens their history/quiz list, when an admin opens stats/results, and by `GET /api/cron/sweep` (Bearer `CRON_SECRET`, wire to Vercel Cron / Cloud Scheduler).
* The attempt view sent to the browser is built by `attemptView()` and never contains `correct`/`explanation`; those are returned by `resultView()` only after submission.

## Firestore data model
| Collection | Key fields |
|---|---|
| `users/{uid}` | name, email, role, createdAt, attemptsStarted/Completed, percentageSum, lastActive |
| `books/{id}` | title, filename, status, pageCount, sectionCount, storagePath |
| `books/{id}/sections/{sid}` | position, title, pageStart, pageEnd, content |
| `questions/{id}` | text, options[], correctIndex, explanation, difficulty, sourceRef, status `pending/approved/rejected`, origin `ai/manual`, aiProvider, bookId, sectionId |
| `quizzes/{id}` | title, description, instructions, durationMinutes (default 60), maxAttempts, status `draft/published`, questionIds[] (ordered), attemptCount |
| `attempts/{id}` | quizId, userId, userName/Email, quizTitle, durationMinutes, status, startedAt/expiresAt/submittedAt (ms), **questions[] (immutable snapshot incl. correct flags)**, `answers{index→option}`, `result{…}`, submitReason |
| `usage/{uid_quizId}` | attemptsUsed, openAttemptId, lastAttemptId, bestPercentage (guarantees ≤1 open attempt; enforces `maxAttempts` inside the start transaction) |
| `generationJobs/{id}` | bookId, status, requested, produced, batches[], cursor, lockUntil |
| `meta/stats` | completed, percentageSum |

Mapping to the requested entities: User=`users`, Book=`books`, BookSection=`books/*/sections`, Question+QuestionOption=`questions` (options embedded → atomic edits), Quiz+QuizQuestion=`quizzes.questionIds`, QuizAttempt=`attempts`, UserAnswer=`attempts.answers`, Result=`attempts.result`.

History integrity: an attempt carries its own copy of the questions, so editing/deleting questions, books or quizzes never changes past results. Quizzes with attempts can't be deleted; questions used in a quiz can't be deleted.

## AI pipeline (serverless-friendly)
`upload → extract (pdf-parse, per page) → chunk (chapter headings, ~3.5k chars, page ranges) → sections saved` (synchronous with the upload).
`POST /books/:id/generate` stores a **plan of small batches** (≤5 questions each, spread across sections) in `generationJobs`. The admin page then calls `POST /admin/jobs/:id/step` repeatedly; each call claims a lock, makes **one** model call, validates (zod, option count, one correct, distinct options), shuffles options server-side, de-duplicates (normalised text + Jaccard vs. existing questions), stores as `pending`. Jobs survive tab closes (reopen the book page to continue) and each request stays well below serverless time limits.

Provider contract: `generateQuestions({ section, count, difficulty, optionCount, avoid }) → RawQuestion[]`.

## API
Auth: `POST /api/auth/{register,session,logout}`, `GET|PATCH /api/auth/me` (password change uses the Firebase client SDK).
Student: `GET /api/quizzes`, `GET /api/quizzes/:id`, `POST /api/quizzes/:id/attempts`, `GET /api/attempts`, `GET /api/attempts/:id`, `PUT /api/attempts/:id/answers`, `POST /api/attempts/:id/submit`, `GET /api/attempts/:id/result`.
Admin (`/api/admin/*`): `stats`; `books` (multipart upload), `books/:id`, `books/:id/sections/:sid`, `books/:id/generate`, `jobs/:id/step`; `questions`, `questions/:id`, `questions/:id/status`, `questions/bulk-status`; `quizzes`, `quizzes/:id`, `quizzes/:id/{questions,publish,unpublish}`; `users`; `results`, `results/:attemptId`.
Ops: `GET /api/cron/sweep`.

## Scaling notes
Question/user lists filter in memory over one equality query (no composite indexes needed; fine to a few thousand docs). Admin result lists use the composite indexes in `firestore.indexes.json` (`firebase deploy --only firestore:indexes`).
