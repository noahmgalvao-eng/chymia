import React, { useMemo, useState } from 'react';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { EmptyMessage } from '@openai/apps-sdk-ui/components/EmptyMessage';
import { CircularProgress, LoadingIndicator } from '@openai/apps-sdk-ui/components/Indicator';
import { ArrowLeft, ArrowRight, Record, X } from '@openai/apps-sdk-ui/components/Icon';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { ChemicalElement, PhysicsState, Bounds } from '../../types';
import { useI18n } from '../../i18n';
import { phaseToReadable } from '../../app/appDefinitions';

interface RecordingData {
  element: ChemicalElement;
  start: PhysicsState;
  end: PhysicsState;
}

interface Props {
  recordings: RecordingData[];
  onClose: () => void;
}

const getVolume = (bounds: Bounds) => (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);

const RecordingStatsModal: React.FC<Props> = ({ recordings, onClose }) => {
  const { locale, messages } = useI18n();
  const [currentIndex, setCurrentIndex] = useState(0);
  const formatValue = (value: number, unit = '') =>
    `${value.toLocaleString(locale, { maximumFractionDigits: 2 })}${unit}`;

  if (recordings.length === 0) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
        style={{ backgroundColor: 'var(--modal-backdrop-background)' }}
      >
        <div className="w-full max-w-lg rounded-3xl border border-default bg-surface-elevated p-6 shadow-xl">
          <EmptyMessage>
            <EmptyMessage.Icon color="warning">
              <Record className="size-6" />
            </EmptyMessage.Icon>
            <EmptyMessage.Title>{messages.recordingStats.emptyTitle}</EmptyMessage.Title>
            <EmptyMessage.Description>{messages.recordingStats.emptyDescription}</EmptyMessage.Description>
            <EmptyMessage.ActionRow>
              <Button color="secondary" variant="soft" onClick={onClose}>
                {messages.common.close}
              </Button>
            </EmptyMessage.ActionRow>
          </EmptyMessage>
        </div>
      </div>
    );
  }

  const currentData = recordings[currentIndex];
  const { element, start, end } = currentData;

  const deltaH = end.enthalpy - start.enthalpy;
  const duration = end.simTime - start.simTime;
  const isHeating = deltaH > 0;

  const volumeStart = getVolume(start.gasBounds);
  const volumeEnd = getVolume(end.gasBounds);
  const volumeChange = volumeEnd - volumeStart;
  const volumePercent = volumeStart !== 0 ? (volumeChange / volumeStart) * 100 : 0;

  const progress = useMemo(() => ((currentIndex + 1) / recordings.length) * 100, [currentIndex, recordings.length]);

  const handleNext = () => setCurrentIndex((prev) => (prev + 1) % recordings.length);
  const handlePrev = () => setCurrentIndex((prev) => (prev - 1 + recordings.length) % recordings.length);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ backgroundColor: 'var(--modal-backdrop-background)' }}
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-default bg-surface-elevated shadow-xl">
        <header className="flex items-center justify-between border-b border-subtle p-4">
          <div className="flex items-center gap-3">
            <LoadingIndicator />
            <div>
              <h2 className="heading-sm text-default">{messages.recordingStats.title}</h2>
              <p className="text-xs text-secondary">
                {messages.recordingStats.subtitle(formatValue(duration, ' s'), currentIndex + 1, recordings.length)}
              </p>
            </div>
          </div>
          <Button color="secondary" variant="ghost" pill uniform onClick={onClose} aria-label={messages.recordingStats.closeAria}>
            <X className="size-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button color="secondary" variant="soft" pill uniform onClick={handlePrev} disabled={recordings.length <= 1}>
                <ArrowLeft className="size-4" />
              </Button>
              <Badge color="info" variant="soft">
                {element.name} ({element.symbol})
              </Badge>
              <Button color="secondary" variant="soft" pill uniform onClick={handleNext} disabled={recordings.length <= 1}>
                <ArrowRight className="size-4" />
              </Button>
            </div>
            <CircularProgress progress={progress} size={36} />
          </div>

          <SegmentedControl
            aria-label={messages.recordingStats.recordedElementSelection}
            value={String(currentIndex)}
            onChange={(next) => setCurrentIndex(Number(next))}
            size="sm"
            block
          >
            {recordings.map((recording, index) => (
              <SegmentedControl.Option key={recording.element.atomicNumber} value={String(index)}>
                {recording.element.symbol}
              </SegmentedControl.Option>
            ))}
          </SegmentedControl>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Alert
              color={isHeating ? 'danger' : 'info'}
              variant="soft"
              title={messages.recordingStats.systemEnthalpy}
              description={`${isHeating ? '+' : ''}${formatValue(deltaH, ' J')}`}
            />
            <Alert
              color={volumeChange >= 0 ? 'success' : 'warning'}
              variant="soft"
              title={messages.recordingStats.gasExpansion}
              description={`${volumeChange >= 0 ? '+' : ''}${formatValue(volumePercent, '%')}`}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-default bg-surface p-4">
              <h3 className="text-sm font-semibold text-default">{messages.recordingStats.thermodynamicVariables}</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-secondary">{messages.recordingStats.temperature}</span>
                  <span className="text-default">
                    {formatValue(start.temperature, ' K')} - {formatValue(end.temperature, ' K')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-secondary">{messages.recordingStats.pressure}</span>
                  <span className="text-default">
                    {formatValue(start.pressure / 1000, ' kPa')} - {formatValue(end.pressure / 1000, ' kPa')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-secondary">{messages.recordingStats.phaseTransition}</span>
                  <span className="text-default">
                    {phaseToReadable(messages, start.state)} - {phaseToReadable(messages, end.state)}
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-default bg-surface p-4">
              <h3 className="text-sm font-semibold text-default">{messages.recordingStats.pressureDependentBoundaries}</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-secondary">{messages.recordingStats.tMelt}</span>
                  <span className="text-default">
                    {formatValue(start.meltingPointCurrent, ' K')} - {formatValue(end.meltingPointCurrent, ' K')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-secondary">{messages.recordingStats.tBoil}</span>
                  <span className="text-default">
                    {formatValue(start.boilingPointCurrent, ' K')} - {formatValue(end.boilingPointCurrent, ' K')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-secondary">{messages.recordingStats.gasArea}</span>
                  <span className="text-default">
                    {formatValue(volumeStart, ' px²')} - {formatValue(volumeEnd, ' px²')}
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecordingStatsModal;
