import { Guard } from '@/components/Shell.jsx';

// The quiz player renders its own full-screen header, so no Shell here.
export default function PlayerLayout({ children }) {
  return <Guard>{children}</Guard>;
}
