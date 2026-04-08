import type React from 'react';
import { useCallback, useRef } from 'react';
import { DisplayMode } from '../types';

interface UseAppChatControlsProps {
  requestDisplayMode: (mode: DisplayMode) => Promise<unknown>;
  isFullscreen: boolean;
  syncStateToChatGPT: () => Promise<void>;
  handleInfoClick: () => Promise<void>;
}

export function useAppChatControls({
  requestDisplayMode,
  isFullscreen,
  syncStateToChatGPT,
  handleInfoClick,
}: UseAppChatControlsProps) {
  const isInfoActionInFlightRef = useRef(false);
  const lastInfoActionAtRef = useRef(0);

  const handleToggleFullscreen = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const targetMode = isFullscreen ? 'inline' : 'fullscreen';

    try {
      await requestDisplayMode(targetMode);
    } catch (error) {
      console.error('Failed to toggle fullscreen:', error);
    }
  }, [isFullscreen, requestDisplayMode]);

  const triggerInfoButtonAction = useCallback(async () => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (isInfoActionInFlightRef.current || now - lastInfoActionAtRef.current < 450) {
      return false;
    }

    isInfoActionInFlightRef.current = true;
    lastInfoActionAtRef.current = now;

    try {
      await syncStateToChatGPT();
      await handleInfoClick();
      return true;
    } finally {
      window.setTimeout(() => {
        isInfoActionInFlightRef.current = false;
      }, 220);
    }
  }, [syncStateToChatGPT, handleInfoClick]);

  const handleInfoButtonClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await triggerInfoButtonAction();
  }, [triggerInfoButtonAction]);

  return {
    handleToggleFullscreen,
    handleInfoButtonClick,
    triggerInfoButtonAction,
  };
}
