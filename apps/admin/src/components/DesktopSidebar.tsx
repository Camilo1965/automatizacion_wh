import { Link, NavLink } from 'react-router-dom';
import {
  Bell,
  Boxes,
  ClipboardList,
  FileSpreadsheet,
  House,
  MessageCircle,
  PackageSearch,
  Truck,
  Store,
  Webhook,
  History,
} from 'lucide-react';

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

const configItems = [
  { to: '/settings/whatsapp', label: 'WhatsApp', icon: Webhook },
  { to: '/settings/bot-flow', label: 'Mensajes / bot', icon: MessageCircle },
  { to: '/settings/integrations', label: 'Integraciones', icon: PackageSearch },
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
    <NavLink {...(end === true ? { end: true } : {})} to={to}>
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}

export function DesktopSidebar() {
  return (
    <aside className="app-sidebar">
      <Link className="brand" to="/" aria-label="KAIRO, inicio">
        <img src="/brand/kairo-logo.png" alt="" className="sidebar-logo" />
        <span className="brand-copy">
          <strong>KAIRO</strong>
          <small>Boutique operativa</small>
        </span>
      </Link>
      <nav aria-label="Principal" className="desktop-nav">
        <p className="nav-label">Operación</p>
        {primaryItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <p className="nav-label">Inventario</p>
        {inventoryItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <p className="nav-label">Envíos</p>
        {shippingItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <p className="nav-label">Configuración</p>
        {configItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>
    </aside>
  );
}
