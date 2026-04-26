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
  computedContainerHeight: number | string | undefined;
  computedContainerMarginBottom: number | string | undefined;
  computedFullscreenHeight: number | string | undefined;
  periodicBottomDockOffset: number;
  controlIconStyle: React.CSSProperties;
  desktopUniformButtonClass: string | undefined;
  desktopLabelButtonClass: string | undefined;
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

  const openAiLayout = typeof window !== 'undefined' ? window.openai : undefined;
  const sdkDisplayMode = openAiLayout?.displayMode;
  const resolvedDisplayMode = sdkDisplayMode ?? (isFullscreen ? 'fullscreen' : 'inline');
  const resolvedIsFullscreen = resolvedDisplayMode === 'fullscreen';
  const sdkMaxHeight = openAiLayout?.maxHeight;
  const resolvedMaxHeight =
    typeof sdkMaxHeight === 'number' && Number.isFinite(sdkMaxHeight)
      ? sdkMaxHeight
      : maxHeight;
  const isDesktopViewport = typeof window !== 'undefined' ? window.innerWidth >= 1024 : false;
  const isDesktopApp =
    userAgent?.device?.type === 'desktop' ||
    (!userAgent && isDesktopViewport) ||
    (userAgent?.device?.type === 'unknown' && isDesktopViewport);
  const shouldUseIosFullscreenReserve = !isDesktopApp && resolvedIsFullscreen && isIOSLikeTouchDevice();
  const desktopBottomInset = isDesktopApp && resolvedIsFullscreen ? 0.22 : 0;
  const iosBottomReserve = shouldUseIosFullscreenReserve ? Math.max(0, insets.bottom + 16) : 0;
  const computedContainerMarginBottom =
    shouldUseIosFullscreenReserve
      ? iosBottomReserve
      : isDesktopApp && resolvedIsFullscreen
      ? (typeof resolvedMaxHeight === 'number' ? Math.max(0, resolvedMaxHeight * desktopBottomInset) : '18vh')
      : undefined;
  const computedFullscreenHeight =
    resolvedIsFullscreen
      ? (typeof resolvedMaxHeight === 'number'
          ? Math.max(
              0,
              resolvedMaxHeight - (typeof computedContainerMarginBottom === 'number' ? computedContainerMarginBottom : 0),
            )
          : (isDesktopApp ? '82vh' : undefined))
      : undefined;
  const computedContainerHeight =
    resolvedIsFullscreen
      ? computedFullscreenHeight
      : (typeof resolvedMaxHeight === 'number' ? resolvedMaxHeight : undefined);
  const periodicBottomDockOffset = isDesktopApp
    ? 0
    : (shouldUseIosFullscreenReserve ? 16 : (16 + insets.bottom));
  const iconScale = isDesktopApp ? 1.2 : 1.15;
  const controlIconSizePx = `${(16 * iconScale).toFixed(2)}px`;

  return {
    computedContainerHeight,
    computedContainerMarginBottom,
    computedFullscreenHeight,
    periodicBottomDockOffset,
    controlIconStyle: { width: controlIconSizePx, height: controlIconSizePx },
    desktopUniformButtonClass: isDesktopApp ? 'h-6 w-6 min-h-6 min-w-6' : undefined,
    desktopLabelButtonClass: isDesktopApp ? 'h-6 min-h-6 px-2 text-[10px]' : undefined,
    leftControlTop: Math.max(0, (16 + insets.top) - (!isDesktopApp && resolvedIsFullscreen ? 56 : 0)),
    shouldCompactPeriodicTableButton: count >= 5 || hasUsedPeriodicTableControl,
    leftControlsPositionClass: isStandaloneWebapp ? 'absolute' : 'fixed',
    gridClass,
  };
}
