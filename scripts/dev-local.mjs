// Runs `next dev` against the local Firebase emulators (npm run emulators must be running).
import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  NEXT_PUBLIC_USE_EMULATORS: 'true',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIREBASE_SERVICE_ACCOUNT: '', // emulators need no credentials
};
spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', '3000'], { stdio: 'inherit', env });
