import { Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { useAuth } from './auth/AuthProvider';
import { LoginPage } from './auth/LoginPage';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { CatalogListPage } from './catalog/CatalogListPage';
import { ReferenceCreatePage } from './catalog/ReferenceCreatePage';
import { ReferenceDetailPage } from './catalog/ReferenceDetailPage';
import { CatalogImportPage } from './catalog/CatalogImportPage';
import { AppShell } from './components/AppShell';
import { LoadingState } from './components/LoadingState';
import { OrdersListPage } from './orders/OrdersListPage';
import { OrderCreatePage } from './orders/OrderCreatePage';
import { OrderDetailPage } from './orders/OrderDetailPage';

function AuthenticatedShell() {
  const { user, logout } = useAuth();

  return (
    <AppShell
      {...(user === null
        ? {}
        : {
            username: user.username,
            onLogout: () => {
              void logout();
            },
          })}
    >
      <Outlet />
    </AppShell>
  );
}

export function App() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <AppShell>
        <LoadingState label="Comprobando sesión…" />
      </AppShell>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AuthenticatedShell />}>
          <Route index element={<CatalogListPage />} />
          <Route path="orders" element={<OrdersListPage />} />
          <Route path="orders/new" element={<OrderCreatePage />} />
          <Route path="orders/:orderId" element={<OrderDetailPage />} />
          <Route path="catalog-import" element={<CatalogImportPage />} />
          <Route path="references/new" element={<ReferenceCreatePage />} />
          <Route
            path="references/:referenceId"
            element={<ReferenceDetailPage />}
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
