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
import { findLocalizedElementByLookup, getLocalizedElements } from './data/localizedElements';
import { ChemicalElement, MatterState, PhysicsState } from './types';
import { predictMatterState } from './hooks/physics/phaseCalculations';
import { useElementViewerChat } from './hooks/useElementViewerChat';
import { useAppChatControls } from './hooks/useAppChatControls';
import { useTelemetry } from './hooks/useTelemetry';
import { useI18n } from './i18n';
import {
    ContextMenuData,
    IAReactionSubstance,
    IAStructuredContent,
    clampPositive,
    formatCompact,
    getSupportedEquilibria,
    normalizeElementLookup,
    phaseToPresentPhases,
    phaseToReadable,
    readOpenAiStructuredContent,
    roundTo,
    safeHexColor,
} from './app/appDefinitions';

const TOOLTIP_CLASS = 'tooltip-solid';
const PERIODIC_TABLE_CONTROL_SESSION_KEY = 'element-viewer-periodic-table-control-used';
const readPeriodicTableControlSessionState = (): boolean => {
    if (typeof window === 'undefined') {
        return false;
    }

    try {
        return window.sessionStorage.getItem(PERIODIC_TABLE_CONTROL_SESSION_KEY) === '1';
    } catch {
        return false;
    }
};

function App() {
    const { locale, messages } = useI18n();
    const localizedElements = React.useMemo(() => getLocalizedElements(locale), [locale]);
    const defaultElement = localizedElements[0];
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
    const [hasUsedPeriodicTableControl, setHasUsedPeriodicTableControl] = useState<boolean>(() => readPeriodicTableControlSessionState());

    // Refs
    const simulationRegistry = useRef<Map<number, () => PhysicsState>>(new Map());
    const lastProcessedAiTimestampRef = useRef(0);
    const reactionAtomicNumberRef = useRef(900000);
    const reactionProductsCacheRef = useRef<ChemicalElement[]>([]);
    const localeRef = useRef(locale);
    const syncStateToChatGPTRef = useRef<() => Promise<void>>(async () => { });
    const { logEvent } = useTelemetry();

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
            const shouldFallbackToPredicted =
                !currentState ||
                (currentState.simTime === 0 && currentState.temperature === 0 && temperature > 0);

            const predicted = predictMatterState(el, temperature, pressure);
            const effectiveState = shouldFallbackToPredicted ? predicted.state : currentState.state;
            const effectiveTempK = shouldFallbackToPredicted ? temperature : currentState.temperature;
            const meltingPointCurrent = shouldFallbackToPredicted ? predicted.T_melt : currentState.meltingPointCurrent;
            const boilingPointCurrent = shouldFallbackToPredicted ? predicted.T_boil : currentState.boilingPointCurrent;
            const sublimationPointCurrent = shouldFallbackToPredicted ? predicted.T_sub : currentState.sublimationPointCurrent;

            const meltProgress = shouldFallbackToPredicted
                ? (effectiveState === MatterState.EQUILIBRIUM_MELT ? 0.5 : 0)
                : currentState.meltProgress;
            const boilProgress = shouldFallbackToPredicted
                ? (effectiveState === MatterState.EQUILIBRIUM_BOIL ? 0.5 : 0)
                : currentState.boilProgress;
            const sublimationProgress = shouldFallbackToPredicted
                ? (effectiveState === MatterState.EQUILIBRIUM_SUB ? 0.5 : 0)
                : currentState.sublimationProgress;
            const scfTransitionProgress = shouldFallbackToPredicted ? 0 : currentState.scfTransitionProgress;

            const deltaToTargetK = temperature - effectiveTempK;
            const absDelta = Math.abs(deltaToTargetK);
            const powerInput = shouldFallbackToPredicted ? 0 : currentState.powerInput;

            let tendenciaTermica = messages.app.widgetState.thermalTrendStable;
            if (absDelta > 0.2) {
                tendenciaTermica = deltaToTargetK > 0
                    ? messages.app.widgetState.thermalTrendHeatingTowardTarget
                    : messages.app.widgetState.thermalTrendCoolingTowardTarget;
            } else if (Math.abs(powerInput) > 0.05) {
                tendenciaTermica = powerInput > 0
                    ? messages.app.widgetState.thermalTrendHeatingLightly
                    : messages.app.widgetState.thermalTrendCoolingLightly;
            }

            const hasTriplePoint = !!el.properties.triplePoint;
            const hasCriticalPoint = !!el.properties.criticalPoint;
            const isAtTriplePointNow =
                effectiveState === MatterState.EQUILIBRIUM_TRIPLE ||
                (!!el.properties.triplePoint &&
                    Math.abs(effectiveTempK - el.properties.triplePoint.tempK) < 1 &&
                    Math.max(pressure, el.properties.triplePoint.pressurePa) /
                    Math.min(Math.max(1e-9, pressure), el.properties.triplePoint.pressurePa) < 1.1);
            const isAtSupercriticalNow =
                effectiveState === MatterState.SUPERCRITICAL || effectiveState === MatterState.TRANSITION_SCF;

            return {
                numero_atomico: el.atomicNumber,
                nome: el.name,
                simbolo: el.symbol,
                estado_da_materia_codigo: effectiveState,
                estado_da_materia: phaseToReadable(messages, effectiveState),
                fases_presentes: phaseToPresentPhases(messages, effectiveState),
                tendencia_termica: tendenciaTermica,
                temperatura_efetiva_atual_K: roundTo(effectiveTempK, 2),
                delta_para_temperatura_alvo_K: roundTo(deltaToTargetK, 2),
                progresso: {
                    fusao: roundTo(Math.min(1, Math.max(0, meltProgress)), 3),
                    ebulicao: roundTo(Math.min(1, Math.max(0, boilProgress)), 3),
                    sublimacao: roundTo(Math.min(1, Math.max(0, sublimationProgress)), 3),
                    transicao_supercritica: roundTo(Math.min(1, Math.max(0, scfTransitionProgress)), 3)
                },
                limites_fase_K: {
                    fusao: roundTo(meltingPointCurrent, 2),
                    ebulicao: roundTo(boilingPointCurrent, 2),
                    sublimacao: sublimationPointCurrent > 0 ? roundTo(sublimationPointCurrent, 2) : null
                },
                pontos_termodinamicos: {
                    tem_ponto_triplo: hasTriplePoint,
                    tem_ponto_critico: hasCriticalPoint,
                    esta_no_ponto_triplo_agora: isAtTriplePointNow,
                    esta_em_regime_supercritico_agora: isAtSupercriticalNow
                },
                estados_de_equilibrio_suportados_no_modelo: getSupportedEquilibria(messages, el)
            };
        });

        await window.openai.setWidgetState({
            ambiente: {
                temperatura_alvo_K: roundTo(temperature, 2),
                pressao_Pa: roundTo(pressure, 6),
                total_elementos_visiveis: selectedElements.length
            },
            elementos_selecionados_em_ordem: selectedElements.map((el) => el.symbol),
            elementos_visiveis: elementsData
        });
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

    const getSelectedAtomicNumbers = (elements: ChemicalElement[] = selectedElements) => {
        return elements.map((element) => element.atomicNumber);
    };

    const getSimulationContext = () => ({
        selectedAtomicNumbers: getSelectedAtomicNumbers(),
        selectedSymbols: selectedElements.map((element) => element.symbol),
        temperatureK: roundTo(temperature, 2),
        pressurePa: roundTo(pressure, 6),
    });

    const markPeriodicTableControlUsed = () => {
        if (hasUsedPeriodicTableControl) {
            return;
        }

        setHasUsedPeriodicTableControl(true);
        if (typeof window === 'undefined') {
            return;
        }

        try {
            window.sessionStorage.setItem(PERIODIC_TABLE_CONTROL_SESSION_KEY, '1');
        } catch {
            // Ignore storage failures inside sandboxed environments.
        }
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

    const buildReactionElement = (reaction: IAReactionSubstance): ChemicalElement => {
        const atomicNumber = reactionAtomicNumberRef.current++;
        const color = safeHexColor(reaction.suggestedColorHex);

        return {
            atomicNumber,
            symbol: reaction.formula,
            name: reaction.substanceName,
            summary: 'Model-estimated reaction product.',
            mass: clampPositive(reaction.mass, 18),
            category: 'reaction_product',
            classification: {
                group: 'N/A',
                groupBlock: 'N/A',
                period: 0,
                electronShells: 0,
            },
            visualDNA: {
                solid: { color, opacidade: 1 },
                liquid: { color, opacidade: 0.8 },
                gas: { color, opacidade: 0.4 },
            },
            properties: {
                meltingPointK: clampPositive(reaction.meltingPointK, 273.15),
                boilingPointK: clampPositive(reaction.boilingPointK, 373.15),
                specificHeatSolid: clampPositive(reaction.specificHeatSolid, 1000),
                specificHeatLiquid: clampPositive(reaction.specificHeatLiquid, 1000),
                specificHeatGas: clampPositive(reaction.specificHeatGas, 1000),
                latentHeatFusion: clampPositive(reaction.latentHeatFusion, 100000),
                latentHeatVaporization: clampPositive(reaction.latentHeatVaporization, 1000000),
                enthalpyVapJmol: clampPositive(reaction.enthalpyVapJmol, 40000),
                enthalpyFusionJmol: clampPositive(reaction.enthalpyFusionJmol, 6000),
                triplePoint: {
                    tempK: clampPositive(reaction.triplePoint.tempK, 200),
                    pressurePa: clampPositive(reaction.triplePoint.pressurePa, 100),
                },
                criticalPoint: {
                    tempK: clampPositive(reaction.criticalPoint.tempK, 500),
                    pressurePa: clampPositive(reaction.criticalPoint.pressurePa, 100000),
                },
                meltingPointDisplay: formatCompact(clampPositive(reaction.meltingPointK, 273.15), 'K'),
                boilingPointDisplay: formatCompact(clampPositive(reaction.boilingPointK, 373.15), 'K'),
                specificHeatSolidDisplay: `${roundTo(clampPositive(reaction.specificHeatSolid, 1000), 2)}`,
                specificHeatLiquidDisplay: `${roundTo(clampPositive(reaction.specificHeatLiquid, 1000), 2)}`,
                specificHeatGasDisplay: `${roundTo(clampPositive(reaction.specificHeatGas, 1000), 2)}`,
                latentHeatFusionDisplay: `${roundTo(clampPositive(reaction.latentHeatFusion, 100000) / 1000, 2)}`,
                latentHeatVaporizationDisplay: `${roundTo(clampPositive(reaction.latentHeatVaporization, 1000000) / 1000, 2)}`,
                triplePointTempDisplay: `${roundTo(clampPositive(reaction.triplePoint.tempK, 200), 2)}`,
                triplePointPressDisplay: `${roundTo(clampPositive(reaction.triplePoint.pressurePa, 100) / 1000, 4)}`,
                criticalPointTempDisplay: `${roundTo(clampPositive(reaction.criticalPoint.tempK, 500), 2)}`,
                criticalPointPressDisplay: `${roundTo(clampPositive(reaction.criticalPoint.pressurePa, 100000) / 1000, 2)}`,
            },
        };
    };

    const buildReactionCacheKey = (formula: string, name: string): string => {
        return `${normalizeElementLookup(formula)}::${normalizeElementLookup(name)}`;
    };

    const getReactionElementKey = (element: ChemicalElement): string => {
        return buildReactionCacheKey(element.symbol, element.name);
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

    const handleSliderRelease = () => {
        scheduleSyncStateToChatGPT();
    };

    // --- RADAR REATIVO DO CHATGPT (ATUALIZACAO EM TEMPO REAL) ---
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const verificarAtualizacoesIA = () => {
            const rawContent = readOpenAiStructuredContent();
            if (!rawContent || typeof rawContent !== 'object') return;

            const content = rawContent as IAStructuredContent;
            const { configuracao_ia, timestamp_atualizacao } = content;

            if (
                !configuracao_ia ||
                typeof timestamp_atualizacao !== 'number' ||
                timestamp_atualizacao <= lastProcessedAiTimestampRef.current
            ) {
                return;
            }

            lastProcessedAiTimestampRef.current = timestamp_atualizacao;

            if (typeof configuracao_ia.temperatura_K === 'number') {
                setTemperature(Math.min(configuracao_ia.temperatura_K, 6000));
            }

            if (typeof configuracao_ia.pressao_Pa === 'number') {
                setPressure(Math.min(configuracao_ia.pressao_Pa, 100000000000));
            }

            if (Array.isArray(configuracao_ia.elementos) && configuracao_ia.elementos.length > 0) {
                const novosElementos = configuracao_ia.elementos
                    .map((simboloIA) => {
                        const lookup = normalizeElementLookup(simboloIA);
                        return findLocalizedElementByLookup(lookup, localeRef.current);
                    })
                    .filter((el): el is ChemicalElement => Boolean(el));

                if (novosElementos.length > 0) {
                    setSelectedElements(novosElementos.slice(0, 6));
                }
            }

            if (content.substancia_reacao) {
                const reactionKey = buildReactionCacheKey(
                    content.substancia_reacao.formula,
                    content.substancia_reacao.substanceName
                );
                const cachedReaction = reactionProductsCacheRef.current.find(
                    (candidate) => getReactionElementKey(candidate) === reactionKey
                );
                const targetReaction = cachedReaction ?? buildReactionElement(content.substancia_reacao);

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
        let didChangeSelection = false;
        let nextSelection = selectedElements;
        const exists = selectedElements.some((item) => item.atomicNumber === el.atomicNumber);

        if (!isMultiSelect) {
            if (allowSingleDeselect && exists && selectedElements.length === 1) {
                nextSelection = defaultElement ? [defaultElement] : selectedElements;
                didChangeSelection = true;
            } else if (!exists || selectedElements.length > 1) {
                // Single Mode: Replace
                nextSelection = [el];
                didChangeSelection = true;
            }
        } else {
            // Multi Mode: Toggle / FIFO
            if (exists) {
                // Remove if exists
                const filtered = selectedElements.filter(e => e.atomicNumber !== el.atomicNumber);
                // If removing the last one, don't allow empty array (fallback to default or keep one)
                if (filtered.length === 0) return;
                nextSelection = filtered;
                didChangeSelection = true;
            } else {
                // Add new
                nextSelection = [...selectedElements, el];
                if (nextSelection.length > 6) {
                    // FIFO: Remove first, add new to end
                    nextSelection = nextSelection.slice(1);
                }
                didChangeSelection = true;
            }
        }

        if (didChangeSelection) {
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
            setSelectedElements([selectedElements[selectedElements.length - 1]]);
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
                selectedAtomicNumbers: getSelectedAtomicNumbers(),
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
                selectedAtomicNumbers: getSelectedAtomicNumbers(),
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
    const desktopBottomMarginPx =
        typeof computedDesktopMarginBottom === 'number'
            ? computedDesktopMarginBottom
            : (isDesktopApp && isFullscreen && typeof window !== 'undefined'
                ? Math.round(window.innerHeight * desktopBottomInset)
                : 0);
    const periodicBottomDockOffset = isDesktopApp ? 0 : (16 + insets.bottom);
    const iconScale = isDesktopApp ? 1.2 : 1.15;
    const controlIconSizePx = `${(16 * iconScale).toFixed(2)}px`;
    const controlIconStyle = { width: controlIconSizePx, height: controlIconSizePx };
    const desktopUniformButtonClass = isDesktopApp ? 'h-6 w-6 min-h-6 min-w-6' : undefined;
    const desktopLabelButtonClass = isDesktopApp ? 'h-6 min-h-6 px-2 text-[10px]' : undefined;
    const leftControlTop = Math.max(0, (16 + insets.top) - (!isDesktopApp && isFullscreen ? 56 : 0));
    const shouldCompactPeriodicTableButton = count >= 5 || hasUsedPeriodicTableControl;

    return (
        <div
            className={`relative w-screen overflow-hidden bg-surface text-default ${isFullscreen ? 'h-screen' : 'h-[600px]'}`}
            style={{
                maxHeight: isFullscreen ? computedFullscreenHeight : undefined,
                height: isFullscreen ? computedFullscreenHeight : undefined,
                marginBottom: computedDesktopMarginBottom,
            }}
        >

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
                className="fixed z-40 flex flex-col gap-3"
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

        </div>
    );
}

export default App;
