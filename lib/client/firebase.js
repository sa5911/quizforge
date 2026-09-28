import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, inMemoryPersistence, initializeAuth } from 'firebase/auth';

// The browser only uses Firebase Auth to verify a password and obtain an ID token.
// That token is exchanged for an httpOnly session cookie, so nothing is persisted client-side.
let auth;
export function getClientAuth() {
  if (auth) return auth;
  const app = getApps().length ? getApp() : initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'demo-key',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-quizforge',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
  try {
    auth = initializeAuth(app, { persistence: inMemoryPersistence });
    if (process.env.NEXT_PUBLIC_USE_EMULATORS === 'true') connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch {
    auth = getAuth(app); // already initialised (fast refresh)
  }
  return auth;
}

export function friendlyAuthError(e) {
  const code = e?.code || '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code)) return 'Invalid email or password';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait a moment and try again.';
  if (code === 'auth/network-request-failed') return 'Cannot reach the server. Check your connection.';
  return e?.message || 'Sign-in failed';
}
