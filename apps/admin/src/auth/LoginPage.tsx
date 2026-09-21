import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  UserRound,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

import { ApiClientError } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
import { AuthShell } from './AuthShell';
import { useAuth } from './AuthProvider';

const INVALID_CREDENTIALS_MESSAGE = 'Credenciales inválidas';
const RATE_LIMIT_MESSAGE =
  'Demasiados intentos. Espera unos minutos antes de volver a probar.';
const TEMPORARY_ERROR_MESSAGE =
  'No se pudo conectar con KAIRO. Revisa la conexión e intenta de nuevo.';

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const reduceMotion = useReducedMotion();

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
      } else if (err instanceof ApiClientError && err.status === 429) {
        setError(RATE_LIMIT_MESSAGE);
      } else if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError(TEMPORARY_ERROR_MESSAGE);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="login-layout">
        <motion.section
          className="login-brand-panel"
          aria-labelledby="login-title"
          initial={reduceMotion ? false : { opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
        >
          <div className="login-brand-content">
            <img
              src="/brand/kairo-logo.png"
              alt="KAIRO"
              className="login-logo"
            />
            <p className="eyebrow">Boutique · Operación en tiempo real</p>
            <h1 id="login-title">Tu negocio, organizado en un solo lugar</h1>
            <p>
              Gestiona conversaciones, pedidos, catálogo, envíos e inventario
              desde una sola operación.
            </p>
          </div>
        </motion.section>
        <div className="login-form-panel">
          <motion.section
            className="login-card"
            aria-labelledby="access-title"
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: reduceMotion ? 0 : 0.08 }}
          >
            <div className="login-card-heading">
              <p className="eyebrow">Acceso privado</p>
              <h2 id="access-title">Bienvenida a KAIRO</h2>
              <p className="muted">
                Ingresa para continuar con la operación de hoy.
              </p>
            </div>
            <form
              className="stack-form login-form"
              onSubmit={onSubmit}
              noValidate
            >
              <label htmlFor="username">Usuario</label>
              <div className="input-with-icon">
                <UserRound aria-hidden="true" size={19} />
                <input
                  id="username"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </div>

              <label htmlFor="password">Contraseña</label>
              <div className="input-with-icon password-field">
                <LockKeyhole aria-hidden="true" size={19} />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyUp={(event) =>
                    setCapsLock(event.getModifierState('CapsLock'))
                  }
                  onKeyDown={(event) =>
                    setCapsLock(event.getModifierState('CapsLock'))
                  }
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={
                    showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                  }
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </button>
              </div>
              {capsLock ? (
                <p className="field-hint field-hint--warning">
                  Bloq Mayús está activado
                </p>
              ) : null}

              <ErrorMessage message={error} />

              <button
                type="submit"
                className="button-primary login-submit"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <LoaderCircle
                      className="login-spinner"
                      aria-hidden="true"
                    />
                    Entrando…
                  </>
                ) : (
                  'Entrar al panel'
                )}
              </button>
            </form>
            <p className="login-security">
              <LockKeyhole aria-hidden="true" size={15} /> Sesión protegida y
              acceso exclusivo.
            </p>
          </motion.section>
        </div>
      </div>
    </AuthShell>
  );
}
