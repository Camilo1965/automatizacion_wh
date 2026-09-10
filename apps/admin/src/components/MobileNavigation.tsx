import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Inicio', glyph: '⌂', end: true },
  { to: '/conversations', label: 'Chats', glyph: '◌' },
  { to: '/orders', label: 'Pedidos', glyph: '▣' },
  { to: '/catalog', label: 'Catálogo', glyph: '◇' },
  { to: '/settings/shipping', label: 'Más', glyph: '•••' },
] as const;

export function MobileNavigation() {
  return (
    <nav aria-label="Accesos móviles" className="mobile-nav">
      {items.map((item) => (
        <NavLink key={item.to} end={'end' in item && item.end} to={item.to}>
          <span aria-hidden="true" className="mobile-nav-icon">
            {item.glyph}
          </span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
