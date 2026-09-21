import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { LoadingState } from '../components/LoadingState';
import { useAuth } from './AuthProvider';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingState label="Comprobando sesión…" />;
  }

  if (user === null) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: `${location.pathname}${location.search}${location.hash}`,
        }}
      />
    );
  }

  return <Outlet />;
}
