import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    fs: {
      // Cho phép import types từ packages/shared ngoài thư mục web.
      allow: ['..', '../..']
    }
  }
});
