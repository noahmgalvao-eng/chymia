import type { SupportedLocale } from '../i18n/types';

export const STANDALONE_HOME_ROUTE = '/' as const;
export const STANDALONE_ABOUT_SUPPORT_ROUTE = '/about/support' as const;
export const STANDALONE_ABOUT_TERMS_ROUTE = '/about/terms' as const;
export const STANDALONE_ABOUT_PRIVACY_ROUTE = '/about/privacy' as const;
export const STANDALONE_ABOUT_CONTACT_ROUTE = '/about/contact' as const;

export const STANDALONE_DONATION_URL = 'https://www.paypal.com/qrcodes/p2pqrc/23989VXBV9L3W';
export const STANDALONE_GITHUB_URL = 'https://github.com/noahmgalvao-eng/chymia';
export const STANDALONE_CONTACT_EMAIL = 'noahmgalvao@gmail.com';
export const STANDALONE_CONTACT_MAILTO = `mailto:${STANDALONE_CONTACT_EMAIL}`;

export const STANDALONE_LANGUAGE_ORDER: SupportedLocale[] = [
  'pt-BR',
  'es-ES',
  'fr-FR',
  'hi-IN',
  'ar',
  'en-US',
];

export type StandaloneRoute =
  | typeof STANDALONE_HOME_ROUTE
  | typeof STANDALONE_ABOUT_SUPPORT_ROUTE
  | typeof STANDALONE_ABOUT_TERMS_ROUTE
  | typeof STANDALONE_ABOUT_PRIVACY_ROUTE
  | typeof STANDALONE_ABOUT_CONTACT_ROUTE;

export function normalizeStandaloneRoute(pathname: string): StandaloneRoute {
  const normalizedPath = pathname.replace(/\/+$/u, '') || STANDALONE_HOME_ROUTE;

  switch (normalizedPath) {
    case STANDALONE_HOME_ROUTE:
      return STANDALONE_HOME_ROUTE;
    case '/about':
    case STANDALONE_ABOUT_SUPPORT_ROUTE:
      return STANDALONE_ABOUT_SUPPORT_ROUTE;
    case STANDALONE_ABOUT_TERMS_ROUTE:
      return STANDALONE_ABOUT_TERMS_ROUTE;
    case STANDALONE_ABOUT_PRIVACY_ROUTE:
      return STANDALONE_ABOUT_PRIVACY_ROUTE;
    case STANDALONE_ABOUT_CONTACT_ROUTE:
      return STANDALONE_ABOUT_CONTACT_ROUTE;
    default:
      return STANDALONE_HOME_ROUTE;
  }
}

export function getStandaloneRouteFromLocation(): StandaloneRoute {
  if (typeof window === 'undefined') {
    return STANDALONE_HOME_ROUTE;
  }

  return normalizeStandaloneRoute(window.location.pathname);
}

export function openStandaloneExternal(href: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.open(href, '_blank', 'noopener,noreferrer');
}

export function isStandaloneAboutRoute(route: StandaloneRoute) {
  return route !== STANDALONE_HOME_ROUTE;
}
