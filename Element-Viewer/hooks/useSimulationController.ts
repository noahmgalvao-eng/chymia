import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { ContextMenuData } from '../app/appDefinitions';
import {
  collapseSelectionForSingleMode,
  computeNextSelection,
} from '../app/selection';
import { getSelectedAtomicNumbers } from '../app/telemetry';
import {
  readLocalJson,
  writeLocalJson,
} from '../infrastructure/browser/localStorage';
import {
  readSessionBoolean,
  writeSessionBoolean,
} from '../infrastructure/browser/sessionStorage';
import type { Messages, SupportedLocale } from '../i18n/types';
import type { ChemicalElement, PhysicsState } from '../types';
import type { TelemetryData, TelemetryEventName } from './useTelemetry';
import { useWidgetStateSync } from './useWidgetStateSync';

const PERIODIC_TABLE_CONTROL_SESSION_KEY = 'element-viewer-periodic-table-control-used';
const SIMULATION_STATE_STORAGE_KEY = 'element-viewer-simulation-state-v1';
const DEFAULT_TEMPERATURE_K = 298.15;
const DEFAULT_PRESSURE_PA = 101325;
const DEFAULT_TIME_SCALE = 1;
const VALID_TIME_SCALES = new Set([0.25, 0.5, 1, 2, 4]);

export type RecordingResult = {
  element: ChemicalElement;
  start: PhysicsState;
  end: PhysicsState;
};

type PersistedSimulationState = {
  isMultiSelect?: unknown;
  isPaused?: unknown;
  isSidebarOpen?: unknown;
  pressure?: unknown;
  reactionProductsCache?: unknown;
  selectedElements?: unknown;
  showParticles?: unknown;
  temperature?: unknown;
  timeScale?: unknown;
};

type RestoredSimulationState = {
  isMultiSelect: boolean;
  isPaused: boolean;
  isSidebarOpen: boolean;
  pressure: number;
  reactionProductsCache: ChemicalElement[];
  selectedElements: ChemicalElement[];
  showParticles: boolean;
  temperature: number;
  timeScale: number;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isChemicalElementLike = (value: unknown): value is ChemicalElement => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ChemicalElement>;
  return (
    typeof candidate.atomicNumber === 'number' &&
    typeof candidate.symbol === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.category === 'string'
  );
};

const sanitizeReactionProducts = (value: unknown): ChemicalElement[] =>
  Array.isArray(value) ? value.filter(isChemicalElementLike).slice(0, 12) : [];

const resolvePersistedElement = (
  element: ChemicalElement,
  localizedElements: ChemicalElement[],
  reactionProductsCache: ChemicalElement[],
): ChemicalElement | null => {
  if (element.category === 'reaction_product') {
    return reactionProductsCache.find(
      (reaction) =>
        reaction.atomicNumber === element.atomicNumber ||
        reaction.symbol === element.symbol,
    ) ?? element;
  }

  return localizedElements.find(
    (candidate) =>
      candidate.atomicNumber === element.atomicNumber ||
      candidate.symbol === element.symbol,
  ) ?? null;
};

const resolvePersistedState = (
  defaultElement: ChemicalElement | undefined,
  localizedElements: ChemicalElement[],
): RestoredSimulationState | null => {
  const persisted = readLocalJson<PersistedSimulationState>(SIMULATION_STATE_STORAGE_KEY);
  if (!persisted) return null;

  const reactionProductsCache = sanitizeReactionProducts(persisted.reactionProductsCache);
  const selectedElements = Array.isArray(persisted.selectedElements)
    ? persisted.selectedElements
        .filter(isChemicalElementLike)
        .map((element) => resolvePersistedElement(element, localizedElements, reactionProductsCache))
        .filter((element): element is ChemicalElement => Boolean(element))
        .slice(0, 6)
    : [];

  return {
    isMultiSelect: typeof persisted.isMultiSelect === 'boolean' ? persisted.isMultiSelect : false,
    isPaused: typeof persisted.isPaused === 'boolean' ? persisted.isPaused : false,
    isSidebarOpen: typeof persisted.isSidebarOpen === 'boolean' ? persisted.isSidebarOpen : true,
    pressure: isFiniteNumber(persisted.pressure) ? Math.max(0, persisted.pressure) : DEFAULT_PRESSURE_PA,
    reactionProductsCache,
    selectedElements: selectedElements.length > 0 ? selectedElements : (defaultElement ? [defaultElement] : []),
    showParticles: typeof persisted.showParticles === 'boolean' ? persisted.showParticles : false,
    temperature: isFiniteNumber(persisted.temperature) ? Math.max(0, persisted.temperature) : DEFAULT_TEMPERATURE_K,
    timeScale: isFiniteNumber(persisted.timeScale) && VALID_TIME_SCALES.has(persisted.timeScale)
      ? persisted.timeScale
      : DEFAULT_TIME_SCALE,
  };
};

