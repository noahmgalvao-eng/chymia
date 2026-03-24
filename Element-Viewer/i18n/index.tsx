import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useChatGPTGlobal } from '../hooks/useChatGPT';
import { SUPPORTED_LOCALES, resolveSupportedLocale } from './config';
import { getMessagesForLocale } from './resources';
import type { Messages, SupportedLocale } from './types';

const MESSAGES = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [locale, getMessagesForLocale(locale)]),
) as Record<SupportedLocale, Messages>;

interface I18nContextValue {
  locale: SupportedLocale;
  messages: Messages;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

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
