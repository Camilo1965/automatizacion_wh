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
} from 'lucide-react';

const primaryItems = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/conversations', label: 'Conversaciones', icon: MessageCircle },
  { to: '/orders', label: 'Pedidos', icon: ClipboardList },
  { to: '/catalog', label: 'Catálogo', icon: Store },
] as const;

export function DesktopSidebar() {
  return (
    <aside className="app-sidebar">
      <Link className="brand" to="/" aria-label="KAIRO, inicio">
        <img src="/brand/kairo-logo.png" alt="" className="sidebar-logo" />
        <span className="brand-copy">
          <strong>KAIRO</strong>
          <small>Centro de operaciones</small>
        </span>
      </Link>
      <nav aria-label="Principal" className="desktop-nav">
        <p className="nav-label">Operación</p>
        {primaryItems.map(({ icon: Icon, ...item }) => (
          <NavLink key={item.to} end={'end' in item && item.end} to={item.to}>
            <Icon aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
        <p className="nav-label">Inventario</p>
        <NavLink to="/catalog-import">
          <FileSpreadsheet aria-hidden="true" />
          Importar desde Treinta
        </NavLink>
        <NavLink to="/inventory/closures">
          <Boxes aria-hidden="true" />
          Cierres diarios
        </NavLink>
        <p className="nav-label">Configuración</p>
        <NavLink to="/settings/audit">
          <ClipboardList aria-hidden="true" />
          Historial de cambios
        </NavLink>
        <NavLink to="/settings/bot-flow">
          <MessageCircle aria-hidden="true" />
          Flujo del bot
        </NavLink>
        <NavLink to="/settings/localities">
          <Truck aria-hidden="true" />
          Departamentos y municipios
        </NavLink>
        <NavLink to="/shipping/incidents">
          <Truck aria-hidden="true" />
          Novedades de entrega
        </NavLink>
        <NavLink to="/settings/shipping">
          <Truck aria-hidden="true" />
          Envíos
        </NavLink>
        <NavLink to="/settings/whatsapp">
          <Webhook aria-hidden="true" />
          WhatsApp
        </NavLink>
        <NavLink to="/settings/integrations">
          <PackageSearch aria-hidden="true" />
          Integraciones
        </NavLink>
        <NavLink to="/alerts">
          <Bell aria-hidden="true" />
          Alertas
        </NavLink>
      </nav>
    </aside>
  );
}
