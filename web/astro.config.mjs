import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

/** Re-sync the GitHub docs every minute while `astro dev` runs. */
const docsSync = {
  name: 'docs-sync',
  hooks: {
    'astro:server:setup': ({ refreshContent }) => {
      if (!refreshContent) return;
      const timer = setInterval(() => refreshContent({ loaders: ['github-docs'] }), 60_000);
      timer.unref();
    },
  },
};

export default defineConfig({
  // Public URL of the site. Placeholder until the domain is decided: set SITE_URL or edit this.
  site: process.env.SITE_URL ?? 'https://dittu.example.com',
  // Clean URLs (/docs/cli, not /docs/cli/) so canonical links match the links on the site
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [docsSync, sitemap()],
  markdown: {
    shikiConfig: { theme: 'github-dark-default' },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
