import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export function OperationalChart({
  values,
}: {
  values: {
    newConversations: number;
    confirmedOrders: number;
    dispatchedOrders: number;
    guidesCreated: number;
  };
}) {
  const data = [
    { name: 'Conversaciones', value: values.newConversations },
    { name: 'Confirmados', value: values.confirmedOrders },
    { name: 'Despachados', value: values.dispatchedOrders },
    { name: 'Guías', value: values.guidesCreated },
  ];
  return (
    <section
      className="dashboard-chart card"
      aria-labelledby="operations-chart-title"
    >
      <div>
        <p className="eyebrow">Flujo operativo</p>
        <h3 id="operations-chart-title">Actividad del periodo</h3>
      </div>
      <p className="sr-only">
        Gráfica: {values.newConversations} conversaciones nuevas,{' '}
        {values.confirmedOrders} pedidos confirmados, {values.dispatchedOrders}{' '}
        pedidos despachados y {values.guidesCreated} guías creadas.
      </p>
      <div className="chart-frame" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" fill="#b96f09" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
