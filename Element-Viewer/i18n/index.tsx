import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useChatGPTGlobal } from '../hooks/useChatGPT';
import { resolveSupportedLocale } from './config';
import type { Messages, SupportedLocale } from './types';

type LocaleModule = {
  SOURCE_DATA?: unknown;
  default?: unknown;
};

const I18N_MODULES = import.meta.glob<LocaleModule>('./*.ts', { eager: true });
const DATA_MODULES = import.meta.glob<LocaleModule>('../data/periodic_table_source_*.ts', { eager: true });

const getModuleValue = (module: LocaleModule | undefined): unknown =>
  module?.default ?? module?.SOURCE_DATA;

const isMessages = (value: unknown): value is Messages => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return (
    'common' in value &&
    'app' in value &&
    'periodicTable' in value &&
    'matter' in value &&
    'propertiesMenu' in value &&
    'recordingStats' in value
  );
};

const findModuleValueBySuffix = (
  modules: Record<string, LocaleModule>,
  suffix: string,
): unknown => {
  const normalizedSuffix = suffix.toLowerCase();

  for (const [path, module] of Object.entries(modules)) {
    if (path.toLowerCase().endsWith(normalizedSuffix)) {
      return getModuleValue(module);
    }
  }

  return undefined;
};

const getMessagesForLocale = (locale: SupportedLocale): Messages => {
  const localeSuffix = locale.toLowerCase();
  const i18nValue = findModuleValueBySuffix(I18N_MODULES, `${localeSuffix}.ts`);
  if (isMessages(i18nValue)) {
    return i18nValue;
  }

  const dataValue = findModuleValueBySuffix(DATA_MODULES, `periodic_table_source_${localeSuffix}.ts`);
  if (isMessages(dataValue)) {
    return dataValue;
  }

  const fallback = findModuleValueBySuffix(I18N_MODULES, 'en-us.ts');
  if (isMessages(fallback)) {
    return fallback;
  }

  throw new Error(`Missing i18n messages for locale ${locale}`);
};

const MESSAGES: Record<SupportedLocale, Messages> = {
  ar: getMessagesForLocale('ar'),
  'en-US': getMessagesForLocale('en-US'),
  'es-ES': getMessagesForLocale('es-ES'),
  'fr-FR': getMessagesForLocale('fr-FR'),
  'hi-IN': getMessagesForLocale('hi-IN'),
  'pt-BR': getMessagesForLocale('pt-BR'),
};

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
