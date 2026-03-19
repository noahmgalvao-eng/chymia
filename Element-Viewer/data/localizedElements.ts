import { SUPPORTED_LOCALES, resolveSupportedLocale } from '../i18n/config';
import { getElementSourceForLocale, type LocalizedElementText } from '../i18n/resources';
import type { SupportedLocale } from '../i18n/types';
import type { ChemicalElement } from '../types';
import { ELEMENTS as BASE_ELEMENTS } from './elements';
import { SOURCE_DATA as BASE_SOURCE } from './periodic_table_source';

const BASE_SOURCE_CATEGORY_BY_SYMBOL = new Map<string, string>(
  (BASE_SOURCE.elements as Array<{ symbol?: string; category?: string }>)
    .filter((entry) => typeof entry.symbol === 'string')
    .map((entry) => [entry.symbol as string, typeof entry.category === 'string' ? entry.category : '']),
);

const ELEMENTS_BY_LOCALE_CACHE = new Map<SupportedLocale, ChemicalElement[]>();
const ELEMENT_BY_SYMBOL_BY_LOCALE_CACHE = new Map<SupportedLocale, Map<string, ChemicalElement>>();
const LOCALIZED_TEXT_BY_LOCALE_CACHE = new Map<SupportedLocale, Map<string, LocalizedElementText>>();
const LOOKUP_SYMBOL_BY_QUERY = new Map<string, string>();

const normalizeLookup = (value: string): string => value.trim().toLowerCase();

const getLocalizedTextBySymbol = (
  localeInput: string | SupportedLocale,
): Map<string, LocalizedElementText> => {
  const locale = resolveSupportedLocale(localeInput);
  const cached = LOCALIZED_TEXT_BY_LOCALE_CACHE.get(locale);
  if (cached) {
    return cached;
  }

  const localizedTextBySymbol = new Map<string, LocalizedElementText>(
    getElementSourceForLocale(locale).elements.map((entry) => [entry.symbol, entry]),
  );

  LOCALIZED_TEXT_BY_LOCALE_CACHE.set(locale, localizedTextBySymbol);
  return localizedTextBySymbol;
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
  if (!lookupValue) {
    return;
  }

  const normalized = normalizeLookup(lookupValue);
  if (!normalized) {
    return;
  }

  LOOKUP_SYMBOL_BY_QUERY.set(normalized, symbol);
};

for (const element of BASE_ELEMENTS) {
  registerElementLookup(element.symbol, element.symbol);
  registerElementLookup(element.name, element.symbol);
}

for (const locale of SUPPORTED_LOCALES) {
  for (const entry of getElementSourceForLocale(locale).elements) {
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
