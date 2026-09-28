'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { signInWithEmailAndPassword, signOut, updatePassword } from 'firebase/auth';
import { api } from './api.js';
import { friendlyAuthError, getClientAuth } from './firebase.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

/** Signs in with Firebase Auth, then trades the ID token for the server's httpOnly session cookie. */
async function establishSession(email, password, admin) {
  const auth = getClientAuth();
  let idToken;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    idToken = await cred.user.getIdToken();
  } catch (e) {
    throw new Error(friendlyAuthError(e));
  }
  try {
    return (await api.post('/auth/session', { idToken, admin })).user;
  } finally {
    signOut(auth).catch(() => {}); // the cookie is now the only credential
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null)).finally(() => setLoading(false));
    const onExpired = () => setUser(null);
    window.addEventListener('session-expired', onExpired);
    return () => window.removeEventListener('session-expired', onExpired);
  }, []);

  const login = useCallback(async (email, password, admin = false) => {
    const u = await establishSession(email, password, admin);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (name, email, password) => {
    await api.post('/auth/register', { name, email, password });
    return login(email, password);
  }, [login]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  }, []);

  /** Verifies the current password with Firebase, then sets the new one. */
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const auth = getClientAuth();
    try {
      const cred = await signInWithEmailAndPassword(auth, user.email, currentPassword);
      await updatePassword(cred.user, newPassword);
    } catch (e) {
      if (e?.code === 'auth/invalid-credential' || e?.code === 'auth/wrong-password') throw new Error('Current password is incorrect');
      if (e?.code === 'auth/weak-password') throw new Error('New password is too weak (min. 8 characters)');
      throw new Error(friendlyAuthError(e));
    } finally {
      signOut(auth).catch(() => {});
    }
  }, [user]);

  return <Ctx.Provider value={{ user, setUser, loading, login, register, logout, changePassword }}>{children}</Ctx.Provider>;
}
