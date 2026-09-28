// Creates (or resets) the administrator account.  Usage:  npm run seed:admin
// Reads ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME from the environment or .env.local.
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';

for (const f of ['.env.local', '.env']) if (existsSync(f)) process.loadEnvFile(f);

const { adminAuth, db, nowIso } = await import('../lib/server/firebase.js');

const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
let password = process.env.ADMIN_PASSWORD;
const generated = !password;
if (generated) password = crypto.randomBytes(9).toString('base64url');
const name = process.env.ADMIN_NAME || 'Administrator';

let user;
try {
  user = await adminAuth.getUserByEmail(email);
  await adminAuth.updateUser(user.uid, { password, displayName: name });
} catch (e) {
  if (e.code !== 'auth/user-not-found') throw e;
  user = await adminAuth.createUser({ email, password, displayName: name });
}
await adminAuth.setCustomUserClaims(user.uid, { role: 'admin' });
await db.collection('users').doc(user.uid).set({ name, email, role: 'admin', createdAt: nowIso() }, { merge: true });

console.log(`Admin ready: ${email}${generated ? `\nGenerated password: ${password}` : ''}`);
process.exit(0);
