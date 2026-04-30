import React from 'react';
import { buildSimulationTelemetryContext } from './app/telemetry';
import { getSimulationChromeLayout } from './app/simulationLayout';
import SimulationViewport from './components/SimulationViewport';
import { getLocalizedElements } from './data/localizedElements';
import { useAppChatControls } from './hooks/useAppChatControls';
import { useDocumentTheme } from './hooks/useDocumentTheme';
import { useElementViewerChat } from './hooks/useElementViewerChat';
import { useSimulationController } from './hooks/useSimulationController';
import { useTelemetry } from './hooks/useTelemetry';
import { useHostEnvironment } from './infrastructure/browser/hostEnvironment';
import { useI18n } from './i18n';

const StandaloneWebsiteShell = React.lazy(
  () => import('./components/standalone/StandaloneWebsiteShell'),
);

function App() {
  const { locale, messages, setLocale, availableLocales } = useI18n();
  const localizedElements = React.useMemo(() => getLocalizedElements(locale), [locale]);
  const defaultElement = localizedElements[0];
  const hostEnvironment = useHostEnvironment();
  const isStandaloneWebapp = hostEnvironment === 'standalone';
  const { logEvent } = useTelemetry();
  const controller = useSimulationController({
    defaultElement,
    localizedElements,
    locale,
    messages,
    logEvent,
  });

  const {
    theme,
    userAgent,
    maxHeight,
    safeArea,
    isFullscreen,
    requestDisplayMode,
  } = useElementViewerChat();

  useDocumentTheme(theme);

  const insets = {
    top: safeArea?.insets?.top ?? 0,
    bottom: safeArea?.insets?.bottom ?? 0,
    left: safeArea?.insets?.left ?? 0,
    right: safeArea?.insets?.right ?? 0,
  };

  const { handleToggleFullscreen } = useAppChatControls({
    requestDisplayMode,
    isFullscreen,
  });

  const getSimulationContext = () =>
    buildSimulationTelemetryContext(
      controller.selectedElements,
      controller.temperature,
      controller.pressure,
    );

  const handleToggleFullscreenWithTelemetry = async (event: React.MouseEvent) => {
    logEvent('FULLSCREEN_TOGGLE', {
      targetMode: isFullscreen ? 'inline' : 'fullscreen',
      ...getSimulationContext(),
    });
    await handleToggleFullscreen(event);
  };

  const handlePromptHelpClick = () => {
    logEvent('AI_PROMPT_HELP_CLICK', getSimulationContext());
  };

  const layout = getSimulationChromeLayout({
    count: controller.selectedElements.length,
    hasUsedPeriodicTableControl: controller.hasUsedPeriodicTableControl,
    insets,
    isFullscreen,
    isStandaloneWebapp,
    maxHeight,
    userAgent,
  });
  const shouldLockDesktopViewport = isFullscreen && layout.isDesktopApp;

  React.useLayoutEffect(() => {
    if (!shouldLockDesktopViewport || typeof document === 'undefined') {
      return;
    }

    const { documentElement, body } = document;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverscrollBehavior = documentElement.style.overscrollBehavior;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;

    documentElement.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    documentElement.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';

    return () => {
      documentElement.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overscrollBehavior = previousHtmlOverscrollBehavior;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
    };
  }, [shouldLockDesktopViewport]);

  const simulationViewport = (
    <SimulationViewport
      contextMenu={controller.contextMenu}
      insets={insets}
      isFullscreen={isFullscreen}
      isMultiSelect={controller.isMultiSelect}
      isPaused={controller.isPaused}
      isRecording={controller.isRecording}
      isSidebarOpen={controller.isSidebarOpen}
      isStandaloneWebapp={isStandaloneWebapp}
      layout={layout}
      messages={messages}
      pressure={controller.pressure}
      reactionProductsCache={controller.reactionProductsCache}
      recordingResults={controller.recordingResults}
      selectedElements={controller.selectedElements}
      showParticles={controller.showParticles}
      temperature={controller.temperature}
      timeScale={controller.timeScale}
      onCloseContextMenu={controller.handleCloseContextMenu}
      onCloseRecordingResults={controller.handleCloseRecordingResults}
      onContextMenuTemperatureChange={controller.handleContextMenuTemperatureChange}
      onInspect={controller.handleInspect}
      onOpenSidebarChange={controller.setSidebarOpen}
      onPeriodicTableButtonClick={controller.handlePeriodicTableButtonClick}
      onPromptHelpClick={handlePromptHelpClick}
      onRegisterSimulationUnit={controller.registerSimulationUnit}
      onSelectElement={controller.handleElementSelect}
      onSelectReactionProduct={controller.handleReactionProductSelect}
      onSetPressure={controller.setPressure}
      onSetShowParticles={controller.handleSetShowParticles}
      onSetTemperature={controller.setTemperature}
      onPressureCommit={controller.handlePressureCommit}
      onTemperatureCommit={controller.handleTemperatureCommit}
      onToggleFullscreen={handleToggleFullscreenWithTelemetry}
      onToggleMultiSelect={controller.handleToggleMultiSelect}
      onTogglePause={controller.handleTogglePause}
      onToggleRecord={controller.handleToggleRecord}
      onToggleSpeed={controller.handleToggleSpeed}
      />
  );

  const simulationShell = (
    <div
      data-simulation-shell="true"
      className={`relative w-screen overflow-hidden bg-surface text-default ${isFullscreen ? 'h-screen' : 'h-[600px]'}`}
      style={{
        maxHeight: isFullscreen ? layout.computedFullscreenHeight : undefined,
        height: isFullscreen ? layout.computedFullscreenHeight : undefined,
        marginBottom: layout.computedContainerMarginBottom,
      }}
    >
      {simulationViewport}
    </div>
  );

  const embeddedViewport = shouldLockDesktopViewport ? (
    <div
      className="fixed inset-x-0 top-0 flex w-screen flex-col overflow-hidden bg-surface text-default"
      style={{
        maxHeight: layout.computedViewportHeight,
        height: layout.computedViewportHeight,
      }}
    >
      {simulationShell}
      <div
        aria-hidden="true"
        className="w-full shrink-0 bg-surface"
        style={{ height: layout.desktopBottomSpacerHeight }}
      />
    </div>
  ) : simulationShell;

  if (isStandaloneWebapp) {
    return (
      <React.Suspense fallback={embeddedViewport}>
        <StandaloneWebsiteShell
          availableLocales={availableLocales}
          locale={locale}
          onLocaleChange={setLocale}
          simulationViewport={simulationViewport}
          websiteMessages={messages.website}
        />
      </React.Suspense>
    );
  }

  return embeddedViewport;
}

export default App;
