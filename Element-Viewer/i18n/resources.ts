import { DEFAULT_LOCALE, resolveSupportedLocale } from './config';
import type { Messages, SupportedLocale } from './types';

type LocaleModule = {
  SOURCE_DATA?: unknown;
  default?: unknown;
};

export interface LocalizedElementText {
  symbol: string;
  name?: string;
  summary?: string;
  category?: string;
}

export interface LocalizedElementSource {
  elements: LocalizedElementText[];
}

const I18N_MODULES = import.meta.glob<LocaleModule>('./*.ts', { eager: true });
const ELEMENT_SOURCE_MODULES = import.meta.glob<LocaleModule>('../data/periodic_table_source_*.ts', { eager: true });

const MESSAGES_CACHE = new Map<SupportedLocale, Messages>();
const ELEMENT_SOURCE_CACHE = new Map<SupportedLocale, LocalizedElementSource>();

const getModuleValue = (module: LocaleModule | undefined): unknown =>
  module?.default ?? module?.SOURCE_DATA;

export const isMessages = (value: unknown): value is Messages => {
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

const isLocalizedElementText = (value: unknown): value is LocalizedElementText => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const entry = value as Record<string, unknown>;

  if (typeof entry.symbol !== 'string') {
    return false;
  }

  return (
    (entry.name === undefined || typeof entry.name === 'string') &&
    (entry.summary === undefined || typeof entry.summary === 'string') &&
    (entry.category === undefined || typeof entry.category === 'string')
  );
};

export const isLocalizedElementSource = (value: unknown): value is LocalizedElementSource => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const source = value as Record<string, unknown>;

  if (!Array.isArray(source.elements)) {
    return false;
  }

  return source.elements.every(isLocalizedElementText);
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

const getFallbackMessages = (): Messages => {
  const fallback = findModuleValueBySuffix(I18N_MODULES, `${DEFAULT_LOCALE.toLowerCase()}.ts`);
  if (isMessages(fallback)) {
    return fallback;
  }

  throw new Error(`Missing i18n messages for default locale ${DEFAULT_LOCALE}`);
};

const getFallbackElementSource = (): LocalizedElementSource => {
  const fallback = findModuleValueBySuffix(
    ELEMENT_SOURCE_MODULES,
    `periodic_table_source_${DEFAULT_LOCALE.toLowerCase()}.ts`,
  );

  if (isLocalizedElementSource(fallback)) {
    return fallback;
  }

  throw new Error(`Missing localized element source for default locale ${DEFAULT_LOCALE}`);
};

export const getMessagesForLocale = (localeInput: string | SupportedLocale): Messages => {
  const locale = resolveSupportedLocale(localeInput);
  const cached = MESSAGES_CACHE.get(locale);
  if (cached) {
    return cached;
  }

  const value = findModuleValueBySuffix(I18N_MODULES, `${locale.toLowerCase()}.ts`);
  const messages = isMessages(value) ? value : getFallbackMessages();
  MESSAGES_CACHE.set(locale, messages);
  return messages;
};

export const getElementSourceForLocale = (
  localeInput: string | SupportedLocale,
): LocalizedElementSource => {
  const locale = resolveSupportedLocale(localeInput);
  const cached = ELEMENT_SOURCE_CACHE.get(locale);
  if (cached) {
    return cached;
  }

  const value = findModuleValueBySuffix(
    ELEMENT_SOURCE_MODULES,
    `periodic_table_source_${locale.toLowerCase()}.ts`,
  );
  const source = isLocalizedElementSource(value) ? value : getFallbackElementSource();
  ELEMENT_SOURCE_CACHE.set(locale, source);
  return source;
};
