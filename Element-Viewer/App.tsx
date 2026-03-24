import React, { useState, useEffect, useRef } from 'react';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import {
    ChatTripleDots,
    Collapse,
    Expand,
    LightbulbGlow,
    Pause,
    Play,
    Record,
    SettingsSlider,
    Speed,
    Stop,
} from '@openai/apps-sdk-ui/components/Icon';
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip';
import { applyDocumentTheme } from '@openai/apps-sdk-ui/theme';
import PeriodicTableSelector from './components/Simulator/PeriodicTableSelector';
import SimulationUnit from './components/Simulator/SimulationUnit';
import ElementPropertiesMenu from './components/Simulator/ElementPropertiesMenu';
import RecordingStatsModal from './components/Simulator/RecordingStatsModal';
import {
    buildReactionCacheKey,
    createReactionElement,
    getReactionElementKey,
} from './app/reactionProducts';
import {
    collapseSelectionForSingleMode,
    computeNextSelection,
} from './app/selection';
import { parseStructuredContentUpdate } from './app/structuredContent';
import {
    buildSimulationTelemetryContext,
    getSelectedAtomicNumbers,
} from './app/telemetry';
import {
    buildElementWidgetStateEntry,
    buildWidgetStatePayload,
    resolveWidgetPhysicsSnapshot,
} from './app/widgetState';
import { findLocalizedElementByLookup, getLocalizedElements } from './data/localizedElements';
import { readStructuredContentFromOpenAi } from './infrastructure/browser/openai';
import {
    readSessionBoolean,
    writeSessionBoolean,
} from './infrastructure/browser/sessionStorage';
import { ChemicalElement, PhysicsState } from './types';
import { useElementViewerChat } from './hooks/useElementViewerChat';
import { useAppChatControls } from './hooks/useAppChatControls';
import { useTelemetry } from './hooks/useTelemetry';
import { useI18n } from './i18n';
import {
    ContextMenuData,
} from './app/appDefinitions';
import chymiaLogo from './website/chemlablogo.png';
import qrCodeImage from './website/qr-code.png';
import termsOfServiceText from './website/terms of service.txt?raw';
import privacyPolicyText from './website/privacy policy.txt?raw';

const TOOLTIP_CLASS = 'tooltip-solid';
const PERIODIC_TABLE_CONTROL_SESSION_KEY = 'element-viewer-periodic-table-control-used';
const STANDALONE_HOME_ROUTE = '/' as const;
const STANDALONE_ABOUT_SUPPORT_ROUTE = '/about/support' as const;
const STANDALONE_ABOUT_TERMS_ROUTE = '/about/terms' as const;
const STANDALONE_ABOUT_PRIVACY_ROUTE = '/about/privacy' as const;
const STANDALONE_DONATION_URL = 'https://www.paypal.com/qrcodes/p2pqrc/23989VXBV9L3W';
const STANDALONE_GITHUB_URL = 'https://github.com/noahmgalvao-eng/chymia';

type StandaloneRoute =
    | typeof STANDALONE_HOME_ROUTE
    | typeof STANDALONE_ABOUT_SUPPORT_ROUTE
    | typeof STANDALONE_ABOUT_TERMS_ROUTE
    | typeof STANDALONE_ABOUT_PRIVACY_ROUTE;

type PolicySection = {
    heading: string;
    blocks: string[];
};

type PolicyDocument = {
    title: string;
    preface: string[];
    sections: PolicySection[];
};

const STANDALONE_NAV_ITEMS: { route: StandaloneRoute; label: string }[] = [
    { route: STANDALONE_ABOUT_SUPPORT_ROUTE, label: 'Support this project' },
    { route: STANDALONE_ABOUT_TERMS_ROUTE, label: 'Terms of Service' },
    { route: STANDALONE_ABOUT_PRIVACY_ROUTE, label: 'Privacy Policy' },
];

const STANDALONE_ROUTE_TITLES: Record<StandaloneRoute, string> = {
    [STANDALONE_HOME_ROUTE]: 'Chymia',
    [STANDALONE_ABOUT_SUPPORT_ROUTE]: 'Chymia | Support this project',
    [STANDALONE_ABOUT_TERMS_ROUTE]: 'Chymia | Terms of Service',
    [STANDALONE_ABOUT_PRIVACY_ROUTE]: 'Chymia | Privacy Policy',
};

function normalizeStandaloneRoute(pathname: string): StandaloneRoute {
    const normalizedPath = pathname.replace(/\/+$/u, '') || STANDALONE_HOME_ROUTE;

    switch (normalizedPath) {
        case STANDALONE_HOME_ROUTE:
            return STANDALONE_HOME_ROUTE;
        case '/about':
        case STANDALONE_ABOUT_SUPPORT_ROUTE:
            return STANDALONE_ABOUT_SUPPORT_ROUTE;
        case STANDALONE_ABOUT_TERMS_ROUTE:
            return STANDALONE_ABOUT_TERMS_ROUTE;
        case STANDALONE_ABOUT_PRIVACY_ROUTE:
            return STANDALONE_ABOUT_PRIVACY_ROUTE;
        default:
            return STANDALONE_HOME_ROUTE;
    }
}

function getStandaloneRouteFromLocation(): StandaloneRoute {
    if (typeof window === 'undefined') {
        return STANDALONE_HOME_ROUTE;
    }

    return normalizeStandaloneRoute(window.location.pathname);
}

