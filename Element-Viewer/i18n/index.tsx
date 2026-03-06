import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useChatGPTGlobal } from '../hooks/useChatGPT';
import enUS from './en-US';
import ptBR from './pt-BR';
import type { Messages, SupportedLocale } from './types';

const DEFAULT_LOCALE: SupportedLocale = 'en-US';

const MESSAGES: Record<SupportedLocale, Messages> = {
  'en-US': enUS,
  'pt-BR': ptBR,
};

const LOCALE_ALIASES: Record<string, SupportedLocale> = {
  en: 'en-US',
  'en-us': 'en-US',
  pt: 'pt-BR',
  'pt-br': 'pt-BR',
};

interface I18nContextValue {
  locale: SupportedLocale;
  messages: Messages;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const getCanonicalLocale = (value: string): string => {
  try {
    return Intl.getCanonicalLocales(value)[0] ?? value;
  } catch {
    return value;
  }
};

const resolveSupportedLocale = (...candidates: Array<string | null | undefined>): SupportedLocale => {
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

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const openAiLocale = useChatGPTGlobal('locale');
  const documentLocale = typeof document !== 'undefined' ? document.documentElement.lang : null;
  const locale = resolveSupportedLocale(openAiLocale, documentLocale);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    messages: MESSAGES[locale],
    formatNumber: (number, options) => number.toLocaleString(locale, options),
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }

  return context;
};
