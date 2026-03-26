const DEFAULT_WIDGET_DESCRIPTION =
  'Interactive visualizer for chemical elements, atom structures, and phase transitions.';

const DEFAULT_WIDGET_DOMAIN = 'https://chatgpt.com';
const DEFAULT_CONNECT_DOMAINS = Object.freeze([
  'https://chatgpt.com',
  'https://chat.openai.com',
]);
const DEFAULT_RESOURCE_DOMAINS = Object.freeze(['https://*.oaistatic.com']);

function getFirstHeaderValue(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === 'string' ? value : null;
}

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

function getProductionOrigin() {
  return normalizeOrigin(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
      process.env.VERCEL_URL ??
      null
  );
}

export function getRequestOrigin(req) {
  if (!req?.headers) {
    return null;
  }

  const forwardedProto = getFirstHeaderValue(req.headers['x-forwarded-proto']);
  const forwardedHost = getFirstHeaderValue(req.headers['x-forwarded-host']);
  const host = forwardedHost ?? getFirstHeaderValue(req.headers.host);

  if (!host) {
    return null;
  }

  const protocol = (forwardedProto ?? 'https').split(',')[0]?.trim() || 'https';
  const normalizedHost = host.split(',')[0]?.trim();

  return normalizedHost ? normalizeOrigin(`${protocol}://${normalizedHost}`) : null;
}

function resolveWidgetPublicOrigin({ requestOrigin = null } = {}) {
  // Precedence is explicit env override, then the current request origin,
  // then the deploy origin exposed by Vercel. This restores the old
  // request-aware behavior without widening CSP unnecessarily.
  const configuredWidgetPublicOrigin = getConfiguredWidgetPublicOrigin();
  if (configuredWidgetPublicOrigin) {
    return configuredWidgetPublicOrigin;
  }

  return normalizeOrigin(requestOrigin) ?? getProductionOrigin();
}

function getPostHogOrigins({ widgetPublicOrigin = null } = {}) {
  const resolvedWidgetPublicOrigin = widgetPublicOrigin ?? resolveWidgetPublicOrigin();

  return [
    normalizeOrigin(
      process.env.VITE_POSTHOG_HOST ?? process.env.POSTHOG_HOST ?? null,
      resolvedWidgetPublicOrigin
    ),
    normalizeOrigin(
      process.env.VITE_POSTHOG_UI_HOST ?? process.env.POSTHOG_UI_HOST ?? null,
      resolvedWidgetPublicOrigin
    ),
  ].filter((value) => typeof value === 'string' && value.length > 0);
}

export function getWidgetConnectDomains({ requestOrigin = null } = {}) {
  const widgetPublicOrigin = resolveWidgetPublicOrigin({ requestOrigin });

  return unique([
    ...DEFAULT_CONNECT_DOMAINS,
    widgetPublicOrigin,
    ...getPostHogOrigins({ widgetPublicOrigin }),
    ...parseOriginList(
      process.env.WIDGET_CONNECT_DOMAINS ?? process.env.ELEMENT_VIEWER_CONNECT_DOMAINS ?? '',
      widgetPublicOrigin
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

export function createWidgetMeta({ requestOrigin = null } = {}) {
  return {
    'openai/widgetCSP': {
      connect_domains: getWidgetConnectDomains({ requestOrigin }),
      resource_domains: getWidgetResourceDomains(),
    },
    'openai/widgetDescription': DEFAULT_WIDGET_DESCRIPTION,
    'openai/widgetDomain': DEFAULT_WIDGET_DOMAIN,
    'openai/widgetPrefersBorder': true,
  };
}
