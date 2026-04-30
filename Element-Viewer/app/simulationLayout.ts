import type React from 'react';

type UserAgentLike = {
  device?: {
    type?: string | null;
  } | null;
} | null | undefined;

export type SimulationInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type SimulationChromeLayout = {
  computedContainerMarginBottom: number | string | undefined;
  computedFullscreenHeight: number | string | undefined;
  desktopBottomReserve: number | string | undefined;
  periodicBottomDockOffset: number;
  controlIconStyle: React.CSSProperties;
  desktopUniformButtonClass: string | undefined;
  desktopLabelButtonClass: string | undefined;
  isDesktopApp: boolean;
  leftControlTop: number;
  shouldCompactPeriodicTableButton: boolean;
  leftControlsPositionClass: 'absolute' | 'fixed';
  gridClass: string;
};

function isIOSLikeTouchDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const hasTouchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!hasTouchSupport) {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function getSimulationChromeLayout({
  count,
  hasUsedPeriodicTableControl,
  insets,
  isFullscreen,
  isStandaloneWebapp,
  maxHeight,
  userAgent,
}: {
  count: number;
  hasUsedPeriodicTableControl: boolean;
  insets: SimulationInsets;
  isFullscreen: boolean;
  isStandaloneWebapp: boolean;
  maxHeight: number | null | undefined;
  userAgent: UserAgentLike;
}): SimulationChromeLayout {
  let gridClass = 'grid-cols-1 grid-rows-1';

  if (count === 2) gridClass = 'grid-cols-2 grid-rows-1';
  else if (count >= 3 && count <= 4) gridClass = 'grid-cols-2 grid-rows-2';
  else if (count >= 5) gridClass = 'grid-cols-2 grid-rows-3 md:grid-cols-3 md:grid-rows-2';

  const isDesktopViewport = typeof window !== 'undefined' ? window.innerWidth >= 1024 : false;
  const isDesktopApp =
    userAgent?.device?.type === 'desktop' ||
    (!userAgent && isDesktopViewport) ||
    (userAgent?.device?.type === 'unknown' && isDesktopViewport);
  const shouldUseIosFullscreenReserve = !isDesktopApp && isFullscreen && isIOSLikeTouchDevice();
  const visualViewportHeight = typeof window !== 'undefined'
    ? (window.visualViewport?.height ?? window.innerHeight)
    : undefined;
  const effectiveViewportHeight = typeof visualViewportHeight === 'number' && Number.isFinite(visualViewportHeight)
    ? (typeof maxHeight === 'number' ? Math.min(maxHeight, visualViewportHeight) : visualViewportHeight)
    : maxHeight;
  const desktopBottomReserve =
    isDesktopApp && isFullscreen
      ? '22dvh'
      : undefined;
  const iosBottomReserve = shouldUseIosFullscreenReserve ? Math.max(0, insets.bottom + 16) : 0;
  const computedContainerMarginBottom =
    shouldUseIosFullscreenReserve
      ? iosBottomReserve
      : undefined;
  const fullscreenHeightBase = isDesktopApp ? maxHeight : effectiveViewportHeight;
  const computedFullscreenHeight =
    isFullscreen
      ? (isDesktopApp
          ? 'calc(100dvh - 22dvh)'
          : typeof fullscreenHeightBase === 'number'
          ? Math.max(
              0,
              fullscreenHeightBase - (typeof computedContainerMarginBottom === 'number' ? computedContainerMarginBottom : 0),
            )
          : undefined)
      : undefined;
  const periodicBottomDockOffset = isDesktopApp
    ? 0
    : (shouldUseIosFullscreenReserve ? 16 : (16 + insets.bottom));
  const iconScale = isDesktopApp ? 1.2 : 1.15;
  const controlIconSizePx = `${(16 * iconScale).toFixed(2)}px`;

  return {
    computedContainerMarginBottom,
    computedFullscreenHeight,
    desktopBottomReserve,
    periodicBottomDockOffset,
    controlIconStyle: { width: controlIconSizePx, height: controlIconSizePx },
    desktopUniformButtonClass: isDesktopApp ? 'h-6 w-6 min-h-6 min-w-6' : undefined,
    desktopLabelButtonClass: isDesktopApp ? 'h-6 min-h-6 px-2 text-[10px]' : undefined,
    isDesktopApp,
    leftControlTop: Math.max(0, (16 + insets.top) - (!isDesktopApp && isFullscreen ? 56 : 0)),
    shouldCompactPeriodicTableButton: count >= 5 || hasUsedPeriodicTableControl,
    leftControlsPositionClass: isStandaloneWebapp ? 'absolute' : 'fixed',
    gridClass,
  };
}
