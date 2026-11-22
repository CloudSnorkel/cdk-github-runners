import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineConfig } from 'vitepress';
import { API_SECTIONS, ApiPage, apiHeadingsPlugin, generateApiPages, writeApiPages } from './api';
import { DEFAULT_LANGUAGE, LANGUAGES } from './languages';
import { rosettaPlugin } from './rosetta';

const root = path.resolve(__dirname, '..', '..');

// docgen is slow, so keep the pages until the assembly or the page generator changes
const cacheFile = path.join(__dirname, 'cache', 'api.json');
const hash = createHash('sha256').update(fs.readFileSync(path.join(root, '.jsii'))).update(fs.readFileSync(path.join(__dirname, 'api.ts'))).digest('hex');
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) : {};
const apiPages: ApiPage[] = cache.hash === hash ? cache.pages : await generateApiPages(root);
fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
fs.writeFileSync(cacheFile, JSON.stringify({ hash, pages: apiPages }));

// the API pages are written to docs/api before VitePress looks for pages, so search indexes them too
writeApiPages(path.join(__dirname, '..', 'api'), apiPages);

const apiSidebar = API_SECTIONS.map(([kind, text]) => ({
  text,
  collapsed: kind !== 'constructs',
  items: apiPages.filter(p => p.kind === kind).map(p => ({ text: p.name, link: `/api/${p.name}` })),
}));

// set the language before the page shows, so it doesn't flash TypeScript first
const languageScript = `
try {
  const lang = new URLSearchParams(location.search).get('lang') || localStorage.getItem('lang');
  document.documentElement.dataset.lang = ${JSON.stringify(LANGUAGES.map(l => l.id))}.includes(lang) ? lang : '${DEFAULT_LANGUAGE}';
} catch {
  document.documentElement.dataset.lang = '${DEFAULT_LANGUAGE}';
}`;

export default defineConfig({
  title: 'GitHub Runners CDK',
  description: 'Ephemeral self-hosted GitHub Actions runners in your AWS account',
  cleanUrls: true,
  outDir: '../dist/docs',
  head: [
    ['link', { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' }],
    ['script', {}, languageScript],
  ],
  markdown: {
    config: md => {
      rosettaPlugin(md, root);
      apiHeadingsPlugin(md);
    },
  },
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'API Reference', link: '/api/', activeMatch: '/api/' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Providers', link: '/guide/providers' },
            { text: 'Setting Up GitHub', link: '/guide/setup-github' },
          ],
        },
        {
          text: 'Customizing',
          items: [
            { text: 'Providers and Images', link: '/guide/customizing' },
            { text: 'Composite Providers', link: '/guide/composite-providers' },
            { text: 'Provider Selection', link: '/guide/provider-selection' },
            { text: 'Warm Runners', link: '/guide/warm-runners' },
            { text: 'GitHub Enterprise Server', link: '/guide/ghes' },
          ],
        },
        {
          text: 'Operating',
          items: [
            { text: 'Security', link: '/guide/security' },
            { text: 'Compliance', link: '/guide/compliance' },
            { text: 'Monitoring', link: '/guide/monitoring' },
            { text: 'Cost', link: '/guide/cost' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
            { text: 'Architecture', link: '/guide/architecture' },
            { text: 'Examples', link: '/guide/examples' },
          ],
        },
      ],
      '/api/': [
        { text: 'API Reference', link: '/api/' },
        ...apiSidebar,
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/CloudSnorkel/cdk-github-runners' },
      { icon: 'discord', link: 'https://discord.gg/vdrTUTqQKv' },
    ],
    editLink: {
      pattern: 'https://github.com/CloudSnorkel/cdk-github-runners/edit/main/docs/:path',
    },
    search: {
      provider: 'local',
      options: {
        // API member headings hold the name in every language, index only the TypeScript one
        _render: (src, env, md) => md.render(src, env).replace(/<span class="lang lang-(?!typescript")[^"]+">.*?<\/span>/g, ''),
      },
    },
    footer: {
      message: 'Released under the Apache-2.0 License.',
      copyright: 'Copyright © CloudSnorkel',
    },
  },
});
