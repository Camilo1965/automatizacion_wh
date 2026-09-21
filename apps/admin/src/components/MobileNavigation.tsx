import { NavLink } from 'react-router-dom';
import { House, MessageCircle, ClipboardList, Store, Menu } from 'lucide-react';

import { cn } from '@/lib/utils';

const items = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/conversations', label: 'Chats', icon: MessageCircle },
  { to: '/orders', label: 'Pedidos', icon: ClipboardList },
  { to: '/catalog', label: 'Catálogo', icon: Store },
  { to: '/more', label: 'Más', icon: Menu },
] as const;

export function MobileNavigation() {
  return (
    <nav
      aria-label="Accesos móviles"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {items.map(({ icon: Icon, ...item }) => (
        <NavLink
          key={item.to}
          end={'end' in item && item.end}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium text-muted-foreground',
              isActive && 'text-foreground',
            )
          }
        >
          <Icon aria-hidden="true" className="size-5" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
