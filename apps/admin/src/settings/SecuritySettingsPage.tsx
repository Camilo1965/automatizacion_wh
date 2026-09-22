import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

import {
  beginMfaSetup,
  confirmMfaSetup,
  disableMfa,
  fetchMfaStatus,
  listSessions,
  revokeOtherSessions,
  revokeSession,
} from '../api/auth-api';
import {
  createAdminUser,
  deactivateAdminUser,
  listAdminUsers,
  updateAdminUserRole,
} from '../api/security-api';
import { getErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { ErrorMessage } from '@/components/ErrorMessage';
import { LoadingState } from '@/components/LoadingState';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function SecuritySettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = user?.role === 'owner';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [mfaCode, setMfaCode] = useState('');
  const [mfaPassword, setMfaPassword] = useState('');
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupUri, setSetupUri] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const mfaQuery = useQuery({
    queryKey: ['security-mfa'],
    queryFn: fetchMfaStatus,
  });

  const sessionsQuery = useQuery({
    queryKey: ['security-sessions'],
    queryFn: listSessions,
  });

  const usersQuery = useQuery({
    queryKey: ['security-users'],
    queryFn: listAdminUsers,
    enabled: isOwner,
  });

  useEffect(() => {
    let cancelled = false;
    if (setupUri === null) {
      setQrDataUrl(null);
      return;
    }
    void QRCode.toDataURL(setupUri, { width: 192, margin: 1 }).then((url) => {
      if (!cancelled) {
        setQrDataUrl(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [setupUri]);

  const createMutation = useMutation({
    mutationFn: createAdminUser,
    onSuccess: async () => {
      setUsername('');
      setPassword('');
      setPasswordConfirmation('');
      setCurrentPassword('');
      setFormError(null);
      setFormSuccess('Operadora creada.');
      await queryClient.invalidateQueries({ queryKey: ['security-users'] });
    },
    onError: (error) => {
      setFormSuccess(null);
      setFormError(getErrorMessage(error, 'No se pudo crear la operadora'));
    },
  });

  const roleMutation = useMutation({
    mutationFn: (input: {
      userId: string;
      role: 'owner' | 'operator';
      currentPassword: string;
    }) =>
      updateAdminUserRole(input.userId, {
        role: input.role,
        currentPassword: input.currentPassword,
      }),
    onSuccess: async () => {
      setFormError(null);
      setFormSuccess('Rol actualizado.');
      await queryClient.invalidateQueries({ queryKey: ['security-users'] });
    },
    onError: (error) => {
      setFormSuccess(null);
      setFormError(getErrorMessage(error, 'No se pudo cambiar el rol'));
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (input: { userId: string; currentPassword: string }) =>
      deactivateAdminUser(input.userId, {
        currentPassword: input.currentPassword,
      }),
    onSuccess: async () => {
      setFormError(null);
      setFormSuccess('Cuenta desactivada.');
      await queryClient.invalidateQueries({ queryKey: ['security-users'] });
    },
    onError: (error) => {
      setFormSuccess(null);
      setFormError(getErrorMessage(error, 'No se pudo desactivar la cuenta'));
    },
  });

  const setupMutation = useMutation({
    mutationFn: beginMfaSetup,
    onSuccess: (data) => {
      setMfaError(null);
      setRecoveryCodes(null);
      setSetupSecret(data.secret);
      setSetupUri(data.otpauthUri);
    },
    onError: (error) => {
      setMfaError(getErrorMessage(error, 'No se pudo iniciar MFA'));
    },
  });

  const confirmMutation = useMutation({
    mutationFn: confirmMfaSetup,
    onSuccess: async (codes) => {
      setMfaError(null);
      setRecoveryCodes(codes);
      setSetupSecret(null);
      setSetupUri(null);
      setMfaCode('');
      await queryClient.invalidateQueries({ queryKey: ['security-mfa'] });
    },
    onError: (error) => {
      setMfaError(getErrorMessage(error, 'Código MFA inválido'));
    },
  });

  const disableMutation = useMutation({
    mutationFn: disableMfa,
    onSuccess: async () => {
      setMfaError(null);
      setMfaPassword('');
      setRecoveryCodes(null);
      await queryClient.invalidateQueries({ queryKey: ['security-mfa'] });
      await queryClient.invalidateQueries({ queryKey: ['security-sessions'] });
    },
    onError: (error) => {
      setMfaError(getErrorMessage(error, 'No se pudo desactivar MFA'));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeSession,
    onSuccess: async () => {
      setSessionError(null);
      await queryClient.invalidateQueries({ queryKey: ['security-sessions'] });
    },
    onError: (error) => {
      setSessionError(getErrorMessage(error, 'No se pudo revocar la sesión'));
    },
  });

  const revokeOthersMutation = useMutation({
    mutationFn: revokeOtherSessions,
    onSuccess: async () => {
      setSessionError(null);
      await queryClient.invalidateQueries({ queryKey: ['security-sessions'] });
    },
    onError: (error) => {
      setSessionError(
        getErrorMessage(error, 'No se pudieron cerrar las otras sesiones'),
      );
    },
  });

  if (mfaQuery.isPending || sessionsQuery.isPending) {
    return <LoadingState label="Cargando seguridad…" />;
  }

  if (mfaQuery.isError || sessionsQuery.isError) {
    return (
      <ErrorMessage message="No se pudo cargar la configuración de seguridad." />
    );
  }

  return (
    <section className="space-y-6" aria-labelledby="security-settings-title">
      <PageHeader
        title="Seguridad y acceso"
        description="MFA, sesiones activas y gestión de acceso. Nunca se muestran hashes ni secretos almacenados."
      />

      <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle id="security-settings-title" className="text-lg">
            Autenticación en dos pasos (MFA)
          </CardTitle>
          <CardDescription>
            Usa una app autenticadora. El código QR se genera en este dispositivo;
            el secreto no se envía a servicios externos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Estado:{' '}
            {mfaQuery.data.enabled
              ? 'Activo'
              : mfaQuery.data.pendingSetup
                ? 'Pendiente de confirmación'
                : 'Inactivo'}
          </p>

          {!mfaQuery.data.enabled ? (
            <div className="space-y-4">
              {setupSecret === null ? (
                <Button
                  type="button"
                  onClick={() => setupMutation.mutate()}
                  disabled={setupMutation.isPending}
                >
                  Configurar MFA
                </Button>
              ) : (
                <div className="space-y-3">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Código QR para configurar MFA"
                      className="size-48 rounded-xl border border-border bg-white p-2"
                    />
                  ) : (
                    <LoadingState label="Generando QR…" />
                  )}
                  <p className="text-sm break-all text-foreground">
                    URI: {setupUri}
                  </p>
                  <p className="font-mono text-sm text-foreground">
                    Secreto manual: {setupSecret}
                  </p>
                  <label className="block space-y-1 text-sm" htmlFor="mfa-confirm-code">
                    <span className="text-muted-foreground">
                      Código de la app
                    </span>
                    <input
                      id="mfa-confirm-code"
                      className="w-full rounded-[1.125rem] border border-border bg-background px-3 py-2"
                      value={mfaCode}
                      onChange={(event) => setMfaCode(event.target.value)}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                    />
                  </label>
                  <Button
                    type="button"
                    disabled={confirmMutation.isPending || mfaCode.trim() === ''}
                    onClick={() => confirmMutation.mutate(mfaCode.trim())}
                  >
                    Confirmar y activar
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block space-y-1 text-sm" htmlFor="mfa-disable-password">
                <span className="text-muted-foreground">
                  Contraseña actual para desactivar MFA
                </span>
                <input
                  id="mfa-disable-password"
                  type="password"
                  className="w-full rounded-[1.125rem] border border-border bg-background px-3 py-2"
                  value={mfaPassword}
                  onChange={(event) => setMfaPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  disableMutation.isPending || mfaPassword.trim() === ''
                }
                onClick={() => disableMutation.mutate(mfaPassword)}
              >
                Desactivar MFA
              </Button>
            </div>
          )}

          {recoveryCodes !== null ? (
            <div className="space-y-2 rounded-[1.125rem] border border-border p-4">
              <p className="text-sm font-medium text-foreground">
                Códigos de recuperación (solo esta vez)
              </p>
              <ul className="font-mono text-sm">
                {recoveryCodes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRecoveryCodes(null)}
              >
                Ya los guardé
              </Button>
            </div>
          ) : null}

          {mfaError ? <ErrorMessage message={mfaError} /> : null}
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-lg">Sesiones activas</CardTitle>
          <CardDescription>
            Revoca sesiones individuales u otras sesiones abiertas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y divide-border rounded-[1.125rem] border border-border">
            {sessionsQuery.data.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {session.current ? 'Esta sesión' : 'Otra sesión'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Creada {new Date(session.createdAt).toLocaleString('es-CO')} ·
                    Vista {new Date(session.lastSeenAt).toLocaleString('es-CO')}
                  </p>
                </div>
                {!session.current ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={revokeMutation.isPending}
                    onClick={() => revokeMutation.mutate(session.id)}
                  >
                    Revocar
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            disabled={revokeOthersMutation.isPending}
            onClick={() => revokeOthersMutation.mutate()}
          >
            Cerrar otras sesiones
          </Button>
          {sessionError ? <ErrorMessage message={sessionError} /> : null}
        </CardContent>
      </Card>

      {isOwner ? (
        <>
          {usersQuery.isPending ? (
            <LoadingState label="Cargando acceso…" />
          ) : usersQuery.isError ? (
            <ErrorMessage message="No se pudo cargar la lista de usuarias administrativas." />
          ) : (
            <>
              <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
                <CardHeader>
                  <CardTitle className="text-lg">
                    Usuarias administrativas
                  </CardTitle>
                  <CardDescription>
                    Propietaria = todas las capacidades. Operadora = solo
                    operación diaria.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="divide-y divide-border rounded-[1.125rem] border border-border">
                    {usersQuery.data.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {item.username}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.role === 'owner'
                              ? 'Propietaria'
                              : 'Operadora'}
                          </p>
                        </div>
                        {item.id !== user?.id ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={
                                roleMutation.isPending ||
                                currentPassword.trim() === ''
                              }
                              onClick={() => {
                                roleMutation.mutate({
                                  userId: item.id,
                                  role:
                                    item.role === 'owner'
                                      ? 'operator'
                                      : 'owner',
                                  currentPassword,
                                });
                              }}
                            >
                              Cambiar a{' '}
                              {item.role === 'owner'
                                ? 'operadora'
                                : 'propietaria'}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={
                                deactivateMutation.isPending ||
                                currentPassword.trim() === ''
                              }
                              onClick={() => {
                                deactivateMutation.mutate({
                                  userId: item.id,
                                  currentPassword,
                                });
                              }}
                            >
                              Desactivar
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
                <CardHeader>
                  <CardTitle className="text-lg">Crear operadora</CardTitle>
                  <CardDescription>
                    Confirma con tu contraseña actual. No se almacenan
                    contraseñas en texto plano.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      createMutation.mutate({
                        username,
                        password,
                        passwordConfirmation,
                        role: 'operator',
                        currentPassword,
                      });
                    }}
                  >
                    <label
                      className="block space-y-1 text-sm"
                      htmlFor="security-username"
                    >
                      <span className="text-muted-foreground">Usuario</span>
                      <input
                        id="security-username"
                        className="w-full rounded-[1.125rem] border border-border bg-background px-3 py-2"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        autoComplete="off"
                        required
                      />
                    </label>
                    <label
                      className="block space-y-1 text-sm"
                      htmlFor="security-password"
                    >
                      <span className="text-muted-foreground">
                        Contraseña nueva
                      </span>
                      <input
                        id="security-password"
                        type="password"
                        className="w-full rounded-[1.125rem] border border-border bg-background px-3 py-2"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="new-password"
                        required
                      />
                    </label>
                    <label
                      className="block space-y-1 text-sm"
                      htmlFor="security-password-confirm"
                    >
                      <span className="text-muted-foreground">
                        Confirmar contraseña nueva
                      </span>
                      <input
                        id="security-password-confirm"
                        type="password"
                        className="w-full rounded-[1.125rem] border border-border bg-background px-3 py-2"
                        value={passwordConfirmation}
                        onChange={(event) =>
                          setPasswordConfirmation(event.target.value)
                        }
                        autoComplete="new-password"
                        required
                      />
                    </label>
                    <label
                      className="block space-y-1 text-sm"
                      htmlFor="security-current-password"
                    >
                      <span className="text-muted-foreground">
                        Tu contraseña actual (confirmación)
                      </span>
                      <input
                        id="security-current-password"
                        type="password"
                        className="w-full rounded-[1.125rem] border border-border bg-background px-3 py-2"
                        value={currentPassword}
                        onChange={(event) =>
                          setCurrentPassword(event.target.value)
                        }
                        autoComplete="current-password"
                        required
                      />
                    </label>
                    {formError ? <ErrorMessage message={formError} /> : null}
                    {formSuccess ? (
                      <p className="text-sm text-foreground" role="status">
                        {formSuccess}
                      </p>
                    ) : null}
                    <Button type="submit" disabled={createMutation.isPending}>
                      Crear operadora
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