function openStandaloneExternal(href: string) {
    if (typeof window === 'undefined') {
        return;
    }

    window.open(href, '_blank', 'noopener,noreferrer');
}

function parsePolicyDocument(rawText: string): PolicyDocument {
    const lines = rawText.replace(/\r/g, '').split('\n');
    const titleIndex = lines.findIndex((line) => line.trim().length > 0);

    if (titleIndex === -1) {
        return {
            title: '',
            preface: [],
            sections: [],
        };
    }

    const title = lines[titleIndex].trim();
    const preface: string[] = [];
    const sections: PolicySection[] = [];
    let currentHeading: string | null = null;
    let currentBlocks: string[] = [];
    let currentParagraph: string[] = [];

    const pushParagraph = () => {
        const paragraph = currentParagraph.join(' ').replace(/\s+/gu, ' ').trim();
        if (!paragraph) {
            currentParagraph = [];
            return;
        }

        if (currentHeading) {
            currentBlocks.push(paragraph);
        } else {
            preface.push(paragraph);
        }

        currentParagraph = [];
    };

    const pushSection = () => {
        pushParagraph();

        if (!currentHeading) {
            return;
        }

        sections.push({
            heading: currentHeading,
            blocks: currentBlocks,
        });

        currentHeading = null;
        currentBlocks = [];
    };

    for (const rawLine of lines.slice(titleIndex + 1)) {
        const line = rawLine.trim();

        if (!line) {
            pushParagraph();
            continue;
        }

        const headingMatch = line.match(/^\d+\.\s+(.+)$/u);
        if (headingMatch) {
            pushSection();
            currentHeading = headingMatch[1].trim();
            continue;
        }

        currentParagraph.push(line);
    }

    pushSection();

    return {
        title,
        preface,
        sections,
    };
}

function renderPolicyInlineText(
    text: string,
    onNavigate: (route: StandaloneRoute) => void
) {
    const privacyLinkPlaceholder = '[Link to Privacy Policy]';

    if (!text.includes(privacyLinkPlaceholder)) {
        return text;
    }

    const parts = text.split(privacyLinkPlaceholder);

    return parts.map((part, index) => (
        <React.Fragment key={`${part}-${index}`}>
            {part}
            {index < parts.length - 1 && (
                <button
                    type="button"
                    className="inline font-semibold text-[color:var(--color-text-info)] underline decoration-2 underline-offset-4 transition-opacity hover:opacity-80"
                    onClick={() => onNavigate(STANDALONE_ABOUT_PRIVACY_ROUTE)}
                >
                    Privacy Policy
                </button>
            )}
        </React.Fragment>
    ));
}

