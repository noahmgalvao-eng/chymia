import posthog from 'posthog-js';

export type PublicEnv = Record<string, string | boolean | undefined>;

export interface PostHogConfig {
  apiHost: string;
  key: string;
  uiHost?: string;
}

let isPostHogInitialized = false;

function readPublicEnvString(
  env: PublicEnv,
  key: 'VITE_POSTHOG_KEY' | 'VITE_POSTHOG_HOST' | 'VITE_POSTHOG_UI_HOST'
): string {
  const value = env[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function readPostHogConfig(env: PublicEnv): PostHogConfig | null {
  const key = readPublicEnvString(env, 'VITE_POSTHOG_KEY');
  const apiHost = readPublicEnvString(env, 'VITE_POSTHOG_HOST');
  const uiHost = readPublicEnvString(env, 'VITE_POSTHOG_UI_HOST');

  if (!key || !apiHost) {
    return null;
  }

  return {
    apiHost,
    key,
    uiHost: uiHost || undefined,
  };
}

export function initializePostHog(env: PublicEnv, isDevelopment: boolean): boolean {
  if (isPostHogInitialized) {
    return true;
  }

  const config = readPostHogConfig(env);
  if (!config) {
    return false;
  }

  try {
    posthog.init(config.key, {
      api_host: config.apiHost,
      ui_host: config.uiHost,
      defaults: '2026-01-30',
      person_profiles: 'identified_only',
      session_recording: {
        maskAllInputs: true,
      },
      loaded: (client) => {
        if (isDevelopment) {
          client.debug();
        }
      },
    });
    isPostHogInitialized = true;
    return true;
  } catch {
    return false;
  }
}

export function hasInitializedPostHog(): boolean {
  return isPostHogInitialized;
}

export { posthog };
