import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container">
      <div className="empty"><h3>Page not found</h3><Link href="/">Go home</Link></div>
    </main>
  );
}
