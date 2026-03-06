import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Slider } from '@openai/apps-sdk-ui/components/Slider';
import { Switch } from '@openai/apps-sdk-ui/components/Switch';
import {
  PRESSURE_UNITS,
  PressureUnit,
  TEMP_UNITS,
  TempUnit,
  fromKelvin,
  fromPascal,
  toKelvin,
} from '../../utils/units';

interface Props {
  temperature: number;
  setTemperature: (t: number) => void;
  pressure: number;
  setPressure: (p: number) => void;
  meltPoint: number;
  boilPoint: number;
  showParticles: boolean;
  setShowParticles: (v: boolean) => void;
  onInteractionChange: (isActive: boolean) => void;
  onSliderRelease?: () => void;
}

const ControlPanel: React.FC<Props> = ({
  temperature,
  setTemperature,
  pressure,
  setPressure,
  meltPoint,
  boilPoint,
  showParticles,
  setShowParticles,
  onInteractionChange,
  onSliderRelease,
}) => {
  const [tempUnit, setTempUnit] = useState<TempUnit>('K');
  const [pressureUnit, setPressureUnit] = useState<PressureUnit>('Pa');
  const [activeControl, setActiveControl] = useState<'temperature' | 'pressure' | null>(null);

  const minTempK = 0;
  const maxTempK = 6000;
  const minSliderTemp = fromKelvin(minTempK, tempUnit);
  const maxSliderTemp = fromKelvin(maxTempK, tempUnit);

  const currentTempDisplay = fromKelvin(temperature, tempUnit);
  const currentPressureDisplay = fromPascal(pressure, pressureUnit);

  const logPressureValue = useMemo(() => {
    if (pressure > 0.0001) return Math.log10(pressure);
    return -4;
  }, [pressure]);

  const startInteraction = (target: 'temperature' | 'pressure') => {
    if (activeControl !== target) {
      setActiveControl(target);
      onInteractionChange(true);
    }
  };

  const finishInteraction = () => {
    setActiveControl((current) => {
      if (!current) return current;
      onInteractionChange(false);
      onSliderRelease?.();
      return null;
    });
  };

  useEffect(() => {
    if (!activeControl) return;

    const handleWindowPointerEnd = () => {
      finishInteraction();
    };

    window.addEventListener('pointerup', handleWindowPointerEnd);
    window.addEventListener('pointercancel', handleWindowPointerEnd);

    return () => {
      window.removeEventListener('pointerup', handleWindowPointerEnd);
      window.removeEventListener('pointercancel', handleWindowPointerEnd);
    };
  }, [activeControl, onInteractionChange, onSliderRelease]);

  const handlePressureSliderChange = (value: number) => {
    if (value <= -3.9) {
      setPressure(0);
      return;
    }
    setPressure(Math.pow(10, value));
  };

  const isDragging = activeControl !== null;
  const isDraggingTemperature = activeControl === 'temperature';
  const isDraggingPressure = activeControl === 'pressure';

  return (
    <section
      className={`space-y-4 rounded-3xl border p-4 ${
        isDragging
          ? 'border-transparent bg-transparent shadow-none touch-none'
          : 'border-default bg-surface shadow-sm'
      }`}
      onPointerUp={finishInteraction}
      onPointerCancel={finishInteraction}
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-2 ${
          isDragging ? 'opacity-0 pointer-events-none' : ''
        }`}
      >
        <div>
          <h3 className="heading-xs text-default">Environmental controls</h3>
          <p className="text-xs text-secondary">Adjust global temperature and pressure.</p>
        </div>
      </div>

      <div className={`space-y-2 ${isDraggingPressure ? 'opacity-0 pointer-events-none' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-default">Temperature</p>
          <div className="flex items-center gap-2">
            <Badge color="secondary" variant="outline">
              {Number(currentTempDisplay.toFixed(tempUnit === 'K' ? 0 : 2))} {tempUnit}
            </Badge>
            <Select
              options={TEMP_UNITS.map((unit) => ({ value: unit.value, label: unit.label }))}
              value={tempUnit}
              onChange={(next) => setTempUnit(next.value as TempUnit)}
              block={false}
              size="sm"
            />
          </div>
        </div>

        <div className="touch-none" onPointerDown={() => startInteraction('temperature')}>
          <Slider
            value={currentTempDisplay}
            min={minSliderTemp}
            max={maxSliderTemp}
            step={tempUnit === 'K' ? 10 : 1}
            unit={tempUnit}
            className="hide-slider-value"
            onChange={(value) => {
              setTemperature(toKelvin(value, tempUnit));
            }}
          />
        </div>

        <div className={`${isDragging ? 'opacity-0 pointer-events-none' : ''}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              color={Math.abs(temperature - meltPoint) < 50 ? 'warning' : 'secondary'}
              variant="soft"
            >
              Tmelt {meltPoint.toFixed(2)} K
            </Badge>
            <Badge
              color={Math.abs(temperature - boilPoint) < 100 ? 'danger' : 'secondary'}
              variant="soft"
            >
              Tboil {boilPoint.toFixed(2)} K
            </Badge>
          </div>
        </div>
      </div>

      <div className={`border-t border-subtle pt-4 ${isDragging ? 'opacity-0 pointer-events-none' : ''}`} />

      <div className={`space-y-2 ${isDraggingTemperature ? 'opacity-0 pointer-events-none' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-default">Pressure</p>
          <div className="flex items-center gap-2">
            <Badge color="secondary" variant="outline">
              {pressure > 0
                ? `${Number(currentPressureDisplay.toPrecision(6)).toLocaleString()} ${pressureUnit}`
                : `0 ${pressureUnit}`}
            </Badge>
            <Select
              options={PRESSURE_UNITS.map((unit) => ({ value: unit.value, label: unit.label }))}
              value={pressureUnit}
              onChange={(next) => setPressureUnit(next.value as PressureUnit)}
              block={false}
              size="sm"
            />
          </div>
        </div>

        <div className="touch-none" onPointerDown={() => startInteraction('pressure')}>
          <Slider
            value={logPressureValue}
            min={-4}
            max={11}
            step={0.05}
            className="hide-slider-value"
            onChange={handlePressureSliderChange}
          />
        </div>
      </div>

      <div className={`border-t border-subtle pt-4 ${isDragging ? 'opacity-0 pointer-events-none' : ''}`} />

      <div className={`${isDragging ? 'opacity-0 pointer-events-none' : ''}`}>
        <Switch
          checked={showParticles}
          onCheckedChange={setShowParticles}
          label="X-Ray Vision"
          labelPosition="start"
        />
      </div>
    </section>
  );
};

export default ControlPanel;
