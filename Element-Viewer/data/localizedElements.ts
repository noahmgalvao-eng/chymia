import type { SupportedLocale } from '../i18n/types';
import { SOURCE_DATA as AR_SOURCE } from '../i18n/ar';
import { resolveSupportedLocale } from '../i18n/config';
import { SOURCE_DATA as FR_FR_SOURCE } from '../i18n/fr-FR';
import { SOURCE_DATA as HI_IN_SOURCE } from '../i18n/hi-IN';
import type { ChemicalElement } from '../types';
import { ELEMENTS as BASE_ELEMENTS } from './elements';
import { SOURCE_DATA as BASE_SOURCE } from './periodic_table_source';
import { SOURCE_DATA as EN_US_SOURCE } from './periodic_table_source_en-US';
import { SOURCE_DATA as ES_ES_SOURCE } from './periodic_table_source_es-ES';
import { SOURCE_DATA as PT_BR_SOURCE } from './periodic_table_source_pt-BR';

type LocalizedElementTextFields = {
  symbol?: string;
  name?: string;
  summary?: string;
  category?: string;
};

type LocalizedElementSourceInput =
  | Record<string, LocalizedElementTextFields>
  | LocalizedElementTextFields[]
  | {
      elements?: Record<string, LocalizedElementTextFields> | LocalizedElementTextFields[];
    };

const LOCALIZED_SOURCE_BY_LOCALE: Partial<Record<SupportedLocale, LocalizedElementSourceInput>> = {
  ar: AR_SOURCE as LocalizedElementSourceInput,
  'en-US': EN_US_SOURCE as LocalizedElementSourceInput,
  'es-ES': ES_ES_SOURCE as LocalizedElementSourceInput,
  'fr-FR': FR_FR_SOURCE as LocalizedElementSourceInput,
  'hi-IN': HI_IN_SOURCE as LocalizedElementSourceInput,
  'pt-BR': PT_BR_SOURCE as LocalizedElementSourceInput,
};

const BASE_SOURCE_CATEGORY_BY_SYMBOL = new Map<string, string>(
  (BASE_SOURCE.elements as Array<{ symbol?: string; category?: string }>)
    .filter((entry) => typeof entry.symbol === 'string')
    .map((entry) => [entry.symbol as string, typeof entry.category === 'string' ? entry.category : '']),
);

const ELEMENTS_BY_LOCALE_CACHE = new Map<SupportedLocale, ChemicalElement[]>();
const ELEMENT_BY_SYMBOL_BY_LOCALE_CACHE = new Map<SupportedLocale, Map<string, ChemicalElement>>();
const LOCALIZED_TEXT_BY_LOCALE_CACHE = new Map<SupportedLocale, Map<string, LocalizedElementTextFields>>();
const LOOKUP_SYMBOL_BY_QUERY = new Map<string, string>();

const normalizeLookup = (value: string): string => value.trim().toLowerCase();

const isLocalizedFieldRecord = (
  value: unknown,
): value is Record<string, LocalizedElementTextFields> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (entry) => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
  );
};

const normalizeLocalizedEntries = (
  source: LocalizedElementSourceInput | undefined,
): Array<LocalizedElementTextFields & { symbol: string }> => {
  if (!source) return [];

  const container =
    'elements' in source && source.elements !== undefined
      ? source.elements
      : source;

  if (Array.isArray(container)) {
    return container
      .filter((entry): entry is LocalizedElementTextFields & { symbol: string } => typeof entry?.symbol === 'string')
      .filter((entry) => typeof entry.name === 'string' || typeof entry.summary === 'string' || typeof entry.category === 'string')
      .map((entry) => ({
        symbol: entry.symbol,
        name: entry.name,
        summary: entry.summary,
        category: entry.category,
      }));
  }

  if (isLocalizedFieldRecord(container)) {
    return Object.entries(container)
      .filter(([, entry]) => entry && typeof entry === 'object')
      .filter(([, entry]) => typeof entry.name === 'string' || typeof entry.summary === 'string' || typeof entry.category === 'string')
      .map(([symbol, entry]) => ({
        symbol,
        name: entry.name,
        summary: entry.summary,
        category: entry.category,
      }));
  }

  return [];
};

