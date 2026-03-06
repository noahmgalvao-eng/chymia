import './main.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { PostHogProvider } from '@posthog/react';
import posthog from 'posthog-js';
import App from './App';
import { I18nProvider } from './i18n';

const posthogEnv = import.meta.env as Record<string, string | boolean | undefined>;
const posthogKey = typeof posthogEnv.VITE_POSTHOG_KEY === 'string' ? posthogEnv.VITE_POSTHOG_KEY : '';
const posthogHost = typeof posthogEnv.VITE_POSTHOG_HOST === 'string' ? posthogEnv.VITE_POSTHOG_HOST : '';
const posthogUiHost = typeof posthogEnv.VITE_POSTHOG_UI_HOST === 'string' ? posthogEnv.VITE_POSTHOG_UI_HOST : '';

if (posthogKey && posthogHost) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    ui_host: posthogUiHost || undefined,
    defaults: '2026-01-30',
    person_profiles: 'identified_only',
    session_recording: {
      maskAllInputs: false,
    },
    loaded: (client) => {
      if (import.meta.env.DEV) {
        client.debug();
      }
    },
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <PostHogProvider client={posthog}>
    <I18nProvider>
      <App />
    </I18nProvider>
  </PostHogProvider>
);
