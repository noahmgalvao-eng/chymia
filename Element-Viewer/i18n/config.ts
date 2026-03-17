import type { SupportedLocale } from './types';

export const DEFAULT_LOCALE: SupportedLocale = 'en-US';

export const LOCALE_ALIASES: Record<string, SupportedLocale> = {
  ar: 'ar',
  en: 'en-US',
  'en-us': 'en-US',
  es: 'es-ES',
  'es-es': 'es-ES',
  fr: 'fr-FR',
  'fr-fr': 'fr-FR',
  hi: 'hi-IN',
  'hi-in': 'hi-IN',
  pt: 'pt-BR',
  'pt-br': 'pt-BR',
};

const getCanonicalLocale = (value: string): string => {
  try {
    return Intl.getCanonicalLocales(value)[0] ?? value;
  } catch {
    return value;
  }
};

export const resolveSupportedLocale = (...candidates: Array<string | null | undefined>): SupportedLocale => {
  for (const candidate of candidates) {
    if (!candidate) continue;

    const canonical = getCanonicalLocale(candidate);
    const directMatch = LOCALE_ALIASES[canonical.toLowerCase()];
    if (directMatch) {
      return directMatch;
    }

    const languageMatch = LOCALE_ALIASES[canonical.split('-')[0]?.toLowerCase() ?? ''];
    if (languageMatch) {
      return languageMatch;
    }
  }

  return DEFAULT_LOCALE;
};
