import { Guard, Shell } from '@/components/Shell.jsx';

export default function AdminLayout({ children }) {
  return <Guard role="admin"><Shell admin>{children}</Shell></Guard>;
}
