import { Link } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { PageHeader, PageSection } from '../components/PageHeader';

const ownerGuides = [
  {
    title: 'Publicar municipios',
    steps:
      'Abre Departamentos y municipios, carga el listado de 99envíos o un CSV, revisa los errores en la vista previa y publica. Hasta publicar, el bot no puede ofrecer destinos nuevos.',
    to: '/settings/localities',
    action: 'Abrir municipios',
  },
  {
    title: 'Permitir solo una transportadora en un municipio',
    steps:
      'En Envíos elige el municipio. La regla copia la política general al comenzar y luego la reemplaza por completo. Marca “Limitar a una lista”, deja solo la transportadora deseada, selecciónala como preferida y usa “Detener y pedir atención” si no aparece. Guarda y prueba en el simulador antes de vender.',
    to: '/settings/shipping',
    action: 'Abrir políticas de envío',
  },
  {
    title: 'Cotizar sin crear guía',
    steps:
      'Usa el simulador de Envíos para consultar cobertura y precio. La simulación es de solo lectura: no reserva inventario, no crea pedidos ni guías. Para una guía real debe existir un pedido confirmado.',
    to: '/settings/shipping',
    action: 'Abrir simulador',
  },
  {
    title: 'Cambiar y publicar el bot',
    steps:
      'Edita mensajes y opciones en Editor, guarda el borrador, prueba en Simular y publica. Simular no guarda cambios. Las conversaciones abiertas conservan su versión; las nuevas usan la publicación.',
    to: '/settings/bot-flow',
    action: 'Abrir flujo del bot',
  },
] as const;

const operationGuides = [
  {
    title: 'Del pedido a la guía',
    steps:
      'Completa cliente y destino, cotiza, revisa transportadora y total, genera un resumen y confirma. Solo entonces se reserva inventario y se encola una guía. Despacha únicamente cuando la guía figure como creada.',
    to: '/orders',
    action: 'Abrir pedidos',
  },
  {
    title: 'Guía o PDF incierto',
    steps:
      'Si 99envíos responde con error o estado incierto, revisa el pedido en el panel y verifica el número en “Envíos completos” del proveedor. No vuelvas a crear el preenvío a ciegas. Un fallo al descargar el PDF no significa que la guía no exista.',
    to: '/orders',
    action: 'Revisar pedidos',
  },
  {
    title: 'Tomar una conversación',
    steps:
      'Abre Conversaciones, toma control antes de responder y revisa el pedido asociado. El bot queda pausado mientras atiendes. Reanúdalo solo cuando el siguiente paso mostrado sea correcto para el cliente.',
    to: '/conversations',
    action: 'Abrir conversaciones',
  },
] as const;

function GuideList({
  guides,
}: {
  guides: readonly {
    title: string;
    steps: string;
    to: string;
    action: string;
  }[];
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {guides.map((guide) => (
        <PageSection key={guide.title} className="space-y-3">
          <h3 className="text-base font-semibold text-foreground">
            {guide.title}
          </h3>
          <p className="text-sm leading-6 text-muted-foreground">
            {guide.steps}
          </p>
          <Link
            className="control-target inline-flex rounded-[1.125rem] border border-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground"
            to={guide.to}
          >
            {guide.action}
          </Link>
        </PageSection>
      ))}
    </div>
  );
}

export function OwnerHelpPage() {
  const { user } = useAuth();
  return (
    <section className="space-y-7">
      <PageHeader
        eyebrow="Guías"
        title="Ayuda operativa"
        description="Pasos cortos para configurar KAIRO y resolver los casos que bloquean una venta."
      />
      {user?.role === 'owner' ? (
        <section
          className="space-y-3"
          aria-label="Configuración de la propietaria"
        >
          <h2 className="text-lg font-semibold text-foreground">
            Configuración de la propietaria
          </h2>
          <GuideList guides={ownerGuides} />
        </section>
      ) : null}
      <section className="space-y-3" aria-label="Operación diaria">
        <h2 className="text-lg font-semibold text-foreground">
          Operación diaria
        </h2>
        <GuideList guides={operationGuides} />
      </section>
    </section>
  );
}
