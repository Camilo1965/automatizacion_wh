import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiProxyPort = process.env.CAMILA_E2E_API_PORT ?? '3000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiProxyPort}`,
        changeOrigin: false,
      },
    },
  },
});
