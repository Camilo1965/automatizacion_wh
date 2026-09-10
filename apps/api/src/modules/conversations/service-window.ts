const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ServiceWindow = Readonly<{
  open: boolean;
  expiresAt: Date;
}>;

export function evaluateServiceWindow(
  lastInboundMessageAt: Date,
  now = new Date(),
): ServiceWindow {
  const expiresAt = new Date(
    lastInboundMessageAt.getTime() + SERVICE_WINDOW_MS,
  );
  return { open: now.getTime() < expiresAt.getTime(), expiresAt };
}
