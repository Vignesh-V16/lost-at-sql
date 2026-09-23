import { Outlet } from 'react-router-dom';

export default function PublicLayout() {
  return (
    <div className="relative min-h-dvh">
      <Outlet />
    </div>
  );
}
