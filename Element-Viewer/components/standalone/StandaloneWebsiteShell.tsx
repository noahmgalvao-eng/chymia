import React, { useMemo, useRef } from 'react';
import {
  STANDALONE_ABOUT_CONTACT_ROUTE,
  STANDALONE_ABOUT_PRIVACY_ROUTE,
  STANDALONE_ABOUT_SUPPORT_ROUTE,
  STANDALONE_ABOUT_TERMS_ROUTE,
  STANDALONE_CONTACT_EMAIL,
  STANDALONE_CONTACT_MAILTO,
  STANDALONE_DONATION_URL,
  STANDALONE_GITHUB_URL,
  STANDALONE_HOME_ROUTE,
  STANDALONE_LANGUAGE_ORDER,
  isStandaloneAboutRoute,
  openStandaloneExternal,
  type StandaloneRoute,
} from '../../app/standalone';
import { useStandaloneRouting } from '../../hooks/useStandaloneRouting';
import type { Messages, SupportedLocale } from '../../i18n/types';
import chymiaLogo from '../../website/chemlablogo.png';
import qrCodeImage from '../../website/qr-code.png';
import privacyPolicyText from '../../website/privacy policy.txt?raw';
import termsOfServiceText from '../../website/terms of service.txt?raw';
import {
  parsePolicyDocument,
  PolicyDocumentView,
} from './PolicyDocumentView';

