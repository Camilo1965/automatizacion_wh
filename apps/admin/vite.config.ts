import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiProxyPort = process.env.CAMILA_E2E_API_PORT ?? '3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 450,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts')) {
            return 'charts';
          }
          if (
            id.includes('/settings/BotFlowPage') ||
            id.includes('/settings/shipping/') ||
            id.includes('/settings/integrations/') ||
            id.includes('/settings/ShippingSettingsPage') ||
            id.includes('/settings/IntegrationsPage') ||
            id.includes('/settings/ConfigurationAuditPage') ||
            id.includes('/settings/SecuritySettingsPage') ||
            id.includes('/settings/PrivacySettingsPage')
          ) {
            return 'settings-heavy';
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
