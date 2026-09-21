import { Link } from 'react-router-dom';

import { PageHeader } from '../components/PageHeader';

const groups = [
  {
    title: 'Inventario',
    items: [
      {
        to: '/catalog-import',
        title: 'Importar desde Treinta',
        description: 'Carga inicial o conciliación de existencias.',
      },
      {
        to: '/inventory/closures',
        title: 'Cierres diarios',
        description: 'Descarga, reconoce y reabre cierres de Treinta.',
      },
    ],
  },
  {
    title: 'Envíos',
    items: [
      {
        to: '/settings/shipping',
        title: 'Políticas de envío',
        description: 'Transportadora y seguro los define la propietaria.',
      },
      {
        to: '/shipping/incidents',
        title: 'Novedades de entrega',
        description: 'Incidencias reportadas por 99envíos.',
      },
      {
        to: '/settings/localities',
        title: 'Departamentos y municipios',
        description: 'Catálogo publicado de destinos.',
      },
    ],
  },
  {
    title: 'Canal y automatización',
    items: [
      {
        to: '/settings/whatsapp',
        title: 'WhatsApp Business',
        description: 'Número comercial y capacidades verificadas.',
      },
      {
        to: '/settings/bot-flow',
        title: 'Mensajes del bot',
        description: 'Borrador, simulación y publicación.',
      },
      {
        to: '/alerts',
        title: 'Alertas',
        description: 'Prioridad, lectura y resolución.',
      },
    ],
  },
  {
    title: 'Sistema',
    items: [
      {
        to: '/settings/integrations',
        title: 'Integraciones',
        description: 'Configurado · Verificado · Activo · Incidencia.',
      },
      {
        to: '/settings/audit',
        title: 'Historial de cambios',
        description: 'Publicaciones y acciones sin secretos.',
      },
    ],
  },
] as const;

export function MorePage() {
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Administración"
        title="Más herramientas"
        description="Configuración y tareas operativas agrupadas para celular."
      />
      {groups.map((group) => (
        <section key={group.title} className="space-y-3">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {group.title}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.items.map((item) => (
              <Link
                aria-label={item.title}
                className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-card px-4 py-4 shadow-[var(--shadow-card)] transition-colors hover:bg-muted"
                key={item.to}
                to={item.to}
              >
                <span className="min-w-0 space-y-1">
                  <strong className="block text-sm font-semibold text-foreground">
                    {item.title}
                  </strong>
                  <small className="block text-xs text-muted-foreground">
                    {item.description}
                  </small>
                </span>
                <span aria-hidden="true" className="text-muted-foreground">
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