function StandaloneSupportPanel({
  websiteMessages,
}: {
  websiteMessages: Messages['website'];
}) {
  const aboutMessages = websiteMessages.about;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
      <section className="standalone-panel p-6 sm:p-8">
        <div className="space-y-5">
          <div className="space-y-3">
            <p className="standalone-kicker">{aboutMessages.supportNav}</p>
            <h2 className="standalone-page-title text-3xl font-semibold tracking-tight sm:text-4xl">
              {aboutMessages.supportTitle}
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-secondary sm:text-base">
              {aboutMessages.supportDescription}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="standalone-action-button standalone-action-button-primary"
              onClick={() => openStandaloneExternal(STANDALONE_DONATION_URL)}
            >
              {aboutMessages.paypalButton}
            </button>
            <button
              type="button"
              className="standalone-action-button"
              onClick={() => openStandaloneExternal(STANDALONE_GITHUB_URL)}
            >
              {aboutMessages.githubButton}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="standalone-support-note rounded-[1.25rem] p-4">
              <p className="text-sm font-semibold text-default">{aboutMessages.supportDirectTitle}</p>
              <p className="mt-2 text-sm leading-6 text-secondary">
                {aboutMessages.supportDirectDescription}
              </p>
            </div>
            <div className="standalone-support-note rounded-[1.25rem] p-4">
              <p className="text-sm font-semibold text-default">{aboutMessages.supportOpenTitle}</p>
              <p className="mt-2 text-sm leading-6 text-secondary">
                {aboutMessages.supportOpenDescription}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="standalone-panel p-6 sm:p-8">
        <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
          <div className="standalone-qr-frame w-full max-w-xs">
            <img
              src={qrCodeImage}
              alt={websiteMessages.qrAlt}
              className="h-auto w-full rounded-[1rem] object-contain"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-secondary">
              {aboutMessages.supportQrLabel}
            </p>
            <p className="text-sm leading-7 text-secondary sm:text-base">
              {aboutMessages.supportQrDescription}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function StandaloneContactPanel({
  websiteMessages,
}: {
  websiteMessages: Messages['website'];
}) {
  const aboutMessages = websiteMessages.about;

  return (
    <section className="standalone-panel mx-auto max-w-6xl p-6 sm:p-8">
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="standalone-kicker">{aboutMessages.contactNav}</p>
          <h2 className="standalone-page-title text-3xl font-semibold tracking-tight sm:text-4xl">
            {aboutMessages.contactTitle}
          </h2>
          <p className="max-w-3xl text-sm leading-7 text-secondary sm:text-base">
            {aboutMessages.contactDescription}
          </p>
        </div>

        <div className="standalone-support-note rounded-[1.5rem] p-5 sm:p-6">
          <p className="text-sm font-semibold text-default">{aboutMessages.contactEmailLabel}</p>
          <a
            href={STANDALONE_CONTACT_MAILTO}
            className="mt-3 inline-flex text-base font-semibold text-[color:var(--color-text-info)] underline decoration-2 underline-offset-4 transition-opacity hover:opacity-80 sm:text-lg"
          >
            {STANDALONE_CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </section>
  );
}

function StandaloneAboutPage({
  currentRoute,
  onNavigate,
  websiteMessages,
}: {
  currentRoute: StandaloneRoute;
  onNavigate: (route: StandaloneRoute) => void;
  websiteMessages: Messages['website'];
}) {
  const aboutMessages = websiteMessages.about;
  const termsDocument = useMemo(() => parsePolicyDocument(termsOfServiceText), []);
  const privacyDocument = useMemo(() => parsePolicyDocument(privacyPolicyText), []);
  const standaloneNavItems: { route: StandaloneRoute; label: string }[] = [
    { route: STANDALONE_ABOUT_SUPPORT_ROUTE, label: aboutMessages.supportNav },
    { route: STANDALONE_ABOUT_TERMS_ROUTE, label: aboutMessages.termsNav },
    { route: STANDALONE_ABOUT_PRIVACY_ROUTE, label: aboutMessages.privacyNav },
    { route: STANDALONE_ABOUT_CONTACT_ROUTE, label: aboutMessages.contactNav },
  ];

  let heading = aboutMessages.supportHeading;
  let description = aboutMessages.supportPageDescription;

  if (currentRoute === STANDALONE_ABOUT_TERMS_ROUTE) {
    heading = aboutMessages.termsHeading;
    description = aboutMessages.termsPageDescription;
  } else if (currentRoute === STANDALONE_ABOUT_PRIVACY_ROUTE) {
    heading = aboutMessages.privacyHeading;
    description = aboutMessages.privacyPageDescription;
  } else if (currentRoute === STANDALONE_ABOUT_CONTACT_ROUTE) {
    heading = aboutMessages.contactHeading;
    description = aboutMessages.contactPageDescription;
  }

  return (
    <div className="space-y-6 pb-6">
      <section className="standalone-hero mx-auto max-w-6xl rounded-[2rem] px-6 py-7 sm:px-8 sm:py-9">
        <div className="space-y-3">
          <p className="standalone-kicker">{aboutMessages.kicker}</p>
          <h1 className="standalone-page-title text-3xl font-semibold tracking-tight sm:text-5xl">
            {heading}
          </h1>
          <p className="max-w-3xl text-sm leading-7 text-secondary sm:text-base">
            {description}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {standaloneNavItems.map((item) => {
            const isActive = item.route === currentRoute;
            return (
              <button
                key={item.route}
                type="button"
                className={`standalone-tab-button ${isActive ? 'standalone-tab-button-active' : ''}`}
                onClick={() => onNavigate(item.route)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      {currentRoute === STANDALONE_ABOUT_SUPPORT_ROUTE && (
        <StandaloneSupportPanel websiteMessages={websiteMessages} />
      )}
      {currentRoute === STANDALONE_ABOUT_TERMS_ROUTE && (
        <PolicyDocumentView
          document={termsDocument}
          kicker={aboutMessages.legalKicker}
          title={aboutMessages.termsHeading}
          onNavigate={onNavigate}
          privacyLabel={aboutMessages.privacyNav}
        />
      )}
      {currentRoute === STANDALONE_ABOUT_PRIVACY_ROUTE && (
        <PolicyDocumentView
          document={privacyDocument}
          kicker={aboutMessages.legalKicker}
          title={aboutMessages.privacyHeading}
          onNavigate={onNavigate}
          privacyLabel={aboutMessages.privacyNav}
        />
      )}
      {currentRoute === STANDALONE_ABOUT_CONTACT_ROUTE && (
        <StandaloneContactPanel websiteMessages={websiteMessages} />
      )}
    </div>
  );
}

export default function StandaloneWebsiteShell({
  availableLocales,
  locale,
  onLocaleChange,
  simulationViewport,
  websiteMessages,
}: {
  availableLocales: SupportedLocale[];
  locale: SupportedLocale;
  onLocaleChange: (locale: SupportedLocale) => void;
  simulationViewport: React.ReactNode;
  websiteMessages: Messages['website'];
}) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const routeTitles: Record<StandaloneRoute, string> = useMemo(() => ({
    [STANDALONE_HOME_ROUTE]: websiteMessages.metaTitles.home,
    [STANDALONE_ABOUT_SUPPORT_ROUTE]: websiteMessages.metaTitles.support,
    [STANDALONE_ABOUT_TERMS_ROUTE]: websiteMessages.metaTitles.terms,
    [STANDALONE_ABOUT_PRIVACY_ROUTE]: websiteMessages.metaTitles.privacy,
    [STANDALONE_ABOUT_CONTACT_ROUTE]: websiteMessages.metaTitles.contact,
  }), [websiteMessages.metaTitles]);
  const { standaloneRoute, navigateStandalone } = useStandaloneRouting({
    routeTitles,
    scrollContainerRef,
  });
  const isAboutRoute = isStandaloneAboutRoute(standaloneRoute);
  const standaloneLocaleOptions = STANDALONE_LANGUAGE_ORDER.filter((localeOption) =>
    availableLocales.includes(localeOption),
  );
  const currentYear = new Date().getFullYear();

  return (
    <div className="standalone-shell flex h-[100dvh] min-h-screen flex-col overflow-hidden text-default">
      <header className="standalone-header sticky top-0 z-[90]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <button
            type="button"
            className="standalone-brand group flex items-center gap-3 rounded-[1.5rem] px-1.5 py-1 text-left"
            onClick={() => navigateStandalone(STANDALONE_HOME_ROUTE)}
          >
            <span className="standalone-brand-mark flex h-14 w-14 items-center justify-center overflow-hidden rounded-[1.15rem] sm:h-16 sm:w-16">
              <img
                src={chymiaLogo}
                alt={websiteMessages.logoAlt}
                className="standalone-brand-image h-full w-full object-contain"
              />
            </span>
            <span className="flex flex-col">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-secondary">
                {websiteMessages.brandTagline}
              </span>
              <span className="text-lg font-semibold tracking-tight text-default sm:text-xl">
                Chymia
              </span>
            </span>
          </button>

          <button
            type="button"
            className={`standalone-header-link ${isAboutRoute ? 'standalone-header-link-active' : ''}`}
            onClick={() => navigateStandalone(STANDALONE_ABOUT_SUPPORT_ROUTE)}
          >
            {websiteMessages.aboutButton}
          </button>
        </div>
      </header>

      {isAboutRoute ? (
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-4 sm:px-6 lg:px-8"
        >
          <StandaloneAboutPage
            currentRoute={standaloneRoute}
            onNavigate={navigateStandalone}
            websiteMessages={websiteMessages}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden px-3 pb-2 pt-2 sm:px-4 sm:pb-3 sm:pt-3 lg:px-6">
          <div className="standalone-panel relative h-full min-h-0 overflow-hidden rounded-[2rem]">
            {simulationViewport}
          </div>
        </div>
      )}

      <footer className="standalone-footer">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="standalone-footer-meta">
            <span>{websiteMessages.footer.rightsReserved(currentYear)}</span>
            <span className="standalone-footer-separator" aria-hidden="true">|</span>
            <button
              type="button"
              className="standalone-footer-link"
              onClick={() => navigateStandalone(STANDALONE_ABOUT_TERMS_ROUTE)}
            >
              {websiteMessages.footer.terms}
            </button>
            <span className="standalone-footer-separator" aria-hidden="true">|</span>
            <button
              type="button"
              className="standalone-footer-link"
              onClick={() => navigateStandalone(STANDALONE_ABOUT_PRIVACY_ROUTE)}
            >
              {websiteMessages.footer.privacy}
            </button>
            <span className="standalone-footer-separator" aria-hidden="true">|</span>
            <button
              type="button"
              className="standalone-footer-link"
              onClick={() => navigateStandalone(STANDALONE_ABOUT_CONTACT_ROUTE)}
            >
              {websiteMessages.footer.contact}
            </button>
          </div>

          <label className="standalone-footer-language">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="standalone-footer-language-icon"
            >
              <path
                d="M12 3a9 9 0 1 0 9 9 9.01 9.01 0 0 0-9-9Zm6.89 8h-3.2a14.98 14.98 0 0 0-1.2-5.06A7.02 7.02 0 0 1 18.89 11ZM12 5.08A13.04 13.04 0 0 1 13.66 11h-3.32A13.04 13.04 0 0 1 12 5.08ZM9.51 5.94A14.98 14.98 0 0 0 8.31 11h-3.2a7.02 7.02 0 0 1 4.4-5.06ZM5.11 13h3.2a14.98 14.98 0 0 0 1.2 5.06A7.02 7.02 0 0 1 5.11 13ZM12 18.92A13.04 13.04 0 0 1 10.34 13h3.32A13.04 13.04 0 0 1 12 18.92Zm2.49-.86A14.98 14.98 0 0 0 15.69 13h3.2a7.02 7.02 0 0 1-4.4 5.06Z"
                fill="currentColor"
              />
            </svg>
            <select
              aria-label={websiteMessages.footer.language}
              className="standalone-language-select"
              value={locale}
              onChange={(event) => onLocaleChange(event.target.value as SupportedLocale)}
            >
              {standaloneLocaleOptions.map((localeOption) => (
                <option key={localeOption} value={localeOption}>
                  {websiteMessages.languageNames[localeOption]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </footer>
    </div>
  );
}
