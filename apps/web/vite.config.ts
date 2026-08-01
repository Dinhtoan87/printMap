import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['print.samcom.net'],
    fs: {
      // Cho phép import types từ packages/shared ngoài thư mục web.
      allow: ['..', '../..']
    }
  }
});
