import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

import { ApiClientError } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
import { Button } from '../components/Button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AuthShell } from './AuthShell';
import { useAuth } from './AuthProvider';
import './login.css';

const INVALID_CREDENTIALS_MESSAGE = 'Credenciales inválidas';
const RATE_LIMIT_MESSAGE =
  'Demasiados intentos. Espera unos minutos antes de volver a probar.';
const TEMPORARY_ERROR_MESSAGE =
  'No se pudo conectar. Revisa la conexión e intenta de nuevo.';

export function LoginPage() {
  const { user, loading, login, completeMfaLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
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

  function redirectAfterLogin() {
    const from =
      typeof location.state === 'object' &&
      location.state !== null &&
      'from' in location.state &&
      typeof (location.state as { from: unknown }).from === 'string'
        ? (location.state as { from: string }).from
        : '/';
    void navigate(from, { replace: true });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mfaToken !== null) {
        await completeMfaLogin(mfaToken, mfaCode.trim());
        redirectAfterLogin();
        return;
      }
      const result = await login(username, password);
      if (result.kind === 'mfa_required') {
        setMfaToken(result.mfaToken);
        setMfaCode('');
        return;
      }
      redirectAfterLogin();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'invalid_credentials') {
        setError(INVALID_CREDENTIALS_MESSAGE);
      } else if (
        err instanceof ApiClientError &&
        err.code === 'invalid_mfa_code'
      ) {
        setError('Código de verificación inválido');
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
    <AuthShell className="login-shell">
      <div className="mx-auto w-full max-w-[420px]">
        <motion.div
          className="login-card"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: reduceMotion ? 0 : 0.06 }}
        >
          <Card className="login-surface">
            <CardHeader className="text-center">
              <div className="login-brand-panel mb-6 flex justify-center">
                <img
                  src="/brand/kairo-logo.png"
                  alt="KAIRO"
                  className="h-24 w-auto object-contain"
                />
              </div>
              <CardTitle
                id="access-title"
                className="text-2xl font-semibold tracking-tight"
              >
                <h1 className="text-2xl font-semibold tracking-tight">
                  Inicia sesión
                </h1>
              </CardTitle>
              <CardDescription className="text-foreground/70">
                Bienvenido a tu espacio de trabajo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={onSubmit} noValidate>
                <div className="space-y-2">
                  <Label htmlFor="username">Usuario</Label>
                  <div className="relative">
                    <UserRound
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="username"
                      name="username"
                      autoComplete="username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      required
                      className="login-input h-12 rounded-2xl pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative">
                    <LockKeyhole
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
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
                      className="login-input h-12 rounded-2xl pr-12 pl-10"
                    />
                    <button
                      type="button"
                      className="absolute top-1/2 right-0.5 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"
                      aria-label={
                        showPassword
                          ? 'Ocultar contraseña'
                          : 'Mostrar contraseña'
                      }
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? (
                        <EyeOff aria-hidden="true" className="size-4" />
                      ) : (
                        <Eye aria-hidden="true" className="size-4" />
                      )}
                    </button>
                  </div>
                  {capsLock ? (
                    <p className="text-xs text-muted-foreground">
                      Bloq Mayús está activado
                    </p>
                  ) : null}
                </div>

                {mfaToken !== null ? (
                  <div className="space-y-2">
                    <Label htmlFor="mfa-code">Código de verificación</Label>
                    <Input
                      id="mfa-code"
                      name="mfa-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      aria-describedby="mfa-code-help"
                      value={mfaCode}
                      onChange={(event) => setMfaCode(event.target.value)}
                      required
                      className="login-input h-12 rounded-2xl"
                    />
                    <p
                      id="mfa-code-help"
                      className="text-xs text-muted-foreground"
                    >
                      Ingresa el código de tu app de autenticación.
                    </p>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => {
                        setMfaToken(null);
                        setMfaCode('');
                        setError('');
                      }}
                    >
                      Volver a usuario y contraseña
                    </button>
                  </div>
                ) : null}

                <ErrorMessage message={error} />

                <Button
                  type="submit"
                  className="login-submit h-12 w-full rounded-2xl"
                  disabled={submitting}
                  loading={submitting}
                >
                  {submitting
                    ? 'Entrando…'
                    : mfaToken !== null
                      ? 'Verificar código'
                      : 'Entrar al panel'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </AuthShell>
  );
}
