export const ADMIN_SESSION_COOKIE = 'camila_admin_session';
export const SESSION_MAX_AGE_SECONDS = 43_200;

export function adminSessionCookieOptions(nodeEnv: string): {
  httpOnly: true;
  sameSite: 'strict';
  path: '/';
  maxAge: number;
  secure: boolean;
} {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: nodeEnv === 'production',
  };
}
