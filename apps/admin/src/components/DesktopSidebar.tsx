import { Link, NavLink } from 'react-router-dom';
import {
  Bell,
  Boxes,
  ClipboardList,
  FileSpreadsheet,
  House,
  MessageCircle,
  PackageSearch,
  Shield,
  Truck,
  Store,
  Webhook,
  History,
  Lock,
} from 'lucide-react';

import { useAuth } from '@/auth/AuthProvider';
import { cn } from '@/lib/utils';

const primaryItems = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/conversations', label: 'Conversaciones', icon: MessageCircle },
  { to: '/orders', label: 'Pedidos', icon: ClipboardList },
  { to: '/catalog', label: 'Catálogo', icon: Store },
  { to: '/alerts', label: 'Alertas', icon: Bell },
] as const;

const inventoryItems = [
  { to: '/catalog-import', label: 'Importación', icon: FileSpreadsheet },
  { to: '/inventory/closures', label: 'Cierres diarios', icon: Boxes },
] as const;

const shippingItems = [
  { to: '/settings/shipping', label: 'Envíos', icon: Truck },
  { to: '/shipping/incidents', label: 'Novedades', icon: Truck },
  {
    to: '/settings/localities',
    label: 'Departamentos y municipios',
    icon: Truck,
  },
] as const;

const sharedConfigItems = [
  { to: '/settings/whatsapp', label: 'WhatsApp', icon: Webhook },
  { to: '/settings/security', label: 'Seguridad y acceso', icon: Shield },
] as const;

const ownerOnlyConfigItems = [
  { to: '/settings/bot-flow', label: 'Mensajes / bot', icon: MessageCircle },
  { to: '/settings/integrations', label: 'Integraciones', icon: PackageSearch },
  { to: '/settings/privacy', label: 'Privacidad', icon: Lock },
  { to: '/settings/audit', label: 'Historial', icon: History },
] as const;

function NavItem({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: typeof House;
  end?: boolean;
}) {
  return (
    <NavLink
      {...(end === true ? { end: true } : {})}
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-[1.125rem] px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          isActive &&
            'bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground',
        )
      }
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

function NavGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="px-3 pt-3 pb-1 text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

export function DesktopSidebar() {
  const { user } = useAuth();
  const configItems =
    user?.role === 'owner'
      ? [...sharedConfigItems, ...ownerOnlyConfigItems]
      : [...sharedConfigItems];

  return (
    <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 md:flex">
      <Link
        className="mb-6 flex items-center gap-3 rounded-[1.125rem] px-2 py-1.5"
        to="/"
        aria-label="KAIRO Operaciones, inicio"
      >
        <img
          src="/brand/kairo-logo.png"
          alt=""
          className="size-9 rounded-[0.75rem] object-contain"
        />
        <span className="flex min-w-0 flex-col">
          <h1 className="text-sm font-semibold tracking-tight text-sidebar-foreground">
            KAIRO
          </h1>
          <small className="text-xs text-muted-foreground">Operaciones</small>
        </span>
      </Link>
      <nav
        aria-label="Principal"
        className="flex flex-1 flex-col gap-2 overflow-y-auto pb-4"
      >
        <NavGroup label="Operación">
          {primaryItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </NavGroup>
        <NavGroup label="Inventario">
          {inventoryItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </NavGroup>
        <NavGroup label="Envíos">
          {shippingItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </NavGroup>
        <NavGroup label="Configuración">
          {configItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </NavGroup>
      </nav>
    </aside>
  );
}
