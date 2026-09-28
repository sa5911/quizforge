'use client';
import { AuthProvider } from '@/lib/client/auth.jsx';
import { ToastProvider } from '@/components/ui.jsx';

export default function Providers({ children }) {
  return (
    <ToastProvider>
      <AuthProvider>{children}</AuthProvider>
    </ToastProvider>
  );
}
