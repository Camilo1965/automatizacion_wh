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
    <section className="more-page">
      <PageHeader
        eyebrow="Administración"
        title="Más herramientas"
        description="Configuración y tareas operativas agrupadas para celular."
      />
      {groups.map((group) => (
        <section key={group.title} className="more-group">
          <h3 className="more-group-title">{group.title}</h3>
          <div className="more-grid">
            {group.items.map((item) => (
              <Link
                aria-label={item.title}
                className="more-card"
                key={item.to}
                to={item.to}
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
                <span aria-hidden="true" className="more-card-arrow">
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
