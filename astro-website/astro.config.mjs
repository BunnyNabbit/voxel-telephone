// @ts-check
import { defineConfig } from 'astro/config';

import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';
import config from "../config.json"

// https://astro.build/config
export default defineConfig({
  output: 'server',
  site: config.website.baseURL,
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [sitemap()],
  prefetch: {
    defaultStrategy: "hover"
  },
  trailingSlash: "never"
});