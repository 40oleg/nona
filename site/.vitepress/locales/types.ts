import type {DefaultTheme} from 'vitepress';

/**
 * Everything that differs between site languages except the pages themselves.
 * English (`en.ts`) is the source; every other dictionary translates it.
 */
export interface Dictionary {
  /** Locale key and URL prefix: `root` for English (`/`), otherwise e.g. `zh` (`/zh/`). */
  key: string;
  /** Value of the `lang` attribute, e.g. `zh-CN`. */
  lang: string;
  /** Name shown in the language switcher. */
  label: string;
  dir?: 'ltr' | 'rtl';
  description: string;
  nav: {
    guide: string;
    reference: string;
    examples: string;
    changelog: string;
    /** The playground page (English only). */
    playground: string;
  };
  sidebar: {
    introduction: string;
    whatIsNona: string;
    gettingStarted: string;
    howItWorks: string;
    languageSupport: string;
    compatibility: string;
    performance: string;
    status: string;
    reference: string;
    cli: string;
    api: string;
    modules: string;
    hostApis: string;
    process: string;
    fs: string;
    ffi: string;
    windowsExecutables: string;
    test262: string;
    examples: string;
    overview: string;
    hello: string;
    museum: string;
    matrixCalculator: string;
    wordCount: string;
    project: string;
    contributing: string;
    changelog: string;
  };
  theme: {
    editLink: string;
    outline: string;
    prev: string;
    next: string;
    lastUpdated: string;
    returnToTop: string;
    sidebarMenu: string;
    darkModeSwitch: string;
    lightModeSwitchTitle: string;
    darkModeSwitchTitle: string;
    langMenu: string;
    skipToContent: string;
    footer: string;
    notFound: DefaultTheme.NotFoundOptions;
  };
  /** Translations for the local search box and modal. */
  search: {
    button: {buttonText: string; buttonAriaLabel: string};
    modal: {
      displayDetails: string;
      resetButtonTitle: string;
      backButtonTitle: string;
      noResultsText: string;
      footer: {
        selectText: string;
        selectKeyAriaLabel: string;
        navigateText: string;
        navigateUpKeyAriaLabel: string;
        navigateDownKeyAriaLabel: string;
        closeText: string;
        closeKeyAriaLabel: string;
      };
    };
  };
}
