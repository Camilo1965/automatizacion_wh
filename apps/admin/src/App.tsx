import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { useAuth } from './auth/AuthProvider';
import { LoginPage } from './auth/LoginPage';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppShell } from './components/AppShell';
import { LoadingState } from './components/LoadingState';

const AlertsPage = lazy(() =>
  import('./alerts/AlertsPage').then(({ AlertsPage }) => ({
    default: AlertsPage,
  })),
);
const CatalogImportPage = lazy(() =>
  import('./catalog/CatalogImportPage').then(({ CatalogImportPage }) => ({
    default: CatalogImportPage,
  })),
);
const CatalogListPage = lazy(() =>
  import('./catalog/CatalogListPage').then(({ CatalogListPage }) => ({
    default: CatalogListPage,
  })),
);
const ReferenceCreatePage = lazy(() =>
  import('./catalog/ReferenceCreatePage').then(({ ReferenceCreatePage }) => ({
    default: ReferenceCreatePage,
  })),
);
const ReferenceDetailPage = lazy(() =>
  import('./catalog/ReferenceDetailPage').then(({ ReferenceDetailPage }) => ({
    default: ReferenceDetailPage,
  })),
);
const ConversationInboxPage = lazy(() =>
  import('./conversations/ConversationInboxPage').then(
    ({ ConversationInboxPage }) => ({
      default: ConversationInboxPage,
    }),
  ),
);
const DashboardPage = lazy(() =>
  import('./dashboard/DashboardPage').then(({ DashboardPage }) => ({
    default: DashboardPage,
  })),
);
const InventoryClosuresPage = lazy(() =>
  import('./inventory/InventoryClosuresPage').then(
    ({ InventoryClosuresPage }) => ({
      default: InventoryClosuresPage,
    }),
  ),
);
const MorePage = lazy(() =>
  import('./more/MorePage').then(({ MorePage }) => ({ default: MorePage })),
);
const OrderCreatePage = lazy(() =>
  import('./orders/OrderCreatePage').then(({ OrderCreatePage }) => ({
    default: OrderCreatePage,
  })),
);
const OrderDetailPage = lazy(() =>
  import('./orders/OrderDetailPage').then(({ OrderDetailPage }) => ({
    default: OrderDetailPage,
  })),
);
const OrdersListPage = lazy(() =>
  import('./orders/OrdersListPage').then(({ OrdersListPage }) => ({
    default: OrdersListPage,
  })),
);
const BotFlowPage = lazy(() =>
  import('./settings/BotFlowPage').then(({ BotFlowPage }) => ({
    default: BotFlowPage,
  })),
);
const ConfigurationAuditPage = lazy(() =>
  import('./settings/ConfigurationAuditPage').then(
    ({ ConfigurationAuditPage }) => ({
      default: ConfigurationAuditPage,
    }),
  ),
);
const IntegrationsPage = lazy(() =>
  import('./settings/IntegrationsPage').then(({ IntegrationsPage }) => ({
    default: IntegrationsPage,
  })),
);
const LocalityCatalogPage = lazy(() =>
  import('./settings/LocalityCatalogPage').then(({ LocalityCatalogPage }) => ({
    default: LocalityCatalogPage,
  })),
);
const ShippingIncidentsPage = lazy(() =>
  import('./settings/ShippingIncidentsPage').then(
    ({ ShippingIncidentsPage }) => ({
      default: ShippingIncidentsPage,
    }),
  ),
);
const ShippingSettingsPage = lazy(() =>
  import('./settings/ShippingSettingsPage').then(
    ({ ShippingSettingsPage }) => ({
      default: ShippingSettingsPage,
    }),
  ),
);
const WhatsAppSettingsPage = lazy(() =>
  import('./settings/WhatsAppSettingsPage').then(
    ({ WhatsAppSettingsPage }) => ({
      default: WhatsAppSettingsPage,
    }),
  ),
);
const SecuritySettingsPage = lazy(() =>
  import('./settings/SecuritySettingsPage').then(
    ({ SecuritySettingsPage }) => ({
      default: SecuritySettingsPage,
    }),
  ),
);
const PrivacySettingsPage = lazy(() =>
  import('./settings/PrivacySettingsPage').then(({ PrivacySettingsPage }) => ({
    default: PrivacySettingsPage,
  })),
);

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
      <Suspense fallback={<LoadingState label="Cargando sección…" />}>
        <Outlet />
      </Suspense>
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
          <Route index element={<DashboardPage />} />
          <Route path="catalog" element={<CatalogListPage />} />
          <Route path="orders" element={<OrdersListPage />} />
          <Route path="orders/new" element={<OrderCreatePage />} />
          <Route path="orders/:orderId" element={<OrderDetailPage />} />
          <Route path="conversations" element={<ConversationInboxPage />} />
          <Route path="catalog-import" element={<CatalogImportPage />} />
          <Route path="settings/shipping" element={<ShippingSettingsPage />} />
          <Route path="settings/whatsapp" element={<WhatsAppSettingsPage />} />
          <Route path="settings/bot-flow" element={<BotFlowPage />} />
          <Route path="settings/audit" element={<ConfigurationAuditPage />} />
          <Route path="settings/localities" element={<LocalityCatalogPage />} />
          <Route
            path="shipping/incidents"
            element={<ShippingIncidentsPage />}
          />
          <Route path="settings/integrations" element={<IntegrationsPage />} />
          <Route path="settings/security" element={<SecuritySettingsPage />} />
          <Route path="settings/privacy" element={<PrivacySettingsPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="more" element={<MorePage />} />
          <Route
            path="inventory/closures"
            element={<InventoryClosuresPage />}
          />
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
