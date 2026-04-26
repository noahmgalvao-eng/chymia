import { Button } from '@openai/apps-sdk-ui/components/Button';
import {
  ChatTripleDots,
  Collapse,
  Expand,
  LightbulbGlow,
  Pause,
  Play,
  Record,
  SettingsSlider,
  Speed,
  Stop,
} from '@openai/apps-sdk-ui/components/Icon';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip';
import { useCallback, type MouseEvent, type PointerEvent, type TouchEvent } from 'react';
import type { SimulationChromeLayout } from '../app/simulationLayout';
import type { ContextMenuData } from '../app/appDefinitions';
import type { RecordingResult } from '../hooks/useSimulationController';
import type { Messages } from '../i18n/types';
import type { ChemicalElement, PhysicsState } from '../types';
import ElementPropertiesMenu from './Simulator/ElementPropertiesMenu';
import PeriodicTableSelector from './Simulator/PeriodicTableSelector';
import RecordingStatsModal from './Simulator/RecordingStatsModal';
import SimulationUnit from './Simulator/SimulationUnit';

const TOOLTIP_CLASS = 'tooltip-solid';
const QUALITY_SCALE = 1.0;

export default function SimulationViewport({
  contextMenu,
  insets,
  isFullscreen,
  isMultiSelect,
  isPaused,
  isRecording,
  isSidebarOpen,
  isStandaloneWebapp,
  layout,
  messages,
  pressure,
  reactionProductsCache,
  recordingResults,
  selectedElements,
  showParticles,
  temperature,
  timeScale,
  statusText,
  onCloseContextMenu,
  onCloseRecordingResults,
  onContextMenuTemperatureChange,
  onInfoButtonClick,
  onInfoButtonPress,
  onInspect,
  onOpenSidebarChange,
  onPeriodicTableButtonClick,
  onPromptHelpClick,
  onRegisterSimulationUnit,
  onSelectElement,
  onSelectReactionProduct,
  onSetPressure,
  onSetShowParticles,
  onSetTemperature,
  onPressureCommit,
  onTemperatureCommit,
  onToggleFullscreen,
  onToggleMultiSelect,
  onTogglePause,
  onToggleRecord,
  onToggleSpeed,
}: {
  contextMenu: ContextMenuData | null;
  insets: { top: number; bottom: number; left: number; right: number };
  isFullscreen: boolean;
  isMultiSelect: boolean;
  isPaused: boolean;
  isRecording: boolean;
  isSidebarOpen: boolean;
  isStandaloneWebapp: boolean;
  layout: SimulationChromeLayout;
  messages: Messages;
  pressure: number;
  reactionProductsCache: ChemicalElement[];
  recordingResults: RecordingResult[] | null;
  selectedElements: ChemicalElement[];
  showParticles: boolean;
  temperature: number;
  timeScale: number;
  statusText: string | null;
  onCloseContextMenu: () => void;
  onCloseRecordingResults: () => void;
  onContextMenuTemperatureChange: (temperature: number) => void;
  onInfoButtonClick: (event: MouseEvent) => Promise<void>;
  onInfoButtonPress: () => Promise<void>;
  onInspect: (element: ChemicalElement) => (event: MouseEvent, physics: PhysicsState) => void;
  onOpenSidebarChange: (open: boolean) => void;
  onPeriodicTableButtonClick: () => void;
  onPromptHelpClick: () => void;
  onRegisterSimulationUnit: (id: number, getter: () => PhysicsState) => void;
  onSelectElement: (element: ChemicalElement) => void;
  onSelectReactionProduct: (element: ChemicalElement) => void;
  onSetPressure: (pressure: number) => void;
  onSetShowParticles: (showParticles: boolean) => void;
  onSetTemperature: (temperature: number) => void;
  onPressureCommit: () => void;
  onTemperatureCommit: () => void;
  onToggleFullscreen: (event: MouseEvent) => Promise<void>;
  onToggleMultiSelect: () => void;
  onTogglePause: (event: MouseEvent) => void;
  onToggleRecord: (event: MouseEvent) => void;
  onToggleSpeed: (event: MouseEvent) => void;
}) {
  const count = selectedElements.length;
  const handleInfoButtonTouchEnd = useCallback((event: TouchEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void onInfoButtonPress();
  }, [onInfoButtonPress]);
  const handleInfoButtonPointerUp = useCallback((event: PointerEvent) => {
    if (event.pointerType === 'mouse') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void onInfoButtonPress();
  }, [onInfoButtonPress]);

  return (
    <>
      <PeriodicTableSelector
        selectedElements={selectedElements}
        onSelect={onSelectElement}
        reactionProducts={reactionProductsCache}
        onSelectReactionProduct={onSelectReactionProduct}
        bottomDockOffset={layout.periodicBottomDockOffset}
        isMultiSelect={isMultiSelect}
        onToggleMultiSelect={onToggleMultiSelect}
        isOpen={isSidebarOpen}
        onOpenChange={onOpenSidebarChange}
        temperature={temperature}
        setTemperature={onSetTemperature}
        onTemperatureCommit={onTemperatureCommit}
        pressure={pressure}
        setPressure={onSetPressure}
        onPressureCommit={onPressureCommit}
        showParticles={showParticles}
        setShowParticles={onSetShowParticles}
      />

      <div
        className={`${layout.leftControlsPositionClass} z-40 flex flex-col gap-3`}
        style={{ top: `${layout.leftControlTop}px`, left: `${16 + insets.left}px` }}
      >
        <Tooltip content={messages.app.controls.toggleSimulationSpeed} contentClassName={TOOLTIP_CLASS}>
          <span>
            <Button color="secondary" variant="soft" pill size="lg" className={layout.desktopLabelButtonClass} onClick={onToggleSpeed}>
              <Speed style={layout.controlIconStyle} />
              <span className="text-xs font-semibold">{timeScale}x</span>
            </Button>
          </span>
        </Tooltip>

        <Tooltip content={isPaused ? messages.app.controls.resumeSimulation : messages.app.controls.pauseSimulation} contentClassName={TOOLTIP_CLASS}>
          <span>
            <Button
              color="secondary"
              variant="soft"
              pill
              uniform
              className={layout.desktopUniformButtonClass}
              onClick={onTogglePause}
            >
              {isPaused ? <Play style={layout.controlIconStyle} /> : <Pause style={layout.controlIconStyle} />}
            </Button>
          </span>
        </Tooltip>

        <Tooltip content={isRecording ? messages.app.controls.stopRecording : messages.app.controls.startRecording} contentClassName={TOOLTIP_CLASS}>
          <span>
            <Button
              color={isRecording ? 'danger' : 'secondary'}
              variant={isRecording ? 'solid' : 'outline'}
              pill
              uniform
              className={layout.desktopUniformButtonClass}
              onClick={onToggleRecord}
            >
              {isRecording ? (
                <Stop style={layout.controlIconStyle} />
              ) : (
                <Record
                  style={{
                    ...layout.controlIconStyle,
                    color: 'var(--color-background-danger-solid)',
                    fill: 'currentColor',
                  }}
                />
              )}
            </Button>
          </span>
        </Tooltip>

        <Tooltip content={isSidebarOpen ? messages.app.controls.hidePeriodicTable : messages.app.controls.openPeriodicTable} contentClassName={TOOLTIP_CLASS}>
          <span>
            <Button
              color="secondary"
              variant="soft"
              pill
              uniform={layout.shouldCompactPeriodicTableButton}
              className={layout.shouldCompactPeriodicTableButton ? layout.desktopUniformButtonClass : layout.desktopLabelButtonClass}
              onClick={onPeriodicTableButtonClick}
            >
              <SettingsSlider style={layout.controlIconStyle} />
              {!layout.shouldCompactPeriodicTableButton && (
                <span className="text-xs font-semibold">{messages.app.controls.openPeriodicTableButton}</span>
              )}
            </Button>
          </span>
        </Tooltip>
      </div>

      {!isStandaloneWebapp && (
        <div
          className="fixed z-50 flex flex-col gap-2"
          style={{ top: `${16 + insets.top}px`, right: `${16 + insets.right}px` }}
        >
          <Tooltip content={isFullscreen ? messages.app.controls.exitFullscreen : messages.app.controls.enterFullscreen} contentClassName={TOOLTIP_CLASS}>
            <span>
              <Button color="secondary" variant="soft" pill uniform className={layout.desktopUniformButtonClass} onClick={onToggleFullscreen}>
                {isFullscreen ? <Collapse style={layout.controlIconStyle} /> : <Expand style={layout.controlIconStyle} />}
              </Button>
            </span>
          </Tooltip>

          <Tooltip content={messages.app.controls.askChatGPTAboutSimulation} contentClassName={TOOLTIP_CLASS}>
            <span>
              <Button
                color="info"
                variant="soft"
                pill
                uniform
                className={layout.desktopUniformButtonClass}
                onClick={onInfoButtonClick}
                onPointerUpCapture={handleInfoButtonPointerUp}
                onTouchEndCapture={handleInfoButtonTouchEnd}
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              >
                <ChatTripleDots
                  style={{
                    ...layout.controlIconStyle,
                    color: 'var(--color-background-info-solid)',
                    fill: 'currentColor',
                  }}
                />
              </Button>
            </span>
          </Tooltip>

          <Popover>
            <Popover.Trigger>
              <Button
                color="secondary"
                variant="soft"
                pill
                uniform
                className={layout.desktopUniformButtonClass}
                aria-label={messages.app.controls.assistantIdeasAriaLabel}
                onClick={onPromptHelpClick}
              >
                <LightbulbGlow
                  style={{
                    ...layout.controlIconStyle,
                    color: 'var(--color-background-caution-solid)',
                    fill: 'currentColor',
                  }}
                />
              </Button>
            </Popover.Trigger>
            <Popover.Content
              side="left"
              align="start"
              sideOffset={8}
              minWidth={300}
              maxWidth={380}
              className="z-[130] rounded-2xl border border-default bg-surface shadow-lg"
            >
              <div className="space-y-2 p-3 text-sm text-default">
                <p className="heading-xs text-default">{messages.app.assistantPopover.title}</p>
                <ol className="list-decimal space-y-2 pl-4">
                  <li>
                    {messages.app.assistantPopover.itemOne}
                    <p className="italic text-secondary text-xs">
                      {messages.app.assistantPopover.itemOneExample}
                    </p>
                  </li>
                  <li>
                    {messages.app.assistantPopover.itemTwo}
                    <p className="italic text-secondary text-xs">
                      {messages.app.assistantPopover.itemTwoExample}
                    </p>
                  </li>
                  <li>{messages.app.assistantPopover.itemThree}</li>
                  <li>{messages.app.assistantPopover.itemFour}</li>
                </ol>
                <p className="border-t border-subtle pt-2 text-xs italic text-secondary">
                  {messages.app.assistantPopover.footer}
                </p>
              </div>
            </Popover.Content>
          </Popover>
        </div>
      )}

      {statusText && (
        <div
          className="pointer-events-none absolute left-1/2 z-[140] max-w-[calc(100%-7rem)] -translate-x-1/2 truncate rounded-full border border-default bg-surface px-2.5 py-1 text-[11px] font-semibold text-default shadow"
          style={{ top: `${Math.max(8, 8 + insets.top)}px` }}
        >
          {statusText}
        </div>
      )}
      <main className={`h-full w-full grid gap-px bg-border-subtle ${layout.gridClass}`}>
        {selectedElements.map((element) => (
          <div key={element.atomicNumber} className="relative h-full w-full bg-surface-secondary">
            <SimulationUnit
              element={element}
              globalTemp={temperature}
              globalPressure={pressure}
              layoutScale={{ quality: QUALITY_SCALE, visual: 1.0 }}
              showParticles={showParticles}
              totalElements={count}
              timeScale={timeScale}
              isPaused={isPaused}
              onInspect={onInspect(element)}
              onRegister={onRegisterSimulationUnit}
            />
          </div>
        ))}
      </main>

      {contextMenu && (
        <ElementPropertiesMenu
          data={contextMenu}
          onClose={onCloseContextMenu}
          onSetTemperature={onContextMenuTemperatureChange}
          onSetPressure={onSetPressure}
        />
      )}

      {recordingResults && (
        <RecordingStatsModal recordings={recordingResults} onClose={onCloseRecordingResults} />
      )}
    </>
  );
}
