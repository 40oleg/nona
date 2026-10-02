import {defineConfig} from 'vitepress';

const github = 'https://github.com/40oleg/nona';

export default defineConfig({
  title: 'Nona',
  description: 'Ahead-of-time compiler from JavaScript (ES2020) to standalone Windows and Linux x64 executables',
  lang: 'en-US',
  base: '/nona/',
  srcDir: 'src',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: false,
  head: [['link', {rel: 'icon', type: 'image/svg+xml', href: '/nona/favicon.svg'}]],
  sitemap: {hostname: 'https://40oleg.github.io/nona/'},
  themeConfig: {
    logo: '/favicon.svg',
    nav: [
      {text: 'Guide', link: '/guide/what-is-nona', activeMatch: '/guide/'},
      {text: 'Reference', link: '/reference/cli', activeMatch: '/reference/'},
      {text: 'Examples', link: '/examples/', activeMatch: '/examples/'},
      {text: 'Changelog', link: '/changelog'},
      {text: 'Русский', link: `${github}/blob/main/README.ru.md`},
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          {text: 'What is Nona', link: '/guide/what-is-nona'},
          {text: 'Getting started', link: '/guide/getting-started'},
          {text: 'How it works', link: '/guide/how-it-works'},
          {text: 'Language support', link: '/guide/language-support'},
          {text: 'Compatibility and limitations', link: '/guide/compatibility'},
          {text: 'Status and roadmap', link: '/guide/status'},
        ],
      },
      {
        text: 'Reference',
        items: [
          {text: 'Command line', link: '/reference/cli'},
          {text: 'compile() API', link: '/reference/api'},
          {text: 'Built-in modules', link: '/reference/modules'},
          {text: 'Timers and the event loop', link: '/reference/host-apis'},
          {text: 'process', link: '/reference/process'},
          {text: 'File system and text encoding', link: '/reference/fs'},
          {text: 'Native functions (FFI)', link: '/reference/ffi'},
          {text: 'Windows executables', link: '/reference/windows-executables'},
          {text: 'Test262', link: '/reference/test262'},
        ],
      },
      {
        text: 'Examples',
        items: [
          {text: 'Overview', link: '/examples/'},
          {text: 'Hello, timers', link: '/examples/hello'},
          {text: 'Museum: wallpaper changer', link: '/examples/museum'},
          {text: 'Matrix calculator', link: '/examples/matrix-calculator'},
          {text: 'Word count: fs and process', link: '/examples/word-count'},
        ],
      },
      {
        text: 'Project',
        items: [
          {text: 'Contributing', link: '/contributing'},
          {text: 'Changelog', link: '/changelog'},
        ],
      },
    ],
    search: {provider: 'local'},
    socialLinks: [{icon: 'github', link: github}],
    editLink: {pattern: `${github}/edit/main/site/src/:path`, text: 'Edit this page on GitHub'},
    outline: [2, 3],
    footer: {message: 'Released under the MIT License.', copyright: 'Copyright © 2026 Oleg Merkulov'},
  },
});
