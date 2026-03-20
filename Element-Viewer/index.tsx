import './main.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { PostHogProvider } from '@posthog/react';
import App from './App';
import { initializePostHog, posthog } from './infrastructure/posthog';
import { I18nProvider } from './i18n';

initializePostHog(
  import.meta.env as Record<string, string | boolean | undefined>,
  import.meta.env.DEV
);

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
