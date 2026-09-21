import { useQuery } from '@tanstack/react-query';
import { Bell, LogOut, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getWhatsAppConnection } from '../api/whatsapp-api';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { GlobalSearch } from './GlobalSearch';

export function GlobalHeader({
  username,
  onLogout,
}: {
  username: string;
  onLogout: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const connection = useQuery({
    queryKey: ['whatsapp-connection'],
    queryFn: getWhatsAppConnection,
    staleTime: 60_000,
    retry: false,
  });
  const whatsappReady =
    connection.isSuccess &&
    connection.data.phoneNumberId !== null &&
    connection.data.webhookConfigured;

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex items-center gap-3 md:hidden">
          <img
            src="/brand/kairo-logo.png"
            alt=""
            className="size-8 rounded-[0.75rem] object-contain"
          />
          <div>
            <p className="text-sm font-semibold tracking-tight">Camila</p>
            <p className="text-[11px] text-muted-foreground">Entorno local</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-[1.125rem] border border-border bg-muted px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            type="button"
            aria-label="Abrir búsqueda global"
            onClick={() => setSearchOpen(true)}
          >
            <Search aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Buscar</span>
            <kbd className="hidden rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
              Ctrl K
            </kbd>
          </button>
          <Link
            to="/settings/whatsapp"
            className="hidden sm:inline-flex"
            aria-label="Abrir configuración de WhatsApp"
          >
            <StatusBadge tone={whatsappReady ? 'success' : 'warning'}>
              {whatsappReady ? 'WhatsApp listo' : 'WhatsApp por validar'}
            </StatusBadge>
          </Link>
          <Link
            className="inline-flex size-9 items-center justify-center rounded-[1.125rem] border border-border bg-muted text-foreground transition-colors hover:bg-secondary"
            to="/alerts"
            aria-label="Ver alertas"
          >
            <Bell aria-hidden="true" className="size-4" />
          </Link>
          <span className="hidden text-sm text-muted-foreground lg:inline">
            {username}
          </span>
          <Button variant="ghost" aria-label="Cerrar sesión" onClick={onLogout}>
            <LogOut aria-hidden="true" className="size-4" />
            <span className="hidden md:inline">Salir</span>
          </Button>
        </div>
      </header>
      {searchOpen ? (
        <GlobalSearch onClose={() => setSearchOpen(false)} />
      ) : null}
    </>
  );
}
