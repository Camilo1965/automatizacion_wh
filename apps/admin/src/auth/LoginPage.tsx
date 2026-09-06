import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { ApiClientError } from '../api/client';
import { AppShell } from '../components/AppShell';
import { ErrorMessage } from '../components/ErrorMessage';
import { useAuth } from './AuthProvider';

const INVALID_CREDENTIALS_MESSAGE = 'Credenciales inválidas';

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user !== null) {
    const from =
      typeof location.state === 'object' &&
      location.state !== null &&
      'from' in location.state &&
      typeof (location.state as { from: unknown }).from === 'string'
        ? (location.state as { from: string }).from
        : '/';
    return <Navigate to={from} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username, password);
      const from =
        typeof location.state === 'object' &&
        location.state !== null &&
        'from' in location.state &&
        typeof (location.state as { from: unknown }).from === 'string'
          ? (location.state as { from: string }).from
          : '/';
      void navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'invalid_credentials') {
        setError(INVALID_CREDENTIALS_MESSAGE);
      } else {
        setError(INVALID_CREDENTIALS_MESSAGE);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <section aria-labelledby="login-title">
        <h2 id="login-title">Iniciar sesión</h2>
        <p className="muted">
          Acceso al panel operativo de catálogo e inventario.
        </p>
        <form className="stack-form" onSubmit={onSubmit} noValidate>
          <label htmlFor="username">Usuario</label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />

          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <ErrorMessage message={error} />

          <button
            type="submit"
            className="button-primary"
            disabled={submitting}
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </section>
    </AppShell>
  );
}
