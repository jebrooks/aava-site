import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://www.allaboardva.com',
  output: 'server',
  adapter: vercel(),
  trailingSlash: 'never',
  server: {
    host: '127.0.0.1',
    port: 4330,
  },
  vite: {
    server: {
      strictPort: true,
    },
  },
});
