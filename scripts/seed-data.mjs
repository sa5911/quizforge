// Seeds demo data: admin + student accounts, a book, questions (approved + pending), quizzes and one finished attempt.
// Usage: npm run seed:data   (targets the emulators if FIRESTORE_EMULATOR_HOST is set, otherwise the real project)
import { existsSync } from 'node:fs';

for (const f of ['.env.local', '.env']) if (existsSync(f)) process.loadEnvFile(f);
const { adminAuth, db, FieldValue, nowIso } = await import('../lib/server/firebase.js');

async function ensureUser(email, password, name, role) {
  let u;
  try { u = await adminAuth.getUserByEmail(email); await adminAuth.updateUser(u.uid, { password, displayName: name }); }
  catch (e) { if (e.code !== 'auth/user-not-found') throw e; u = await adminAuth.createUser({ email, password, displayName: name }); }
  await adminAuth.setCustomUserClaims(u.uid, { role });
  await db.collection('users').doc(u.uid).set({ name, email, role, createdAt: nowIso(), attemptsStarted: 0, attemptsCompleted: 0, percentageSum: 0 }, { merge: true });
  return u.uid;
}

const adminEmail = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
const adminPw = process.env.ADMIN_PASSWORD || 'ChangeMe-12345';
await ensureUser(adminEmail, adminPw, process.env.ADMIN_NAME || 'Administrator', 'admin');
const studentUid = await ensureUser('student@example.com', 'Student-12345', 'Sam Student', 'student');
await ensureUser('maria@example.com', 'Student-12345', 'Maria Lopez', 'student');

// ---- book + sections
const sections = [
  { title: 'Chapter 1 Cells: The Basic Unit of Life', pageStart: 1, pageEnd: 4, content: 'All living organisms are made of cells. The cell theory states that the cell is the basic unit of life, that all organisms are composed of one or more cells, and that all cells arise from pre-existing cells. Prokaryotic cells, such as bacteria, lack a nucleus and membrane-bound organelles. Eukaryotic cells, found in plants, animals and fungi, contain a nucleus that stores DNA. The mitochondrion produces most of the cell\'s ATP through cellular respiration. Ribosomes assemble proteins by translating messenger RNA. The plasma membrane is a phospholipid bilayer that controls what enters and leaves the cell.' },
  { title: 'Chapter 2 Photosynthesis', pageStart: 5, pageEnd: 9, content: 'Photosynthesis is the process by which plants convert light energy into chemical energy stored in glucose. It takes place in chloroplasts, which contain the green pigment chlorophyll. The light-dependent reactions occur in the thylakoid membranes and produce ATP and NADPH while releasing oxygen from water. The Calvin cycle occurs in the stroma and uses ATP and NADPH to fix carbon dioxide into glucose. Chlorophyll absorbs mostly blue and red light and reflects green light, which is why leaves look green.' },
  { title: 'Chapter 3 Genetics and DNA', pageStart: 10, pageEnd: 14, content: 'DNA is a double helix made of nucleotides containing the bases adenine, thymine, guanine and cytosine. Adenine pairs with thymine and guanine pairs with cytosine. A gene is a segment of DNA that codes for a protein. During transcription, RNA polymerase copies a gene into messenger RNA; during translation, ribosomes read the mRNA to build a protein. Gregor Mendel discovered the basic laws of inheritance by studying pea plants. An allele is a variant form of a gene, and a dominant allele masks the effect of a recessive allele in a heterozygous organism.' },
];
const bookRef = db.collection('books').doc('seed-biology');
await db.recursiveDelete(bookRef);
await bookRef.set({ title: 'Introduction to Biology', filename: 'intro-biology.pdf', mimeType: 'application/pdf', sizeBytes: 482113, status: 'ready', error: null, storagePath: null, pageCount: 14, charCount: sections.reduce((n, s) => n + s.content.length, 0), sectionCount: sections.length, uploadedBy: 'seed', createdAt: nowIso() });
const sectionIds = [];
for (const [i, s] of sections.entries()) {
  const ref = bookRef.collection('sections').doc(`s${i + 1}`);
  await ref.set({ position: i + 1, ...s });
  sectionIds.push(ref.id);
}

