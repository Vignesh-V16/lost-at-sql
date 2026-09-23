import os from 'node:os';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* Vite refuses a Host header it does not recognise (403). IP addresses are
   always fine, so the lab can use http://<server-ip>:5173; these let the
   machine's own name work as well, which survives the address changing. */
const machine = os.hostname().toLowerCase();
const allowedHosts = [machine, `${machine}.local`, `${machine}.lan`, 'localhost'];

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on the LAN too (the lab machines), not only localhost
    /* LAB_PORT lets the event run on 80, so the room types http://<name>
       with no port to mistype. Anything else keeps the dev default. */
    port: Number(process.env.LAB_PORT) || 5173,
    strictPort: false,
    allowedHosts,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:5000', ws: true, changeOrigin: true },
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          realtime: ['socket.io-client'],
        },
      },
    },
  },
});