const getLocalizedTextBySymbol = (localeInput: string | SupportedLocale): Map<string, LocalizedElementTextFields> => {
  const locale = resolveSupportedLocale(localeInput);
  const cached = LOCALIZED_TEXT_BY_LOCALE_CACHE.get(locale);
  if (cached) {
    return cached;
  }

  const normalized = new Map<string, LocalizedElementTextFields>();
  for (const entry of normalizeLocalizedEntries(LOCALIZED_SOURCE_BY_LOCALE[locale])) {
    normalized.set(entry.symbol, entry);
  }

  LOCALIZED_TEXT_BY_LOCALE_CACHE.set(locale, normalized);
  return normalized;
};

export const getLocalizedElements = (localeInput: string | SupportedLocale): ChemicalElement[] => {
  const locale = resolveSupportedLocale(localeInput);
  const cached = ELEMENTS_BY_LOCALE_CACHE.get(locale);
  if (cached) {
    return cached;
  }

  const localizedTextBySymbol = getLocalizedTextBySymbol(locale);
  const localizedElements = BASE_ELEMENTS.map((element) => {
    const localizedText = localizedTextBySymbol.get(element.symbol);
    const name = localizedText?.name?.trim() ? localizedText.name : element.name;
    const summary = localizedText?.summary?.trim() ? localizedText.summary : element.summary;
    const displayCategory = localizedText?.category?.trim()
      ? localizedText.category
      : (element.displayCategory || BASE_SOURCE_CATEGORY_BY_SYMBOL.get(element.symbol) || undefined);

    return {
      ...element,
      name,
      summary,
      displayCategory,
    };
  });

  ELEMENTS_BY_LOCALE_CACHE.set(locale, localizedElements);
  ELEMENT_BY_SYMBOL_BY_LOCALE_CACHE.set(
    locale,
    new Map(localizedElements.map((element) => [element.symbol, element])),
  );

  return localizedElements;
};

export const getLocalizedElementBySymbol = (
  symbol: string,
  localeInput: string | SupportedLocale,
): ChemicalElement | undefined => {
  const locale = resolveSupportedLocale(localeInput);
  if (!ELEMENT_BY_SYMBOL_BY_LOCALE_CACHE.has(locale)) {
    getLocalizedElements(locale);
  }

  return ELEMENT_BY_SYMBOL_BY_LOCALE_CACHE.get(locale)?.get(symbol);
};

const registerElementLookup = (lookupValue: string | undefined, symbol: string) => {
  if (!lookupValue) return;

  const normalized = normalizeLookup(lookupValue);
  if (!normalized) return;

  LOOKUP_SYMBOL_BY_QUERY.set(normalized, symbol);
};

for (const element of BASE_ELEMENTS) {
  registerElementLookup(element.symbol, element.symbol);
  registerElementLookup(element.name, element.symbol);
}

for (const locale of Object.keys(LOCALIZED_SOURCE_BY_LOCALE) as SupportedLocale[]) {
  for (const entry of normalizeLocalizedEntries(LOCALIZED_SOURCE_BY_LOCALE[locale])) {
    registerElementLookup(entry.symbol, entry.symbol);
    registerElementLookup(entry.name, entry.symbol);
  }
}

export const findLocalizedElementByLookup = (
  lookupValue: string,
  localeInput: string | SupportedLocale,
): ChemicalElement | undefined => {
  const symbol = LOOKUP_SYMBOL_BY_QUERY.get(normalizeLookup(lookupValue));
  if (!symbol) {
    return undefined;
  }

  return getLocalizedElementBySymbol(symbol, localeInput);
};
