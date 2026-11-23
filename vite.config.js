import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERVER = 'localhost:3002';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5190,
    proxy: {
      '/api': `http://${SERVER}`,
      '/ws': { target: `ws://${SERVER}`, ws: true },
    },
  },
});
