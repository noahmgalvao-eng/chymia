import { startTransition, useEffect, useRef, useState, type MouseEvent } from 'react';
import type { ContextMenuData } from '../app/appDefinitions';
import {
  collapseSelectionForSingleMode,
  computeNextSelection,
} from '../app/selection';
import { getSelectedAtomicNumbers } from '../app/telemetry';
import {
  readSessionBoolean,
  writeSessionBoolean,
} from '../infrastructure/browser/sessionStorage';
import type { Messages, SupportedLocale } from '../i18n/types';
import type { ChemicalElement, PhysicsState } from '../types';
import type { TelemetryData, TelemetryEventName } from './useTelemetry';
import { useWidgetStateSync } from './useWidgetStateSync';

const PERIODIC_TABLE_CONTROL_SESSION_KEY = 'element-viewer-periodic-table-control-used';

export type RecordingResult = {
  element: ChemicalElement;
  start: PhysicsState;
  end: PhysicsState;
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
  const [selectedElements, setSelectedElements] = useState<ChemicalElement[]>(() =>
    defaultElement ? [defaultElement] : [],
  );
  const [reactionProductsCache, setReactionProductsCache] = useState<ChemicalElement[]>([]);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [temperature, setTemperature] = useState<number>(298.15);
  const [pressure, setPressure] = useState<number>(101325);
  const [showParticles, setShowParticles] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [timeScale, setTimeScale] = useState<number>(1);
  const [isPaused, setIsPaused] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null);
  const [hasUsedPeriodicTableControl, setHasUsedPeriodicTableControl] = useState<boolean>(() =>
    readSessionBoolean(PERIODIC_TABLE_CONTROL_SESSION_KEY),
  );
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartData, setRecordingStartData] = useState<Map<number, PhysicsState>>(new Map());
  const [recordingResults, setRecordingResults] = useState<RecordingResult[] | null>(null);

  const simulationRegistry = useRef<Map<number, () => PhysicsState>>(new Map());

  const { syncStateToChatGPT, scheduleSyncStateToChatGPT } = useWidgetStateSync({
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

    const { didChange, nextSelection } = computeNextSelection({
      allowSingleDeselect,
      candidate: element,
      fallbackElement: defaultElement,
      isMultiSelect,
      selectedElements,
    });

    if (didChange) {
      startTransition(() => {
        setSelectedElements(nextSelection);
        setContextMenu(null);
      });
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

    if (!newValue && selectedElements.length > 1) {
      setSelectedElements(collapseSelectionForSingleMode(selectedElements));
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
    scheduleSyncStateToChatGPT();
  };

  const handlePressureCommit = () => {
    scheduleSyncStateToChatGPT();
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
