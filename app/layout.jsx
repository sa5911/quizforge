import { Suspense } from 'react';
import Providers from '@/components/Providers.jsx';
import './globals.css';

export const metadata = {
  title: 'QuizForge',
  description: 'AI-generated, timed quizzes built from your course books.',
  icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%234f46e5'/><text x='16' y='23' font-size='20' text-anchor='middle' fill='white' font-family='Arial' font-weight='700'>Q</text></svg>" },
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#4f46e5' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Suspense fallback={null}>{children}</Suspense>
        </Providers>
      </body>
    </html>
  );
}
