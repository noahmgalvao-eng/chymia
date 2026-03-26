import './main.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { PostHogProvider } from '@posthog/react';
import App from './App';
import { PostHogBootstrap } from './infrastructure/PostHogBootstrap';
import { HostEnvironmentProvider } from './infrastructure/browser/hostEnvironment';
import { posthog } from './infrastructure/posthog';
import { I18nProvider } from './i18n';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <HostEnvironmentProvider>
    <PostHogProvider client={posthog}>
      <PostHogBootstrap
        env={import.meta.env as Record<string, string | boolean | undefined>}
        isDevelopment={import.meta.env.DEV}
      />
      <I18nProvider>
        <App />
      </I18nProvider>
    </PostHogProvider>
  </HostEnvironmentProvider>
);
