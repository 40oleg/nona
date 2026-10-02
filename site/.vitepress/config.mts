import {defineConfig, type DefaultTheme, type LocaleSpecificConfig} from 'vitepress';
import {dictionaries, type Dictionary} from './locales';

const github = 'https://github.com/40oleg/nona';

/** URL prefix of a locale: '' for English (root), '/zh' for Chinese, … */
function prefix(d: Dictionary): string {
  return d.key === 'root' ? '' : `/${d.key}`;
}

/**
 * Top navigation of a locale. The changelog is English only, so every locale
 * links to `/changelog`. New items (for example the playground, labelled
 * `d.nav.playground`) are added here once for all languages.
 */
function nav(d: Dictionary): DefaultTheme.NavItem[] {
  const p = prefix(d);
  return [
    {text: d.nav.guide, link: `${p}/guide/what-is-nona`, activeMatch: `^${p}/guide/`},
    {text: d.nav.reference, link: `${p}/reference/cli`, activeMatch: `^${p}/reference/`},
    {text: d.nav.examples, link: `${p}/examples/`, activeMatch: `^${p}/examples/`},
    // The playground UI is English only; every locale links to it.
    {text: d.nav.playground, link: '/playground'},
    {text: d.nav.changelog, link: '/changelog'},
  ];
}

function sidebar(d: Dictionary): DefaultTheme.SidebarItem[] {
  const p = prefix(d);
  const s = d.sidebar;
  return [
    {
      text: s.introduction,
      items: [
        {text: s.whatIsNona, link: `${p}/guide/what-is-nona`},
        {text: s.gettingStarted, link: `${p}/guide/getting-started`},
        {text: s.howItWorks, link: `${p}/guide/how-it-works`},
        {text: s.languageSupport, link: `${p}/guide/language-support`},
        {text: s.compatibility, link: `${p}/guide/compatibility`},
        {text: s.performance, link: `${p}/guide/performance`},
        {text: s.status, link: `${p}/guide/status`},
      ],
    },
    {
      text: s.reference,
      items: [
        {text: s.cli, link: `${p}/reference/cli`},
        {text: s.api, link: `${p}/reference/api`},
        {text: s.modules, link: `${p}/reference/modules`},
        {text: s.hostApis, link: `${p}/reference/host-apis`},
        {text: s.process, link: `${p}/reference/process`},
        {text: s.fs, link: `${p}/reference/fs`},
        {text: s.ffi, link: `${p}/reference/ffi`},
        {text: s.windowsExecutables, link: `${p}/reference/windows-executables`},
        {text: s.test262, link: `${p}/reference/test262`},
      ],
    },
    {
      text: s.examples,
      items: [
        {text: s.overview, link: `${p}/examples/`},
        {text: s.hello, link: `${p}/examples/hello`},
        {text: s.museum, link: `${p}/examples/museum`},
        {text: s.matrixCalculator, link: `${p}/examples/matrix-calculator`},
        {text: s.wordCount, link: `${p}/examples/word-count`},
      ],
    },
    {
      text: s.project,
      items: [
        {text: s.contributing, link: `${p}/contributing`},
        {text: s.changelog, link: '/changelog'},
      ],
    },
  ];
}

function themeConfig(d: Dictionary): DefaultTheme.Config {
  const t = d.theme;
  return {
    nav: nav(d),
    sidebar: sidebar(d),
    editLink: {pattern: `${github}/edit/main/site/src/:path`, text: t.editLink},
    outline: {level: [2, 3], label: t.outline},
    docFooter: {prev: t.prev, next: t.next},
    lastUpdated: {text: t.lastUpdated},
    returnToTopLabel: t.returnToTop,
    sidebarMenuLabel: t.sidebarMenu,
    darkModeSwitchLabel: t.darkModeSwitch,
    lightModeSwitchTitle: t.lightModeSwitchTitle,
    darkModeSwitchTitle: t.darkModeSwitchTitle,
    langMenuLabel: t.langMenu,
    skipToContentLabel: t.skipToContent,
    notFound: t.notFound,
    footer: {message: t.footer, copyright: 'Copyright © 2026 Oleg Merkulov'},
  };
}

function locale(d: Dictionary): LocaleSpecificConfig<DefaultTheme.Config> & {label: string; link?: string} {
  return {
    label: d.label,
    lang: d.lang,
    dir: d.dir ?? 'ltr',
    description: d.description,
    ...(d.key === 'root' ? {} : {link: `/${d.key}/`}),
    themeConfig: themeConfig(d),
  };
}

export default defineConfig({
  title: 'Nona',
  base: '/nona/',
  srcDir: 'src',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: false,
  head: [['link', {rel: 'icon', type: 'image/svg+xml', href: '/nona/favicon.svg'}]],
  sitemap: {hostname: 'https://40oleg.github.io/nona/'},
  locales: Object.fromEntries(dictionaries.map(d => [d.key, locale(d)])),
  themeConfig: {
    logo: '/favicon.svg',
    socialLinks: [{icon: 'github', link: github}],
    search: {
      provider: 'local',
      options: {
        locales: Object.fromEntries(dictionaries.map(d => [d.key, {translations: d.search}])),
      },
    },
  },
});
