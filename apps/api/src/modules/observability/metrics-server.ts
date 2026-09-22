import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';

import type { MetricsRegistry } from './metrics.js';
import {
  CORRELATION_HEADER,
  normalizeCorrelationId,
} from './metrics.js';

/**
 * Minimal internal-only metrics HTTP server for the worker process.
 * Bind to the Docker internal network; do not publish on the host.
 */
export function startMetricsServer(input: {
  metrics: MetricsRegistry;
  host?: string;
  port: number;
  token?: string;
  onRefresh?: () => Promise<void>;
}): Server {
  const host = input.host ?? '0.0.0.0';
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', `http://${host}`);
      const incoming = normalizeCorrelationId(
        req.headers[CORRELATION_HEADER],
      );
      const correlationId = incoming ?? randomUUID();
      res.setHeader(CORRELATION_HEADER, correlationId);

      if (url.pathname !== '/metrics') {
        res.statusCode = 404;
        res.end('not_found');
        return;
      }

      if (input.token !== undefined && input.token !== '') {
        const auth = req.headers.authorization;
        const headerToken =
          typeof auth === 'string' && auth.startsWith('Bearer ')
            ? auth.slice('Bearer '.length)
            : undefined;
        const queryToken = url.searchParams.get('token') ?? undefined;
        if (headerToken !== input.token && queryToken !== input.token) {
          res.statusCode = 401;
          res.end('unauthorized');
          return;
        }
      }

      if (input.onRefresh) {
        await input.onRefresh();
      }

      const body = input.metrics.renderPrometheus();
      res.statusCode = 200;
      res.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8');
      res.end(body);
    })().catch(() => {
      res.statusCode = 500;
      res.end('metrics_error');
    });
  });

  server.listen(input.port, host);
  return server;
}
