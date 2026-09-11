import { NavLink } from 'react-router-dom';
import { House, MessageCircle, ClipboardList, Store, Menu } from 'lucide-react';

const items = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/conversations', label: 'Chats', icon: MessageCircle },
  { to: '/orders', label: 'Pedidos', icon: ClipboardList },
  { to: '/catalog', label: 'Catálogo', icon: Store },
  { to: '/more', label: 'Más', icon: Menu },
] as const;

export function MobileNavigation() {
  return (
    <nav aria-label="Accesos móviles" className="mobile-nav">
      {items.map(({ icon: Icon, ...item }) => (
        <NavLink key={item.to} end={'end' in item && item.end} to={item.to}>
          <Icon aria-hidden="true" className="mobile-nav-icon" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
