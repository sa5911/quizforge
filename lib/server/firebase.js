import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { config } from './config.js';

function credential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    return cert(JSON.parse(text));
  }
  return undefined; // emulators need none; on Google Cloud, Application Default Credentials are used
}

function init() {
  const existing = getApps()[0];
  if (existing) return existing;
  const cred = credential();
  const app = initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-quizforge',
    ...(config.storageBucket ? { storageBucket: config.storageBucket } : {}),
    ...(cred ? { credential: cred } : {}),
  });
  getFirestore(app).settings({ ignoreUndefinedProperties: true });
  return app;
}

const app = init();
export const adminAuth = getAuth(app);
export const db = getFirestore(app);
export { FieldValue };
export const bucket = () => (config.storageBucket ? getStorage(app).bucket() : null);
export const nowIso = () => new Date().toISOString();
