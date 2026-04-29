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

const DESKTOP_CHAT_RESERVE_MIN_PX = 88;
const DESKTOP_CHAT_RESERVE_MAX_PX = 132;
const DESKTOP_CHAT_RESERVE_RATIO = 0.12;
const DESKTOP_CHAT_RESERVE_CSS = `clamp(${DESKTOP_CHAT_RESERVE_MIN_PX}px, ${DESKTOP_CHAT_RESERVE_RATIO * 100}dvh, ${DESKTOP_CHAT_RESERVE_MAX_PX}px)`;

function getDesktopChatReservePx(height: number): number {
  return Math.round(
    Math.min(
      DESKTOP_CHAT_RESERVE_MAX_PX,
      Math.max(DESKTOP_CHAT_RESERVE_MIN_PX, height * DESKTOP_CHAT_RESERVE_RATIO),
    ),
  );
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
  const iosBottomReserve = shouldUseIosFullscreenReserve ? Math.max(0, insets.bottom + 16) : 0;
  const computedContainerMarginBottom =
    shouldUseIosFullscreenReserve
      ? iosBottomReserve
      : isDesktopApp && isFullscreen
      ? (typeof effectiveViewportHeight === 'number' ? getDesktopChatReservePx(effectiveViewportHeight) : DESKTOP_CHAT_RESERVE_CSS)
      : undefined;
  const computedFullscreenHeight =
    isFullscreen
      ? (typeof effectiveViewportHeight === 'number'
          ? Math.max(
              0,
              effectiveViewportHeight - (typeof computedContainerMarginBottom === 'number' ? computedContainerMarginBottom : 0),
            )
          : (isDesktopApp ? `calc(100dvh - ${DESKTOP_CHAT_RESERVE_CSS})` : undefined))
      : undefined;
  const periodicBottomDockOffset = isDesktopApp
    ? 0
    : (shouldUseIosFullscreenReserve ? 16 : (16 + insets.bottom));
  const iconScale = isDesktopApp ? 1.2 : 1.15;
  const controlIconSizePx = `${(16 * iconScale).toFixed(2)}px`;

  return {
    computedContainerMarginBottom,
    computedFullscreenHeight,
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
