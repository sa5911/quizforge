import { Guard } from '@/components/Shell.jsx';

export default function UserLayout({ children }) {
  return <Guard>{children}</Guard>;
}