function PolicyDocumentView({
    document,
    onNavigate,
}: {
    document: PolicyDocument;
    onNavigate: (route: StandaloneRoute) => void;
}) {
    return (
        <article className="standalone-panel standalone-document-panel mx-auto max-w-5xl p-6 sm:p-8 lg:p-10">
            <div className="mx-auto max-w-[72ch] space-y-8">
                <header className="space-y-3">
                    <p className="standalone-kicker">Legal</p>
                    <h2 className="text-3xl font-semibold tracking-tight text-default sm:text-4xl">
                        {document.title}
                    </h2>
                    {document.preface.map((paragraph) => (
                        <p key={paragraph} className="text-sm leading-7 text-secondary sm:text-base">
                            {renderPolicyInlineText(paragraph, onNavigate)}
                        </p>
                    ))}
                </header>

                <div className="space-y-5">
                    {document.sections.map((section) => {
                        const listLeadIndex = section.blocks.findIndex(
                            (block, index) => block.endsWith(':') && index < section.blocks.length - 1
                        );
                        const paragraphs = listLeadIndex >= 0
                            ? section.blocks.slice(0, listLeadIndex + 1)
                            : section.blocks;
                        const listItems = listLeadIndex >= 0
                            ? section.blocks.slice(listLeadIndex + 1)
                            : [];

                        return (
                            <section key={section.heading} className="standalone-document-section space-y-4 rounded-[1.5rem] p-5 sm:p-6">
                                <h3 className="text-xl font-semibold tracking-tight text-default sm:text-2xl">
                                    {section.heading}
                                </h3>
                                <div className="space-y-3 text-sm leading-7 text-secondary sm:text-base">
                                    {paragraphs.map((paragraph) => (
                                        <p key={paragraph}>
                                            {renderPolicyInlineText(paragraph, onNavigate)}
                                        </p>
                                    ))}
                                    {listItems.length > 0 && (
                                        <ul className="space-y-3 pl-5 text-secondary">
                                            {listItems.map((item) => (
                                                <li key={item} className="list-disc">
                                                    {renderPolicyInlineText(item, onNavigate)}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>
            </div>
        </article>
    );
}

function StandaloneSupportPanel() {
    return (
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
            <section className="standalone-panel p-6 sm:p-8">
                <div className="space-y-5">
                    <div className="space-y-3">
                        <p className="standalone-kicker">Support this project</p>
                        <h2 className="text-3xl font-semibold tracking-tight text-default sm:text-4xl">
                            Help Chymia keep growing
                        </h2>
                        <p className="max-w-2xl text-sm leading-7 text-secondary sm:text-base">
                            Chymia is built as a visual chemistry experience for curiosity, learning,
                            and experimentation. Your support helps keep the project active, improve
                            the simulator, and keep the educational experience evolving.
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <button
                            type="button"
                            className="standalone-action-button standalone-action-button-primary"
                            onClick={() => openStandaloneExternal(STANDALONE_DONATION_URL)}
                        >
                            Support with PayPal
                        </button>
                        <button
                            type="button"
                            className="standalone-action-button"
                            onClick={() => openStandaloneExternal(STANDALONE_GITHUB_URL)}
                        >
                            Visit GitHub
                        </button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="standalone-support-note rounded-[1.25rem] p-4">
                            <p className="text-sm font-semibold text-default">Direct support</p>
                            <p className="mt-2 text-sm leading-6 text-secondary">
                                Use the PayPal link or scan the QR code to contribute directly to the
                                project.
                            </p>
                        </div>
                        <div className="standalone-support-note rounded-[1.25rem] p-4">
                            <p className="text-sm font-semibold text-default">Open development</p>
                            <p className="mt-2 text-sm leading-6 text-secondary">
                                Follow updates, explore the codebase, and track progress in the Chymia
                                GitHub repository.
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
                            alt="QR code for supporting Chymia"
                            className="h-auto w-full rounded-[1rem] object-contain"
                        />
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-secondary">
                            Quick support
                        </p>
                        <p className="text-sm leading-7 text-secondary sm:text-base">
                            Scan the QR code with your phone or open the donation page directly.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}

function StandaloneAboutPage({
    currentRoute,
    onNavigate,
    termsDocument,
    privacyDocument,
}: {
    currentRoute: StandaloneRoute;
    onNavigate: (route: StandaloneRoute) => void;
    termsDocument: PolicyDocument;
    privacyDocument: PolicyDocument;
}) {
    const isSupportRoute = currentRoute === STANDALONE_ABOUT_SUPPORT_ROUTE;
    const heading = isSupportRoute
        ? 'About Chymia'
        : currentRoute === STANDALONE_ABOUT_TERMS_ROUTE
            ? 'Terms of Service'
            : 'Privacy Policy';
    const description = isSupportRoute
        ? 'Support the project, explore the repository, and find the legal information that powers the standalone Chymia experience.'
        : currentRoute === STANDALONE_ABOUT_TERMS_ROUTE
            ? 'Read the service terms presented in a layout tuned for the standalone webapp.'
            : 'Review how Chymia handles telemetry and privacy in a clear, readable format.';

    return (
        <div className="space-y-6 pb-6">
            <section className="standalone-hero mx-auto max-w-6xl rounded-[2rem] px-6 py-7 sm:px-8 sm:py-9">
                <div className="space-y-3">
                    <p className="standalone-kicker">About us</p>
                    <h1 className="text-3xl font-semibold tracking-tight text-default sm:text-5xl">
                        {heading}
                    </h1>
                    <p className="max-w-3xl text-sm leading-7 text-secondary sm:text-base">
                        {description}
                    </p>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                    {STANDALONE_NAV_ITEMS.map((item) => {
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

            {isSupportRoute && <StandaloneSupportPanel />}
            {currentRoute === STANDALONE_ABOUT_TERMS_ROUTE && (
                <PolicyDocumentView document={termsDocument} onNavigate={onNavigate} />
            )}
            {currentRoute === STANDALONE_ABOUT_PRIVACY_ROUTE && (
                <PolicyDocumentView document={privacyDocument} onNavigate={onNavigate} />
            )}
        </div>
    );
}

function App() {
    const { locale, messages } = useI18n();
    const localizedElements = React.useMemo(() => getLocalizedElements(locale), [locale]);
    const defaultElement = localizedElements[0];
    const isStandaloneWebapp = typeof window !== 'undefined' && !window.openai;
    const [standaloneRoute, setStandaloneRoute] = useState<StandaloneRoute>(getStandaloneRouteFromLocation);
    // State for Selection (Array for Multi-Element)
    const [selectedElements, setSelectedElements] = useState<ChemicalElement[]>(() => defaultElement ? [defaultElement] : []);
    const [reactionProductsCache, setReactionProductsCache] = useState<ChemicalElement[]>([]);
    const [isMultiSelect, setIsMultiSelect] = useState(false);

    // Default Physics State (STP) - Shared Global Environment
    const [temperature, setTemperature] = useState<number>(298.15);
    const [pressure, setPressure] = useState<number>(101325);

    // UI States
    const [showParticles, setShowParticles] = useState(false);
    const [isSidebarOpen, setSidebarOpen] = useState(true);
    const [timeScale, setTimeScale] = useState<number>(1);
    const [isPaused, setIsPaused] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null);
    const [hasUsedPeriodicTableControl, setHasUsedPeriodicTableControl] = useState<boolean>(() =>
        readSessionBoolean(PERIODIC_TABLE_CONTROL_SESSION_KEY)
    );

    // Refs
    const simulationRegistry = useRef<Map<number, () => PhysicsState>>(new Map());
    const lastProcessedAiTimestampRef = useRef(0);
    const reactionAtomicNumberRef = useRef(900000);
    const reactionProductsCacheRef = useRef<ChemicalElement[]>([]);
    const localeRef = useRef(locale);
    const syncStateToChatGPTRef = useRef<() => Promise<void>>(async () => { });
    const standaloneScrollContainerRef = useRef<HTMLDivElement | null>(null);
    const { logEvent } = useTelemetry();
    const termsDocument = React.useMemo(() => parsePolicyDocument(termsOfServiceText), []);
    const privacyDocument = React.useMemo(() => parsePolicyDocument(privacyPolicyText), []);

    // ChatGPT Integration Hook
    const {
        theme,
        userAgent,
        maxHeight,
        safeArea,
        isFullscreen,
        requestDisplayMode,
        handleInfoClick
    } = useElementViewerChat({
        globalTemperature: temperature,
        globalPressure: pressure,
        selectedElements
    });

    // Safe area insets with robust fallback
    const insets = {
        top: safeArea?.insets?.top ?? 0,
        bottom: safeArea?.insets?.bottom ?? 0,
        left: safeArea?.insets?.left ?? 0,
        right: safeArea?.insets?.right ?? 0
    };

    useEffect(() => {
        const resolveSystemTheme = () =>
            window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

        const resolvedTheme = theme === 'light' || theme === 'dark' ? theme : resolveSystemTheme();
        applyDocumentTheme(resolvedTheme);

        if (theme === 'light' || theme === 'dark') return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const listener = () => applyDocumentTheme(resolveSystemTheme());

        mediaQuery.addEventListener('change', listener);
        return () => mediaQuery.removeEventListener('change', listener);
    }, [theme]);

    useEffect(() => {
        if (!isStandaloneWebapp || typeof window === 'undefined') {
            return;
        }

        const syncRouteWithLocation = (replace = false) => {
            const nextRoute = getStandaloneRouteFromLocation();
            setStandaloneRoute((previous) => previous === nextRoute ? previous : nextRoute);

            if (window.location.pathname === nextRoute) {
                return;
            }

            window.history[replace ? 'replaceState' : 'pushState'](window.history.state, '', nextRoute);
        };

        syncRouteWithLocation(true);

        const handlePopState = () => {
            syncRouteWithLocation(true);
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [isStandaloneWebapp]);

    useEffect(() => {
        if (!isStandaloneWebapp || typeof document === 'undefined') {
            return;
        }

        document.title = STANDALONE_ROUTE_TITLES[standaloneRoute];
    }, [isStandaloneWebapp, standaloneRoute]);

    useEffect(() => {
        if (!isStandaloneWebapp || standaloneRoute === STANDALONE_HOME_ROUTE) {
            return;
        }

        standaloneScrollContainerRef.current?.scrollTo({
            top: 0,
            behavior: 'smooth',
        });
    }, [isStandaloneWebapp, standaloneRoute]);

    useEffect(() => {
        reactionProductsCacheRef.current = reactionProductsCache;
    }, [reactionProductsCache]);

    useEffect(() => {
        localeRef.current = locale;
    }, [locale]);

    useEffect(() => {
        const localizeNaturalElement = (element: ChemicalElement): ChemicalElement => {
            if (element.category === 'reaction_product') {
                return element;
            }

            return localizedElements.find(
                (candidate) =>
                    candidate.atomicNumber === element.atomicNumber ||
                    candidate.symbol === element.symbol
            ) ?? element;
        };

        setSelectedElements((previous) => {
            const next = previous.map(localizeNaturalElement);
            return next.every((element, index) => element === previous[index]) ? previous : next;
        });

        setContextMenu((previous) => {
            if (!previous) return previous;

            const nextElement = localizeNaturalElement(previous.element);
            return nextElement === previous.element
                ? previous
                : { ...previous, element: nextElement };
        });

        setRecordingResults((previous) => {
            if (!previous) return previous;

            let didChange = false;
            const next = previous.map((entry) => {
                const nextElement = localizeNaturalElement(entry.element);
                if (nextElement === entry.element) {
                    return entry;
                }

                didChange = true;
                return { ...entry, element: nextElement };
            });

            return didChange ? next : previous;
        });
    }, [localizedElements]);

    // Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [recordingStartData, setRecordingStartData] = useState<Map<number, PhysicsState>>(new Map());
    const [recordingResults, setRecordingResults] = useState<{ element: ChemicalElement, start: PhysicsState, end: PhysicsState }[] | null>(null);
    // --- CHATGPT STATE SYNC ---
    // Called at app boot, when Info is pressed and when the user sends a new prompt.
    const syncStateToChatGPT = async () => {
        if (typeof window === 'undefined' || !window.openai?.setWidgetState) return;

        const elementsData = selectedElements.map((el) => {
            const getter = simulationRegistry.current.get(el.atomicNumber);
            const currentState = getter ? getter() : null;
            const snapshot = resolveWidgetPhysicsSnapshot({
                currentState,
                element: el,
                pressure,
                targetTemperature: temperature,
            });

            return buildElementWidgetStateEntry({
                element: el,
                messages,
                pressure,
                snapshot,
                targetTemperature: temperature,
            });
        });

        await window.openai.setWidgetState(
            buildWidgetStatePayload(
                selectedElements,
                elementsData,
                temperature,
                pressure
            )
        );
    };
    syncStateToChatGPTRef.current = syncStateToChatGPT;


    const {
        handleToggleFullscreen,
        handleInfoButtonClick,
    } = useAppChatControls({
        requestDisplayMode,
        isFullscreen,
        syncStateToChatGPT,
        handleInfoClick,
    });

    const getSimulationContext = () =>
        buildSimulationTelemetryContext(selectedElements, temperature, pressure);

    const markPeriodicTableControlUsed = () => {
        if (hasUsedPeriodicTableControl) {
            return;
        }

        setHasUsedPeriodicTableControl(true);
        writeSessionBoolean(PERIODIC_TABLE_CONTROL_SESSION_KEY, true);
    };

    const handlePeriodicTableButtonClick = () => {
        markPeriodicTableControlUsed();
        setSidebarOpen((open) => !open);
    };

    const handleSetShowParticles = (nextValue: boolean) => {
        setShowParticles(nextValue);
        logEvent('XRAY_TOGGLE', {
            enabled: nextValue,
        });
    };

    const handleToggleFullscreenWithTelemetry = async (e: React.MouseEvent) => {
        logEvent('FULLSCREEN_TOGGLE', {
            targetMode: isFullscreen ? 'inline' : 'fullscreen',
            ...getSimulationContext(),
        });
        await handleToggleFullscreen(e);
    };

    const handleInfoButtonClickWithTelemetry = async (e: React.MouseEvent) => {
        logEvent('AI_INFO_CLICK', getSimulationContext());
        await handleInfoButtonClick(e);
    };

    const handlePromptHelpClick = () => {
        logEvent('AI_PROMPT_HELP_CLICK', getSimulationContext());
    };

    const navigateStandalone = (route: StandaloneRoute) => {
        if (!isStandaloneWebapp || typeof window === 'undefined') {
            return;
        }

        const nextRoute = normalizeStandaloneRoute(route);
        const currentRoute = getStandaloneRouteFromLocation();

        if (currentRoute === nextRoute && window.location.pathname === nextRoute) {
            setStandaloneRoute(nextRoute);
            return;
        }

        window.history.pushState(window.history.state, '', nextRoute);
        setStandaloneRoute(nextRoute);
    };

    useEffect(() => {
        let cancelled = false;
        let raf1 = 0;
        let raf2 = 0;

        raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(async () => {
                if (cancelled) return;
                await syncStateToChatGPT();
            });
        });

        return () => {
            cancelled = true;
            cancelAnimationFrame(raf1);
            cancelAnimationFrame(raf2);
        };
    }, []);

    const scheduleSyncStateToChatGPT = () => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                void syncStateToChatGPTRef.current();
            });
        });
    };

    // --- RADAR REATIVO DO CHATGPT (ATUALIZACAO EM TEMPO REAL) ---
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const verificarAtualizacoesIA = () => {
            const update = parseStructuredContentUpdate(
                readStructuredContentFromOpenAi(),
                lastProcessedAiTimestampRef.current
            );
            if (!update) {
                return;
            }

            lastProcessedAiTimestampRef.current = update.timestamp;

            if (update.temperatureK !== null) {
                setTemperature(update.temperatureK);
            }

            if (update.pressurePa !== null) {
                setPressure(update.pressurePa);
            }

            if (update.elementLookups.length > 0) {
                const novosElementos = update.elementLookups
                    .map((lookup) =>
                        findLocalizedElementByLookup(lookup, localeRef.current)
                    )
                    .filter((el): el is ChemicalElement => Boolean(el));

                if (novosElementos.length > 0) {
                    setSelectedElements(novosElementos);
                }
            }

            if (update.reactionSubstance) {
                const reactionKey = buildReactionCacheKey(
                    update.reactionSubstance.formula,
                    update.reactionSubstance.substanceName
                );
                const cachedReaction = reactionProductsCacheRef.current.find(
                    (candidate) => getReactionElementKey(candidate) === reactionKey
                );
                const targetReaction =
                    cachedReaction ??
                    createReactionElement(
                        update.reactionSubstance,
                        reactionAtomicNumberRef.current++
                    );

                if (!cachedReaction) {
                    setReactionProductsCache((previous) => [targetReaction, ...previous]);
                }

                setSelectedElements([targetReaction]);
                setIsMultiSelect(false);
            }
        };

        const intervalId = window.setInterval(verificarAtualizacoesIA, 500);
        verificarAtualizacoesIA();

        return () => {
            window.clearInterval(intervalId);
        };
    }, []);

    // --- SELECTION LOGIC ---
    const handleElementSelectInternal = (
        el: ChemicalElement,
        allowSingleDeselect: boolean,
        source: 'periodic_table' | 'reaction_product'
    ) => {
        if (isRecording) return; // Prevent changing elements while recording
        const { didChange, nextSelection } = computeNextSelection({
            allowSingleDeselect,
            candidate: el,
            fallbackElement: defaultElement,
            isMultiSelect,
            selectedElements,
        });

        if (didChange) {
            setSelectedElements(nextSelection);
            logEvent('ELEMENT_SELECT', {
                atomicNumber: el.atomicNumber,
                symbol: el.symbol,
                source,
                selectionMode: isMultiSelect ? 'compare' : 'single',
                selectedAtomicNumbers: getSelectedAtomicNumbers(nextSelection),
            });
            scheduleSyncStateToChatGPT();
        }

        // Close menu if switching elements
        setContextMenu(null);
    };

    const handleElementSelect = (el: ChemicalElement) => {
        handleElementSelectInternal(el, false, 'periodic_table');
    };

    const handleReactionProductSelect = (el: ChemicalElement) => {
        handleElementSelectInternal(el, true, 'reaction_product');
    };

    const handleToggleMultiSelect = () => {
        if (isRecording) return;
        const newValue = !isMultiSelect;
        setIsMultiSelect(newValue);
        // If turning OFF, revert to just the last selected element
        if (!newValue && selectedElements.length > 1) {
            setSelectedElements(collapseSelectionForSingleMode(selectedElements));
            scheduleSyncStateToChatGPT();
        }
    };
    // 2. FUNÃƒâ€¡ÃƒÆ’O DE TOGGLE
    const handleToggleSpeed = (e: React.MouseEvent) => {
        e.stopPropagation();
        const previousTimeScale = timeScale;
        const nextTimeScale = timeScale === 1
            ? 2
            : timeScale === 2
                ? 4
                : timeScale === 4
                    ? 0.25
                    : timeScale === 0.25
                        ? 0.5
                        : 1;

        setTimeScale(nextTimeScale);
        logEvent('SIMULATION_SPEED_CHANGE', {
            previousTimeScale,
            nextTimeScale,
        });
    };

    const handleTogglePause = (e: React.MouseEvent) => {
        e.stopPropagation();
        const nextPaused = !isPaused;
        setIsPaused(nextPaused);
        logEvent('SIMULATION_PAUSE_TOGGLE', {
            paused: nextPaused,
        });
    };

    // --- RECORDING LOGIC ---
    const registerSimulationUnit = (id: number, getter: () => PhysicsState) => {
        simulationRegistry.current.set(id, getter);
    };

    const handleToggleRecord = (e: React.MouseEvent) => {
        e.stopPropagation();

        if (!isRecording) {
            // START RECORDING
            const startMap = new Map<number, PhysicsState>();
            selectedElements.forEach(el => {
                const getter = simulationRegistry.current.get(el.atomicNumber);
                if (getter) {
                    // Clone state to avoid mutation reference issues
                    startMap.set(el.atomicNumber, { ...getter() });
                }
            });
            setRecordingStartData(startMap);
            setIsRecording(true);
            logEvent('RECORD_START', {
                selectedAtomicNumbers: getSelectedAtomicNumbers(selectedElements),
            });
        } else {
            // STOP RECORDING
            const results: { element: ChemicalElement, start: PhysicsState, end: PhysicsState }[] = [];

            selectedElements.forEach(el => {
                const getter = simulationRegistry.current.get(el.atomicNumber);
                const startState = recordingStartData.get(el.atomicNumber);

                if (getter && startState) {
                    const endState = { ...getter() };
                    results.push({
                        element: el,
                        start: startState,
                        end: endState
                    });
                }
            });

            setRecordingResults(results);
            setIsRecording(false);
            logEvent('RECORD_STOP', {
                selectedAtomicNumbers: getSelectedAtomicNumbers(selectedElements),
                recordedCount: results.length,
            });
        }
    };

    // --- CONTEXT MENU HANDLER ---
    const handleInspect = (element: ChemicalElement) => (event: React.MouseEvent, physics: PhysicsState) => {
        if (isRecording) return; // Disable inspect during recording to avoid clutter
        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            element,
            physicsState: physics
        });
    };

    // --- GRID LAYOUT LOGIC ---
    const count = selectedElements.length;

    // Grid Classes for seamless full-screen tiling
    // Default: Full screen single item
    let gridClass = "grid-cols-1 grid-rows-1";

    if (count === 2) gridClass = "grid-cols-2 grid-rows-1";
    else if (count >= 3 && count <= 4) gridClass = "grid-cols-2 grid-rows-2";
    else if (count >= 5) gridClass = "grid-cols-2 grid-rows-3 md:grid-cols-3 md:grid-rows-2";

    // Fixed quality scale as requested (Always 50 particles)
    const qualityScale = 1.0;
    const isDesktopViewport = typeof window !== 'undefined' ? window.innerWidth >= 1024 : false;
    const isDesktopApp = userAgent?.device?.type === 'desktop' || (!userAgent && isDesktopViewport) || (userAgent?.device?.type === 'unknown' && isDesktopViewport);
    const desktopBottomInset = isDesktopApp && isFullscreen ? 0.22 : 0;
    const computedDesktopMarginBottom =
        isDesktopApp && isFullscreen
            ? (typeof maxHeight === 'number' ? Math.max(0, maxHeight * desktopBottomInset) : '18vh')
            : undefined;
    const computedFullscreenHeight =
        isFullscreen
            ? (typeof maxHeight === 'number'
                ? Math.max(0, maxHeight - (typeof computedDesktopMarginBottom === 'number' ? computedDesktopMarginBottom : 0))
                : (isDesktopApp ? '82vh' : undefined))
            : undefined;
    const periodicBottomDockOffset = isDesktopApp ? 0 : (16 + insets.bottom);
    const iconScale = isDesktopApp ? 1.2 : 1.15;
    const controlIconSizePx = `${(16 * iconScale).toFixed(2)}px`;
    const controlIconStyle = { width: controlIconSizePx, height: controlIconSizePx };
    const desktopUniformButtonClass = isDesktopApp ? 'h-6 w-6 min-h-6 min-w-6' : undefined;
    const desktopLabelButtonClass = isDesktopApp ? 'h-6 min-h-6 px-2 text-[10px]' : undefined;
    const leftControlTop = Math.max(0, (16 + insets.top) - (!isDesktopApp && isFullscreen ? 56 : 0));
    const shouldCompactPeriodicTableButton = count >= 5 || hasUsedPeriodicTableControl;
    const isStandaloneAboutRoute = isStandaloneWebapp && standaloneRoute !== STANDALONE_HOME_ROUTE;
    const leftControlsPositionClass = isStandaloneWebapp ? 'absolute' : 'fixed';

    const simulationViewport = (
        <>
            <PeriodicTableSelector
                selectedElements={selectedElements}
                onSelect={handleElementSelect}
                reactionProducts={reactionProductsCache}
                onSelectReactionProduct={handleReactionProductSelect}
                bottomDockOffset={periodicBottomDockOffset}
                isMultiSelect={isMultiSelect}
                onToggleMultiSelect={handleToggleMultiSelect}
                isOpen={isSidebarOpen}
                onOpenChange={setSidebarOpen}
                temperature={temperature}
                setTemperature={setTemperature}
                pressure={pressure}
                setPressure={setPressure}
                showParticles={showParticles}
                setShowParticles={handleSetShowParticles}
            />

            <div
                className={`${leftControlsPositionClass} z-40 flex flex-col gap-3`}
                style={{ top: `${leftControlTop}px`, left: `${16 + insets.left}px` }}
            >
                <Tooltip content={messages.app.controls.toggleSimulationSpeed} contentClassName={TOOLTIP_CLASS}>
                    <span>
                        <Button color="secondary" variant="soft" pill size="lg" className={desktopLabelButtonClass} onClick={handleToggleSpeed}>
                            <Speed style={controlIconStyle} />
                            <span className="text-xs font-semibold">{timeScale}x</span>
                        </Button>
                    </span>
                </Tooltip>

                <Tooltip content={isPaused ? messages.app.controls.resumeSimulation : messages.app.controls.pauseSimulation} contentClassName={TOOLTIP_CLASS}>
                    <span>
                        <Button
                            color="secondary"
                            variant="soft"
                            pill
                            uniform
                            className={desktopUniformButtonClass}
                            onClick={handleTogglePause}
                        >
                            {isPaused ? <Play style={controlIconStyle} /> : <Pause style={controlIconStyle} />}
                        </Button>
                    </span>
                </Tooltip>

                <Tooltip content={isRecording ? messages.app.controls.stopRecording : messages.app.controls.startRecording} contentClassName={TOOLTIP_CLASS}>
                    <span>
                        <Button
                            color={isRecording ? 'danger' : 'secondary'}
                            variant={isRecording ? 'solid' : 'outline'}
                            pill
                            uniform
                            className={desktopUniformButtonClass}
                            onClick={handleToggleRecord}
                        >
                            {isRecording ? (
                                <Stop style={controlIconStyle} />
                            ) : (
                                <Record
                                    style={{
                                        ...controlIconStyle,
                                        color: 'var(--color-background-danger-solid)',
                                        fill: 'currentColor',
                                    }}
                                />
                            )}
                        </Button>
                    </span>
                </Tooltip>

                <Tooltip content={isSidebarOpen ? messages.app.controls.hidePeriodicTable : messages.app.controls.openPeriodicTable} contentClassName={TOOLTIP_CLASS}>
                    <span>
                        <Button
                            color="secondary"
                            variant="soft"
                            pill
                            uniform={shouldCompactPeriodicTableButton}
                            className={shouldCompactPeriodicTableButton ? desktopUniformButtonClass : desktopLabelButtonClass}
                            onClick={handlePeriodicTableButtonClick}
                        >
                            <SettingsSlider style={controlIconStyle} />
                            {!shouldCompactPeriodicTableButton && <span className="text-xs font-semibold">{messages.app.controls.openPeriodicTableButton}</span>}
                        </Button>
                    </span>
                </Tooltip>
            </div>

            {!isStandaloneWebapp && (
                <div
                    className="fixed z-20 flex flex-col gap-2"
                    style={{ top: `${16 + insets.top}px`, right: `${16 + insets.right}px` }}
                >
                    <Tooltip content={isFullscreen ? messages.app.controls.exitFullscreen : messages.app.controls.enterFullscreen} contentClassName={TOOLTIP_CLASS}>
                        <span>
                            <Button color="secondary" variant="soft" pill uniform className={desktopUniformButtonClass} onClick={handleToggleFullscreenWithTelemetry}>
                                {isFullscreen ? <Collapse style={controlIconStyle} /> : <Expand style={controlIconStyle} />}
                            </Button>
                        </span>
                    </Tooltip>

                    <Tooltip content={messages.app.controls.askChatGPTAboutSimulation} contentClassName={TOOLTIP_CLASS}>
                        <span>
                            <Button color="info" variant="soft" pill uniform className={desktopUniformButtonClass} onClick={handleInfoButtonClickWithTelemetry}>
                                <ChatTripleDots
                                    style={{
                                        ...controlIconStyle,
                                        color: 'var(--color-background-info-solid)',
                                        fill: 'currentColor',
                                    }}
                                />
                            </Button>
                        </span>
                    </Tooltip>

                    <Popover>
                        <Popover.Trigger>
                            <Button
                                color="secondary"
                                variant="soft"
                                pill
                                uniform
                                className={desktopUniformButtonClass}
                                aria-label={messages.app.controls.assistantIdeasAriaLabel}
                                onClick={handlePromptHelpClick}
                            >
                                <LightbulbGlow
                                    style={{
                                        ...controlIconStyle,
                                        color: 'var(--color-background-caution-solid)',
                                        fill: 'currentColor',
                                    }}
                                />
                            </Button>
                        </Popover.Trigger>
                        <Popover.Content
                            side="left"
                            align="start"
                            sideOffset={8}
                            minWidth={300}
                            maxWidth={380}
                            className="z-[130] rounded-2xl border border-default bg-surface shadow-lg"
                        >
                            <div className="space-y-2 p-3 text-sm text-default">
                                <p className="heading-xs text-default">{messages.app.assistantPopover.title}</p>
                                <ol className="list-decimal space-y-2 pl-4">
                                    <li>
                                        {messages.app.assistantPopover.itemOne}
                                        <p className="italic text-secondary text-xs">
                                            {messages.app.assistantPopover.itemOneExample}
                                        </p>
                                    </li>
                                    <li>
                                        {messages.app.assistantPopover.itemTwo}
                                        <p className="italic text-secondary text-xs">
                                            {messages.app.assistantPopover.itemTwoExample}
                                        </p>
                                    </li>
                                    <li>
                                        {messages.app.assistantPopover.itemThree}
                                    </li>
                                    <li>
                                        {messages.app.assistantPopover.itemFour}
                                    </li>
                                </ol>
                                <p className="border-t border-subtle pt-2 text-xs italic text-secondary">
                                    {messages.app.assistantPopover.footer}
                                </p>
                            </div>
                        </Popover.Content>
                    </Popover>
                </div>
            )}

            <main className={`h-full w-full grid gap-px bg-border-subtle ${gridClass}`}>
                {selectedElements.map((el) => (
                    <div key={el.atomicNumber} className="relative h-full w-full bg-surface-secondary">
                        <SimulationUnit
                            element={el}
                            globalTemp={temperature}
                            globalPressure={pressure}
                            layoutScale={{ quality: qualityScale, visual: 1.0 }}
                            showParticles={showParticles}
                            totalElements={count}
                            timeScale={timeScale}
                            isPaused={isPaused}
                            onInspect={handleInspect(el)}
                            onRegister={registerSimulationUnit}
                        />
                    </div>
                ))}
            </main>

            {contextMenu && (
                <ElementPropertiesMenu
                    data={contextMenu}
                    onClose={() => setContextMenu(null)}
                    onSetTemperature={(nextTemperature) => {
                        setTemperature(nextTemperature);
                        setContextMenu(null);
                    }}
                    onSetPressure={setPressure}
                />
            )}

            {recordingResults && (
                <RecordingStatsModal recordings={recordingResults} onClose={() => setRecordingResults(null)} />
            )}
        </>
    );

    if (isStandaloneWebapp) {
        return (
            <div className="standalone-shell flex min-h-screen flex-col text-default">
                <header className="standalone-header sticky top-0 z-[90]">
                    <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                        <button
                            type="button"
                            className="standalone-brand group flex items-center gap-3 rounded-[1.5rem] px-1.5 py-1 text-left"
                            onClick={() => navigateStandalone(STANDALONE_HOME_ROUTE)}
                        >
                            <span className="standalone-brand-mark flex h-12 w-12 items-center justify-center overflow-hidden rounded-[1.15rem] p-1.5 sm:h-14 sm:w-14">
                                <img
                                    src={chymiaLogo}
                                    alt="Chymia logo"
                                    className="h-full w-full object-contain"
                                />
                            </span>
                            <span className="flex flex-col">
                                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-secondary">
                                    Matter simulator
                                </span>
                                <span className="text-lg font-semibold tracking-tight text-default sm:text-xl">
                                    Chymia
                                </span>
                            </span>
                        </button>

                        <button
                            type="button"
                            className={`standalone-header-link ${isStandaloneAboutRoute ? 'standalone-header-link-active' : ''}`}
                            onClick={() => navigateStandalone(STANDALONE_ABOUT_SUPPORT_ROUTE)}
                        >
                            About us
                        </button>
                    </div>
                </header>

                {isStandaloneAboutRoute ? (
                    <div
                        ref={standaloneScrollContainerRef}
                        className="flex-1 overflow-y-auto px-4 pb-6 pt-4 sm:px-6 lg:px-8"
                    >
                        <StandaloneAboutPage
                            currentRoute={standaloneRoute}
                            onNavigate={navigateStandalone}
                            termsDocument={termsDocument}
                            privacyDocument={privacyDocument}
                        />
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 px-4 pb-4 pt-3 sm:px-6 lg:px-8">
                        <div className="standalone-panel relative h-full min-h-[34rem] overflow-hidden rounded-[2rem]">
                            {simulationViewport}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            className={`relative w-screen overflow-hidden bg-surface text-default ${isFullscreen ? 'h-screen' : 'h-[600px]'}`}
            style={{
                maxHeight: isFullscreen ? computedFullscreenHeight : undefined,
                height: isFullscreen ? computedFullscreenHeight : undefined,
                marginBottom: computedDesktopMarginBottom,
            }}
        >
            {simulationViewport}
        </div>
    );
}

export default App;
