import type React from 'react';
import { useCallback } from 'react';
import { DisplayMode } from '../types';

interface UseAppChatControlsProps {
  requestDisplayMode: (mode: DisplayMode) => Promise<unknown>;
  isFullscreen: boolean;
}

export function useAppChatControls({
  requestDisplayMode,
  isFullscreen,
}: UseAppChatControlsProps) {
  const handleToggleFullscreen = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const targetMode = isFullscreen ? 'inline' : 'fullscreen';

    try {
      await requestDisplayMode(targetMode);
    } catch (error) {
      console.error('Failed to toggle fullscreen:', error);
    }
  }, [isFullscreen, requestDisplayMode]);

  return {
    handleToggleFullscreen,
  };
}
