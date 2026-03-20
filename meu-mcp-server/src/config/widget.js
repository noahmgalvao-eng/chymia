const DEFAULT_WIDGET_DESCRIPTION =
  'Interactive visualizer for chemical elements, atom structures, and phase transitions.';

const DEFAULT_WIDGET_DOMAIN = 'https://chatgpt.com';
const DEFAULT_CONNECT_DOMAINS = Object.freeze([
  'https://chatgpt.com',
  'https://chat.openai.com',
]);
const DEFAULT_RESOURCE_DOMAINS = Object.freeze(['https://*.oaistatic.com']);

function normalizeOrigin(value, baseOrigin = null) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    return new URL(trimmedValue).origin;
  } catch {
    if (baseOrigin && trimmedValue.startsWith('/')) {
      try {
        return new URL(trimmedValue, baseOrigin).origin;
      } catch {
        return null;
      }
    }

    try {
      return new URL(`https://${trimmedValue}`).origin;
    } catch {
      return null;
    }
  }
}

function parseOriginList(value, baseOrigin = null) {
  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  return value
    .split(',')
    .map((item) => normalizeOrigin(item, baseOrigin))
    .filter((item) => typeof item === 'string' && item.length > 0);
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))];
}

function getConfiguredWidgetPublicOrigin() {
  return normalizeOrigin(
    process.env.WIDGET_PUBLIC_ORIGIN ??
      process.env.ELEMENT_VIEWER_PUBLIC_ORIGIN ??
      null
  );
}

function getPostHogOrigins() {
  const widgetPublicOrigin = getConfiguredWidgetPublicOrigin();

  return [
    normalizeOrigin(
      process.env.VITE_POSTHOG_HOST ?? process.env.POSTHOG_HOST ?? null,
      widgetPublicOrigin
    ),
    normalizeOrigin(
      process.env.VITE_POSTHOG_UI_HOST ?? process.env.POSTHOG_UI_HOST ?? null,
      widgetPublicOrigin
    ),
  ].filter((value) => typeof value === 'string' && value.length > 0);
}

export function getWidgetConnectDomains() {
  return unique([
    ...DEFAULT_CONNECT_DOMAINS,
    getConfiguredWidgetPublicOrigin(),
    ...getPostHogOrigins(),
    ...parseOriginList(
      process.env.WIDGET_CONNECT_DOMAINS ?? process.env.ELEMENT_VIEWER_CONNECT_DOMAINS ?? '',
      getConfiguredWidgetPublicOrigin()
    ),
  ]);
}

export function getWidgetResourceDomains() {
  return unique([
    ...DEFAULT_RESOURCE_DOMAINS,
    ...parseOriginList(
      process.env.WIDGET_RESOURCE_DOMAINS ?? process.env.ELEMENT_VIEWER_RESOURCE_DOMAINS ?? ''
    ),
  ]);
}

export function createWidgetMeta() {
  return {
    'openai/widgetCSP': {
      connect_domains: getWidgetConnectDomains(),
      resource_domains: getWidgetResourceDomains(),
    },
    'openai/widgetDescription': DEFAULT_WIDGET_DESCRIPTION,
    'openai/widgetDomain': DEFAULT_WIDGET_DOMAIN,
    'openai/widgetPrefersBorder': true,
  };
}
