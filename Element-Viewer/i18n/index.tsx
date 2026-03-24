import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useChatGPTGlobal } from '../hooks/useChatGPT';
import { SUPPORTED_LOCALES, resolveSupportedLocale } from './config';
import { getMessagesForLocale } from './resources';
import type { Messages, SupportedLocale } from './types';

const STANDALONE_LOCALE_STORAGE_KEY = 'chymia-standalone-locale';

const MESSAGES = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [locale, getMessagesForLocale(locale)]),
) as Record<SupportedLocale, Messages>;

interface I18nContextValue {
  locale: SupportedLocale;
  messages: Messages;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  setLocale: (locale: SupportedLocale) => void;
  availableLocales: SupportedLocale[];
}

const I18nContext = createContext<I18nContextValue | null>(null);

const getStoredStandaloneLocale = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(STANDALONE_LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const openAiLocale = useChatGPTGlobal('locale');
  const isStandaloneWebapp = typeof window !== 'undefined' && !window.openai;
  const [standaloneLocale, setStandaloneLocaleState] = useState<SupportedLocale>(() =>
    resolveSupportedLocale(
      getStoredStandaloneLocale(),
      'en-US',
    ),
  );
  const documentLocale = typeof document !== 'undefined' ? document.documentElement.lang : null;
  const browserLocale = typeof navigator !== 'undefined' ? navigator.language : null;
  const locale = isStandaloneWebapp
    ? resolveSupportedLocale(standaloneLocale, 'en-US')
    : resolveSupportedLocale(openAiLocale, documentLocale, browserLocale);

  const setLocale = useCallback((nextLocale: SupportedLocale) => {
    const resolvedLocale = resolveSupportedLocale(nextLocale);

    if (isStandaloneWebapp && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STANDALONE_LOCALE_STORAGE_KEY, resolvedLocale);
      } catch {
        // Ignore storage failures and keep the in-memory locale.
      }
    }

    setStandaloneLocaleState((currentLocale) =>
      currentLocale === resolvedLocale ? currentLocale : resolvedLocale,
    );
  }, [isStandaloneWebapp]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
      document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    messages: MESSAGES[locale],
    formatNumber: (number, options) => number.toLocaleString(locale, options),
    setLocale,
    availableLocales: SUPPORTED_LOCALES,
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }

  return context;
};
