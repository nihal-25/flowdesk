import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/tickets': 'http://localhost:3000',
      '/agents': 'http://localhost:3000',
      '/notifications': 'http://localhost:3000',
      '/analytics': 'http://localhost:3000',
      '/presence': 'http://localhost:3000',
      '/chat': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
});
