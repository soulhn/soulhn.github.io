import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://soulhn.github.io',
  integrations: [sitemap()],
});