// ---- questions [text, options, correctIndex, explanation, difficulty, section]
const Q = [
  ['What does the cell theory state about the cell?', ['It is the basic unit of life', 'It is always visible to the naked eye', 'It only exists in animals', 'It contains no DNA'], 0, 'The cell theory states the cell is the basic unit of life.', 'easy', 0],
  ['Which type of cell lacks a nucleus and membrane-bound organelles?', ['Prokaryotic cell', 'Animal cell', 'Plant cell', 'Fungal cell'], 0, 'Prokaryotic cells such as bacteria lack a nucleus.', 'easy', 0],
  ['Which organelle produces most of the cell\'s ATP?', ['Mitochondrion', 'Ribosome', 'Nucleus', 'Plasma membrane'], 0, 'The mitochondrion produces most ATP through cellular respiration.', 'easy', 0],
  ['What do ribosomes do?', ['Assemble proteins from mRNA', 'Store DNA', 'Produce ATP', 'Absorb light'], 0, 'Ribosomes translate mRNA to assemble proteins.', 'medium', 0],
  ['The plasma membrane is best described as a:', ['Phospholipid bilayer', 'Protein wall', 'Layer of cellulose', 'Sheet of DNA'], 0, 'It is a phospholipid bilayer controlling entry and exit.', 'medium', 0],
  ['Where in the chloroplast do the light-dependent reactions occur?', ['Thylakoid membranes', 'Stroma', 'Nucleus', 'Cell wall'], 0, 'They occur in the thylakoid membranes.', 'medium', 1],
  ['What does the Calvin cycle do?', ['Fixes carbon dioxide into glucose', 'Splits water to release oxygen', 'Copies DNA', 'Builds ribosomes'], 0, 'The Calvin cycle uses ATP and NADPH to fix CO2 into glucose.', 'medium', 1],
  ['Why do leaves look green?', ['Chlorophyll reflects green light', 'Chlorophyll absorbs green light', 'They contain green water', 'DNA is green'], 0, 'Chlorophyll absorbs mostly blue and red and reflects green.', 'easy', 1],
  ['Which molecules are produced by the light-dependent reactions?', ['ATP and NADPH', 'Glucose and DNA', 'RNA and proteins', 'Lipids and starch'], 0, 'They produce ATP and NADPH and release oxygen.', 'hard', 1],
  ['Which base pairs with adenine in DNA?', ['Thymine', 'Cytosine', 'Guanine', 'Uracil'], 0, 'Adenine pairs with thymine.', 'easy', 2],
  ['What is a gene?', ['A segment of DNA that codes for a protein', 'A type of organelle', 'A form of RNA polymerase', 'A pea plant trait'], 0, 'A gene is a segment of DNA coding for a protein.', 'medium', 2],
  ['During transcription, RNA polymerase copies a gene into:', ['Messenger RNA', 'A ribosome', 'A phospholipid', 'A chromosome'], 0, 'Transcription produces messenger RNA.', 'hard', 2],
  ['Who discovered the basic laws of inheritance using pea plants?', ['Gregor Mendel', 'Charles Darwin', 'Louis Pasteur', 'Rosalind Franklin'], 0, 'Mendel studied pea plants.', 'easy', 2],
];
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const oldQ = await db.collection('questions').where('bookId', '==', 'seed-biology').get();
await Promise.all(oldQ.docs.map((d) => d.ref.delete()));
const qids = [];
for (const [i, [text, opts, ci, explanation, difficulty, sec]] of Q.entries()) {
  const correct = opts[ci];
  const options = shuffle(opts);
  const ref = db.collection('questions').doc(`seed-q${i + 1}`);
  const pending = i >= 10; // the last 3 stay "pending" so the review flow has something to do
  await ref.set({
    bookId: 'seed-biology', sectionId: sectionIds[sec], text, explanation, difficulty, sourceRef: `${sections[sec].title}, p. ${sections[sec].pageStart}`,
    status: pending ? 'pending' : 'approved', origin: 'ai', aiProvider: 'mock', options, correctIndex: options.indexOf(correct), createdAt: nowIso(), updatedAt: nowIso(),
  });
  if (!pending) qids.push(ref.id);
}

// ---- quizzes
const quiz = (title, description, instructions, durationMinutes, ids, status) => ({
  title, description, instructions, durationMinutes, maxAttempts: 3, status, questionIds: ids, attemptCount: 0, createdAt: nowIso(), updatedAt: nowIso(),
});
await db.collection('quizzes').doc('seed-quiz-bio').set(quiz('Biology Basics', 'Cells, photosynthesis and genetics.', 'Answer all questions. You may change answers until you submit.', 60, qids, 'published'));
await db.collection('quizzes').doc('seed-quiz-cells').set(quiz('Cell Biology Quick Check', 'A short 30-minute check on cells.', '', 30, qids.slice(0, 5), 'published'));
await db.collection('quizzes').doc('seed-quiz-draft').set(quiz('Genetics Drill (draft)', 'Not yet published.', '', 45, qids.slice(8), 'draft'));

// ---- one finished attempt for the student, so history/results have content
const attemptQs = (await Promise.all(qids.slice(0, 5).map((id) => db.collection('questions').doc(id).get()))).map((s) => {
  const q = s.data();
  return { sourceQuestionId: s.id, text: q.text, explanation: q.explanation, sourceRef: q.sourceRef, options: q.options.map((text, i) => ({ text, correct: i === q.correctIndex })) };
});
const answers = {};
attemptQs.forEach((q, i) => { if (i < 4) answers[i] = i === 3 ? q.options.findIndex((o) => !o.correct) : q.options.findIndex((o) => o.correct); });
const started = Date.now() - 3 * 3600_000;
const result = { totalQuestions: 5, correct: 3, incorrect: 1, unanswered: 1, score: 3, percentage: 60, timeTakenSeconds: 612 };
await db.collection('attempts').doc('seed-attempt-1').set({
  quizId: 'seed-quiz-cells', userId: studentUid, userName: 'Sam Student', userEmail: 'student@example.com', quizTitle: 'Cell Biology Quick Check',
  durationMinutes: 30, totalQuestions: 5, status: 'submitted', submitReason: 'manual', startedAt: started, expiresAt: started + 30 * 60_000,
  submittedAt: started + 612_000, questions: attemptQs, answers, result,
});
await db.collection('usage').doc(`${studentUid}_seed-quiz-cells`).set({ userId: studentUid, quizId: 'seed-quiz-cells', attemptsUsed: 1, openAttemptId: null, lastAttemptId: 'seed-attempt-1', bestPercentage: 60 });
await db.collection('quizzes').doc('seed-quiz-cells').update({ attemptCount: 1 });
await db.collection('users').doc(studentUid).set({ attemptsStarted: 1, attemptsCompleted: 1, percentageSum: 60, lastActive: started + 612_000 }, { merge: true });
await db.doc('meta/stats').set({ completed: 1, percentageSum: 60 });

console.log(`Seeded.\n  Admin:   ${adminEmail} / ${adminPw}\n  Student: student@example.com / Student-12345  (also maria@example.com)\n  Book "Introduction to Biology", ${qids.length} approved + ${Q.length - qids.length} pending questions, 2 published quizzes + 1 draft.`);
process.exit(0);
