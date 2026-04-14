import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import {
  buildReactionCacheKey,
  createReactionElement,
  getReactionElementKey,
} from '../app/reactionProducts';
import { parseStructuredContentUpdate } from '../app/structuredContent';
import {
  buildElementWidgetStateEntry,
  buildWidgetStatePayload,
  resolveWidgetPhysicsSnapshot,
} from '../app/widgetState';
import { findLocalizedElementByLookup } from '../data/localizedElements';
import { readStructuredContentFromOpenAi } from '../infrastructure/browser/openai';
import type { Messages, SupportedLocale } from '../i18n/types';
import type { ChemicalElement, PhysicsState } from '../types';

export function useWidgetStateSync({
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
}: {
  locale: SupportedLocale;
  messages: Messages;
  selectedElements: ChemicalElement[];
  temperature: number;
  pressure: number;
  reactionProductsCache: ChemicalElement[];
  setTemperature: Dispatch<SetStateAction<number>>;
  setPressure: Dispatch<SetStateAction<number>>;
  setSelectedElements: Dispatch<SetStateAction<ChemicalElement[]>>;
  setReactionProductsCache: Dispatch<SetStateAction<ChemicalElement[]>>;
  setIsMultiSelect: Dispatch<SetStateAction<boolean>>;
  simulationRegistry: MutableRefObject<Map<number, () => PhysicsState>>;
}) {
  const lastProcessedAiTimestampRef = useRef(0);
  const reactionAtomicNumberRef = useRef(900000);
  const reactionProductsCacheRef = useRef<ChemicalElement[]>(reactionProductsCache);
  const localeRef = useRef(locale);
  const syncStateToChatGPTRef = useRef<() => Promise<void>>(async () => {});
  const scheduledSyncRef = useRef<number | null>(null);

  useEffect(() => {
    reactionProductsCacheRef.current = reactionProductsCache;
  }, [reactionProductsCache]);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  const syncStateToChatGPT = useCallback(async () => {
    if (typeof window === 'undefined' || !window.openai?.setWidgetState) return;

    const elementsData = selectedElements.map((element) => {
      const getter = simulationRegistry.current.get(element.atomicNumber);
      const currentState = getter ? getter() : null;
      const snapshot = resolveWidgetPhysicsSnapshot({
        currentState,
        element,
        pressure,
        targetTemperature: temperature,
      });

      return buildElementWidgetStateEntry({
        element,
        messages,
        pressure,
        snapshot,
        targetTemperature: temperature,
      });
    });
    try {
      await window.openai.setWidgetState(
        buildWidgetStatePayload(
          selectedElements,
          elementsData,
          temperature,
          pressure,
        ),
      );
    } catch (error) {
      console.error('Failed to sync widget state to ChatGPT:', error);
    }
  }, [messages, pressure, selectedElements, simulationRegistry, temperature]);

  syncStateToChatGPTRef.current = syncStateToChatGPT;

  const cancelScheduledSyncStateToChatGPT = useCallback(() => {
    if (scheduledSyncRef.current !== null) {
      window.clearTimeout(scheduledSyncRef.current);
      scheduledSyncRef.current = null;
    }
  }, []);

  const scheduleSyncStateToChatGPT = useCallback(() => {
    cancelScheduledSyncStateToChatGPT();

    scheduledSyncRef.current = window.setTimeout(() => {
      scheduledSyncRef.current = null;
      void syncStateToChatGPTRef.current();
    }, 0);
  }, [cancelScheduledSyncStateToChatGPT]);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      if (cancelled) return;
      await syncStateToChatGPTRef.current();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      cancelScheduledSyncStateToChatGPT();
    };
  }, [cancelScheduledSyncStateToChatGPT]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkAiUpdates = () => {
      const update = parseStructuredContentUpdate(
        readStructuredContentFromOpenAi(),
        lastProcessedAiTimestampRef.current,
      );
      if (!update) {
        return;
      }

      lastProcessedAiTimestampRef.current = update.timestamp;
      let shouldSyncWidgetState = false;

      if (update.temperatureK !== null) {
        setTemperature(update.temperatureK);
        shouldSyncWidgetState = true;
      }

      if (update.pressurePa !== null) {
        setPressure(update.pressurePa);
        shouldSyncWidgetState = true;
      }

      if (update.elementLookups.length > 0) {
        const nextElements = update.elementLookups
          .map((lookup) => findLocalizedElementByLookup(lookup, localeRef.current))
          .filter((element): element is ChemicalElement => Boolean(element));

        if (nextElements.length > 0) {
          setSelectedElements(nextElements);
          shouldSyncWidgetState = true;
        }
      }

      if (update.reactionSubstance) {
        const reactionKey = buildReactionCacheKey(
          update.reactionSubstance.formula,
          update.reactionSubstance.substanceName,
        );
        const cachedReaction = reactionProductsCacheRef.current.find(
          (candidate) => getReactionElementKey(candidate) === reactionKey,
        );
        const targetReaction =
          cachedReaction ??
          createReactionElement(
            update.reactionSubstance,
            reactionAtomicNumberRef.current++,
          );

        if (!cachedReaction) {
          setReactionProductsCache((previous) => [targetReaction, ...previous]);
        }

        setSelectedElements([targetReaction]);
        setIsMultiSelect(false);
        shouldSyncWidgetState = true;
      }

      if (shouldSyncWidgetState) {
        scheduleSyncStateToChatGPT();
      }
    };

    const intervalId = window.setInterval(checkAiUpdates, 500);
    checkAiUpdates();

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    scheduleSyncStateToChatGPT,
    setIsMultiSelect,
    setPressure,
    setReactionProductsCache,
    setSelectedElements,
    setTemperature,
  ]);

  return {
    syncStateToChatGPT,
    scheduleSyncStateToChatGPT,
  };
}
