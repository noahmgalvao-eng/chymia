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
  computedDesktopMarginBottom: number | string | undefined;
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
  const desktopBottomInset = isDesktopApp && isFullscreen ? 0.22 : 0;
  const computedDesktopMarginBottom =
    isDesktopApp && isFullscreen
      ? (typeof maxHeight === 'number' ? Math.max(0, maxHeight * desktopBottomInset) : '18vh')
      : undefined;
  const computedFullscreenHeight =
    isFullscreen
      ? (typeof maxHeight === 'number'
          ? Math.max(
              0,
              maxHeight - (typeof computedDesktopMarginBottom === 'number' ? computedDesktopMarginBottom : 0),
            )
          : (isDesktopApp ? '82vh' : undefined))
      : undefined;
  const periodicBottomDockOffset = isDesktopApp ? 0 : (16 + insets.bottom);
  const iconScale = isDesktopApp ? 1.2 : 1.15;
  const controlIconSizePx = `${(16 * iconScale).toFixed(2)}px`;

  return {
    computedDesktopMarginBottom,
    computedFullscreenHeight,
    periodicBottomDockOffset,
    controlIconStyle: { width: controlIconSizePx, height: controlIconSizePx },
    desktopUniformButtonClass: isDesktopApp ? 'h-6 w-6 min-h-6 min-w-6' : undefined,
    desktopLabelButtonClass: isDesktopApp ? 'h-6 min-h-6 px-2 text-[10px]' : undefined,
    leftControlTop: Math.max(0, (16 + insets.top) - (!isDesktopApp && isFullscreen ? 56 : 0)),
    shouldCompactPeriodicTableButton: count >= 5 || hasUsedPeriodicTableControl,
    leftControlsPositionClass: isStandaloneWebapp ? 'absolute' : 'fixed',
    gridClass,
  };
}
