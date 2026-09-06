export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="environment-badge">Entorno local</p>
        <h1>Camila Operaciones</h1>
      </header>
      <main>
        <p className="status-message">Base técnica lista</p>
        <section className="upcoming" aria-labelledby="upcoming-title">
          <h2 id="upcoming-title">Próximas fases</h2>
          <p>
            Catálogo, inventario y pedidos se incorporarán en fases posteriores.
          </p>
        </section>
      </main>
    </div>
  );
}
