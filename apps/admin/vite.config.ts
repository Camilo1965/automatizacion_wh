import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiProxyPort = process.env.CAMILA_E2E_API_PORT ?? '3000';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts')) {
            return 'charts';
          }
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router-dom')
          ) {
            return 'react';
          }
          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'query';
          }
          return undefined;
        },
      },
    },
  },
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
