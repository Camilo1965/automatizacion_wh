import { useState, type FormEvent } from 'react';

import { apiRequestNoContent, getErrorMessage } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';

export function ShippingSettingsPage() {
  const [localityCarrierCode, setLocalityCarrierCode] = useState('');
  const [carrier, setCarrier] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      await apiRequestNoContent('/shipping/carrier-rules', {
        method: 'PUT',
        body: {
          localityCarrierCode: localityCarrierCode.trim(),
          carrier: carrier.trim().toLowerCase(),
        },
      });
      setSaved(true);
    } catch (caught) {
      setError(getErrorMessage(caught, 'No se pudo guardar la regla'));
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="settings-title">
      <p className="eyebrow">Configuración</p>
      <h2 id="settings-title">Preferencias de envío</h2>
      <p className="muted">Define una transportadora preferida para un municipio. Si no hay cobertura, el sistema seguirá con la mejor alternativa disponible.</p>
      <form className="stack-form panel-block" onSubmit={(event) => void onSubmit(event)}>
        <label htmlFor="locality-code">Código DANE</label>
        <input id="locality-code" inputMode="numeric" maxLength={8} pattern="[0-9]{8}" value={localityCarrierCode} onChange={(event) => setLocalityCarrierCode(event.target.value)} required />
        <label htmlFor="carrier">Transportadora preferida</label>
        <input id="carrier" value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="Ejemplo: tcc" required />
        {error === null ? null : <ErrorMessage message={error} />}
        {saved ? <p role="status">Regla guardada</p> : null}
        <button className="button-primary" disabled={pending} type="submit">Guardar regla</button>
      </form>
    </section>
  );
}
