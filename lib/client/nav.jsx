'use client';
// Tiny react-router-style API on top of next/navigation, so page components stay router-agnostic.
import NextLink from 'next/link';
import { useCallback, useEffect } from 'react';
import { useParams, usePathname, useRouter, useSearchParams as useNextSearchParams } from 'next/navigation';

export { useParams };

export function Link({ to, ...props }) {
  return <NextLink href={to} {...props} />;
}

export function NavLink({ to, className, children, ...props }) {
  const pathname = usePathname();
  const isActive = pathname === to || pathname.startsWith(`${to}/`);
  return <NextLink href={to} className={typeof className === 'function' ? className({ isActive }) : className} {...props}>{children}</NextLink>;
}

export function useNavigate() {
  const router = useRouter();
  return useCallback((to, opts) => (opts?.replace ? router.replace(to) : router.push(to)), [router]);
}

export function Navigate({ to }) {
  const router = useRouter();
  useEffect(() => { router.replace(to); }, [router, to]);
  return null;
}

/** [params, setParams]: setParams(new URLSearchParams(...)) replaces the query string. */
export function useSearchParams() {
  const sp = useNextSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = useCallback((next) => {
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
  }, [router, pathname]);
  return [sp, set];
}

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export const safeNext = (v) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : null);
