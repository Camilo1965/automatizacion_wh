import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ['security-users'],
    queryFn: listAdminUsers,
    enabled: user?.role === 'owner',
  });

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

  if (user?.role !== 'owner') {
    return (
      <ErrorMessage message="Solo la propietaria puede gestionar el acceso." />
    );
  }

  if (usersQuery.isPending) {
    return <LoadingState label="Cargando acceso…" />;
  }

  if (usersQuery.isError) {
    return (
      <ErrorMessage message="No se pudo cargar la lista de usuarias administrativas." />
    );
  }

  return (
    <section className="space-y-6" aria-labelledby="security-settings-title">
      <PageHeader
        title="Seguridad y acceso"
        description="Crea operadoras, cambia roles y desactiva cuentas. Nunca se muestran hashes ni secretos."
      />

      <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle id="security-settings-title" className="text-lg">
            Usuarias administrativas
          </CardTitle>
          <CardDescription>
            Propietaria = todas las capacidades. Operadora = solo operación diaria.
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
                    {item.role === 'owner' ? 'Propietaria' : 'Operadora'}
                  </p>
                </div>
                {item.id !== user.id ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        roleMutation.isPending || currentPassword.trim() === ''
                      }
                      onClick={() => {
                        roleMutation.mutate({
                          userId: item.id,
                          role: item.role === 'owner' ? 'operator' : 'owner',
                          currentPassword,
                        });
                      }}
                    >
                      Cambiar a{' '}
                      {item.role === 'owner' ? 'operadora' : 'propietaria'}
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
            Confirma con tu contraseña actual. No se almacenan contraseñas en
            texto plano.
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
            <label className="block space-y-1 text-sm" htmlFor="security-username">
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
            <label className="block space-y-1 text-sm" htmlFor="security-password">
              <span className="text-muted-foreground">Contraseña nueva</span>
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
                onChange={(event) => setCurrentPassword(event.target.value)}
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
    </section>
  );
}
