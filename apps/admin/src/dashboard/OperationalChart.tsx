import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const AXIS = '#737373';
const BAR = '#0a0a0a';
const GRID = '#e5e5e5';

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
      className="space-y-3 rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
      aria-labelledby="operations-chart-title"
    >
      <div>
        <p className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
          Flujo operativo
        </p>
        <h3
          id="operations-chart-title"
          className="text-lg font-semibold tracking-tight text-foreground"
        >
          Actividad del periodo
        </h3>
      </div>
      <p className="sr-only">
        Gráfica: {values.newConversations} conversaciones nuevas,{' '}
        {values.confirmedOrders} pedidos confirmados, {values.dispatchedOrders}{' '}
        pedidos despachados y {values.guidesCreated} guías creadas.
      </p>
      <div className="h-64 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid
              stroke={GRID}
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              tick={{ fill: AXIS, fontSize: 12 }}
              axisLine={{ stroke: GRID }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: AXIS, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '1.125rem',
                border: '1px solid #e5e5e5',
                background: '#ffffff',
                color: '#0a0a0a',
              }}
            />
            <Bar dataKey="value" fill={BAR} radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