export function useSimulationController({
  defaultElement,
  localizedElements,
  locale,
  messages,
  logEvent,
}: {
  defaultElement: ChemicalElement | undefined;
  localizedElements: ChemicalElement[];
  locale: SupportedLocale;
  messages: Messages;
  logEvent: (event: TelemetryEventName, data?: TelemetryData) => void;
}) {
  const restoredStateRef = useRef<RestoredSimulationState | null | undefined>(undefined);
  if (restoredStateRef.current === undefined) {
    restoredStateRef.current = resolvePersistedState(defaultElement, localizedElements);
  }
  const restoredState = restoredStateRef.current;

  const [selectedElements, setSelectedElements] = useState<ChemicalElement[]>(() =>
    restoredState?.selectedElements ?? (defaultElement ? [defaultElement] : []),
  );
  const [reactionProductsCache, setReactionProductsCache] = useState<ChemicalElement[]>(
    () => restoredState?.reactionProductsCache ?? [],
  );
  const [isMultiSelect, setIsMultiSelect] = useState(() => restoredState?.isMultiSelect ?? false);
  const [temperature, setTemperature] = useState<number>(() => restoredState?.temperature ?? DEFAULT_TEMPERATURE_K);
  const [pressure, setPressure] = useState<number>(() => restoredState?.pressure ?? DEFAULT_PRESSURE_PA);
  const [showParticles, setShowParticles] = useState(() => restoredState?.showParticles ?? false);
  const [isSidebarOpen, setSidebarOpen] = useState(() => restoredState?.isSidebarOpen ?? true);
  const [timeScale, setTimeScale] = useState<number>(() => restoredState?.timeScale ?? DEFAULT_TIME_SCALE);
  const [isPaused, setIsPaused] = useState(() => restoredState?.isPaused ?? false);
  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null);
  const [hasUsedPeriodicTableControl, setHasUsedPeriodicTableControl] = useState<boolean>(() =>
    readSessionBoolean(PERIODIC_TABLE_CONTROL_SESSION_KEY),
  );
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartData, setRecordingStartData] = useState<Map<number, PhysicsState>>(new Map());
  const [recordingResults, setRecordingResults] = useState<RecordingResult[] | null>(null);

  const simulationRegistry = useRef<Map<number, () => PhysicsState>>(new Map());
  const selectedElementsRef = useRef<ChemicalElement[]>(selectedElements);
  const persistStateTimeoutRef = useRef<number | null>(null);
  const latestSimulationStateRef = useRef<RestoredSimulationState | null>(null);

  const {
    syncStateToChatGPT,
    scheduleSyncStateToChatGPT,
  } = useWidgetStateSync({
    locale,
    messages,
    selectedElements,
    temperature,
    pressure,
    reactionProductsCache,
    setTemperature,
    setPressure,
    setSelectedElements,
    setReactionProductsCache,
    setIsMultiSelect,
    simulationRegistry,
  });

  useEffect(() => {
    selectedElementsRef.current = selectedElements;
  }, [selectedElements]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    latestSimulationStateRef.current = {
      isMultiSelect,
      isPaused,
      isSidebarOpen,
      pressure,
      reactionProductsCache,
      selectedElements,
      showParticles,
      temperature,
      timeScale,
    };

    if (persistStateTimeoutRef.current !== null) {
      window.clearTimeout(persistStateTimeoutRef.current);
    }

    persistStateTimeoutRef.current = window.setTimeout(() => {
      persistStateTimeoutRef.current = null;
      writeLocalJson(SIMULATION_STATE_STORAGE_KEY, latestSimulationStateRef.current);
    }, 120);

    return () => {
      if (persistStateTimeoutRef.current !== null) {
        window.clearTimeout(persistStateTimeoutRef.current);
        persistStateTimeoutRef.current = null;
      }
    };
  }, [
    isMultiSelect,
    isPaused,
    isSidebarOpen,
    pressure,
    reactionProductsCache,
    selectedElements,
    showParticles,
    temperature,
    timeScale,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const persistLatestState = () => {
      if (latestSimulationStateRef.current) {
        writeLocalJson(SIMULATION_STATE_STORAGE_KEY, latestSimulationStateRef.current);
      }
    };
    const persistWhenHidden = () => {
      if (document.visibilityState === 'hidden') {
        persistLatestState();
      }
    };

    window.addEventListener('pagehide', persistLatestState);
    document.addEventListener('visibilitychange', persistWhenHidden);

    return () => {
      window.removeEventListener('pagehide', persistLatestState);
      document.removeEventListener('visibilitychange', persistWhenHidden);
      persistLatestState();
    };
  }, []);

  useEffect(() => {
    const localizeNaturalElement = (element: ChemicalElement): ChemicalElement => {
      if (element.category === 'reaction_product') {
        return element;
      }

      return localizedElements.find(
        (candidate) =>
          candidate.atomicNumber === element.atomicNumber ||
          candidate.symbol === element.symbol,
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

  const handleElementSelectInternal = (
    element: ChemicalElement,
    allowSingleDeselect: boolean,
    source: 'periodic_table' | 'reaction_product',
  ) => {
    if (isRecording) return;
    const currentSelection = selectedElementsRef.current;

    const { didChange, nextSelection } = computeNextSelection({
      allowSingleDeselect,
      candidate: element,
      fallbackElement: defaultElement,
      isMultiSelect,
      selectedElements: currentSelection,
    });

    if (didChange) {
      selectedElementsRef.current = nextSelection;
      setSelectedElements(nextSelection);
      setContextMenu(null);
      logEvent('ELEMENT_SELECT', {
        atomicNumber: element.atomicNumber,
        symbol: element.symbol,
        source,
        selectionMode: isMultiSelect ? 'compare' : 'single',
        selectedAtomicNumbers: getSelectedAtomicNumbers(nextSelection),
      });
      scheduleSyncStateToChatGPT();
      return;
    }

    setContextMenu(null);
  };

  const handleElementSelect = (element: ChemicalElement) => {
    handleElementSelectInternal(element, false, 'periodic_table');
  };

  const handleReactionProductSelect = (element: ChemicalElement) => {
    handleElementSelectInternal(element, true, 'reaction_product');
  };

  const handleToggleMultiSelect = () => {
    if (isRecording) return;

    const newValue = !isMultiSelect;
    setIsMultiSelect(newValue);

    if (!newValue && selectedElementsRef.current.length > 1) {
      const collapsedSelection = collapseSelectionForSingleMode(selectedElementsRef.current);
      selectedElementsRef.current = collapsedSelection;
      setSelectedElements(collapsedSelection);
      scheduleSyncStateToChatGPT();
    }
  };

  const handleToggleSpeed = (event: MouseEvent) => {
    event.stopPropagation();
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

  const handleTogglePause = (event: MouseEvent) => {
    event.stopPropagation();
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    logEvent('SIMULATION_PAUSE_TOGGLE', {
      paused: nextPaused,
    });
  };

  const registerSimulationUnit = (id: number, getter: () => PhysicsState) => {
    simulationRegistry.current.set(id, getter);
  };

  const handleToggleRecord = (event: MouseEvent) => {
    event.stopPropagation();

    if (!isRecording) {
      const startMap = new Map<number, PhysicsState>();
      selectedElements.forEach((element) => {
        const getter = simulationRegistry.current.get(element.atomicNumber);
        if (getter) {
          startMap.set(element.atomicNumber, { ...getter() });
        }
      });

      setRecordingStartData(startMap);
      setIsRecording(true);
      logEvent('RECORD_START', {
        selectedAtomicNumbers: getSelectedAtomicNumbers(selectedElements),
      });
      return;
    }

    const results: RecordingResult[] = [];

    selectedElements.forEach((element) => {
      const getter = simulationRegistry.current.get(element.atomicNumber);
      const startState = recordingStartData.get(element.atomicNumber);

      if (getter && startState) {
        const endState = { ...getter() };
        results.push({
          element,
          start: startState,
          end: endState,
        });
      }
    });

    setRecordingResults(results);
    setIsRecording(false);
    logEvent('RECORD_STOP', {
      selectedAtomicNumbers: getSelectedAtomicNumbers(selectedElements),
      recordedCount: results.length,
    });
  };

  const handleInspect = (element: ChemicalElement) => (event: MouseEvent, physics: PhysicsState) => {
    if (isRecording) return;

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      element,
      physicsState: physics,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleContextMenuTemperatureChange = (nextTemperature: number) => {
    setTemperature(nextTemperature);
    setContextMenu(null);
  };

  const handleTemperatureCommit = () => {
    void syncStateToChatGPT();
  };

  const handlePressureCommit = () => {
    void syncStateToChatGPT();
  };

  const handleCloseRecordingResults = () => {
    setRecordingResults(null);
  };

  return {
    selectedElements,
    reactionProductsCache,
    isMultiSelect,
    temperature,
    pressure,
    showParticles,
    isSidebarOpen,
    timeScale,
    isPaused,
    contextMenu,
    hasUsedPeriodicTableControl,
    isRecording,
    recordingResults,
    syncStateToChatGPT,
    setTemperature,
    setPressure,
    setSidebarOpen,
    handlePeriodicTableButtonClick,
    handleSetShowParticles,
    handleElementSelect,
    handleReactionProductSelect,
    handleToggleMultiSelect,
    handleToggleSpeed,
    handleTogglePause,
    registerSimulationUnit,
    handleToggleRecord,
    handleInspect,
    handleCloseContextMenu,
    handleContextMenuTemperatureChange,
    handleCloseRecordingResults,
    handleTemperatureCommit,
    handlePressureCommit,
  };
}
