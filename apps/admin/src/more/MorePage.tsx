import { Link } from 'react-router-dom';

import { PageHeader } from '../components/PageHeader';

const sections = [
  {
    to: '/settings/audit',
    title: 'Historial de cambios',
    description: 'Consulta publicaciones, conexiones y acciones registradas.',
  },
  {
    to: '/shipping/incidents',
    title: 'Novedades de entrega',
    description: 'Consulta y responde las incidencias de 99envíos.',
  },
  {
    to: '/settings/localities',
    title: 'Departamentos y municipios',
    description: 'Revisa y publica el listado de destinos de 99envíos.',
  },
  {
    to: '/settings/bot-flow',
    title: 'Flujo del bot',
    description: 'Edita, prueba y publica los mensajes de WhatsApp.',
  },
  {
    to: '/catalog-import',
    title: 'Importar desde Treinta',
    description:
      'Carga y valida referencias y existencias antes de aplicarlas.',
  },
  {
    to: '/inventory/closures',
    title: 'Cierres de Treinta',
    description: 'Genera, descarga y confirma el archivo diario de inventario.',
  },
  {
    to: '/alerts',
    title: 'Alertas',
    description: 'Revisa incidencias de guías, mensajes y tareas pendientes.',
  },
  {
    to: '/settings/shipping',
    title: 'Preferencias de envío',
    description: 'Configura transportadoras, seguros y reglas por municipio.',
  },
  {
    to: '/settings/whatsapp',
    title: 'WhatsApp Business',
    description: 'Consulta la capacidad y configuración del canal de ventas.',
  },
  {
    to: '/settings/integrations',
    title: 'Integraciones',
    description: 'Comprueba WhatsApp, 99envíos, archivos y tareas automáticas.',
  },
] as const;

export function MorePage() {
  return (
    <section>
      <PageHeader
        eyebrow="Administración"
        title="Más herramientas"
        description="Accede a la configuración y a las tareas operativas desde el celular."
      />
      <div className="more-grid">
        {sections.map((item) => (
          <Link
            aria-label={item.title}
            className="card more-card"
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
  );
}
