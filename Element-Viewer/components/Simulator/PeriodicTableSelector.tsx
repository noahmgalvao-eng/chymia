import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { ChevronDown, FileZip, Reload, SpeedometerLatencySpeed } from '@openai/apps-sdk-ui/components/Icon';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Slider } from '@openai/apps-sdk-ui/components/Slider';
import { Switch } from '@openai/apps-sdk-ui/components/Switch';
import { getLocalizedElements } from '../../data/localizedElements';
import { SOURCE_DATA } from '../../data/periodic_table_source';
import { ChemicalElement } from '../../types';
import {
  PRESSURE_UNITS,
  PressureUnit,
  TEMP_UNITS,
  TempUnit,
  fromKelvin,
  fromPascal
} from '../../utils/units';
import { useI18n } from '../../i18n';

interface Props {
  selectedElements: ChemicalElement[];
  onSelect: (el: ChemicalElement) => void;
  reactionProducts: ChemicalElement[];
  onSelectReactionProduct: (el: ChemicalElement) => void;
  bottomDockOffset?: number;
  isMultiSelect: boolean;
  onToggleMultiSelect: () => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  temperature: number;
  setTemperature: (t: number) => void;
  pressure: number;
  setPressure: (p: number) => void;
  showParticles: boolean;
  setShowParticles: (v: boolean) => void;
}

const POSITION_BY_SYMBOL = new Map<string, { xpos: number; ypos: number }>(
  SOURCE_DATA.elements
    .filter((entry) => typeof entry.symbol === 'string' && typeof entry.xpos === 'number' && typeof entry.ypos === 'number')
    .map((entry) => [entry.symbol, { xpos: entry.xpos, ypos: entry.ypos }]),
);

const CATEGORY_BY_SYMBOL = new Map<string, string>(
  SOURCE_DATA.elements
    .filter((entry) => typeof entry.symbol === 'string')
    .map((entry) => [entry.symbol, typeof entry.category === 'string' ? entry.category.toLowerCase() : '']),
);

const AMETAIS = new Set(['H', 'C', 'N', 'O', 'P', 'S', 'Se']);
const METAIS_ALCALINOS = new Set(['Li', 'Na', 'K', 'Rb', 'Cs', 'Fr']);
const METAIS_ALCALINOS_TERROSOS = new Set(['Be', 'Mg', 'Ca', 'Sr', 'Ba', 'Ra']);
const GASES_NOBRES = new Set(['He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn', 'Og']);
const HALOGENIOS = new Set(['F', 'Cl', 'Br', 'I', 'At', 'Ts']);
const SEMIMETAIS = new Set(['B', 'Si', 'Ge', 'As', 'Sb', 'Te', 'Po']);
const OUTROS_METAIS = new Set(['Al', 'Ga', 'In', 'Sn', 'Tl', 'Pb', 'Bi', 'Nh', 'Fl', 'Mc', 'Lv']);

type ElementTone =
  | 'ametais'
  | 'metaisAlcalinos'
  | 'metaisAlcalinoTerrosos'
  | 'gasesNobres'
  | 'halogenios'
  | 'semimetais'
  | 'outrosMetais'
  | 'lantanideos'
  | 'actinidios'
  | 'metaisTransicao';

type ToneStyle = {
  base: string;
  hover: string;
  active: string;
  ring: string;
};

const TONE_STYLES: Record<ElementTone, ToneStyle> = {
  ametais: {
    base: 'var(--green-100)',
    hover: 'var(--green-200)',
    active: 'var(--green-300)',
    ring: '#0f5132',
  },
  metaisAlcalinos: {
    base: 'var(--orange-200)',
    hover: 'var(--orange-300)',
    active: 'var(--orange-400)',
    ring: '#7a3c14',
  },
  metaisAlcalinoTerrosos: {
    base: 'var(--yellow-200)',
    hover: 'var(--yellow-300)',
    active: 'var(--yellow-400)',
    ring: '#6f5500',
  },
  gasesNobres: {
    base: 'var(--blue-200)',
    hover: 'var(--blue-300)',
    active: 'var(--blue-400)',
    ring: '#104f95',
  },
  halogenios: {
    base: 'var(--blue-100)',
    hover: 'var(--blue-200)',
    active: 'var(--blue-300)',
    ring: '#1e5f9f',
  },
  semimetais: {
    base: 'color-mix(in oklab, var(--blue-200) 72%, var(--green-100) 28%)',
    hover: 'color-mix(in oklab, var(--blue-300) 72%, var(--green-200) 28%)',
    active: 'color-mix(in oklab, var(--blue-400) 72%, var(--green-300) 28%)',
    ring: '#0f5f6e',
  },
  outrosMetais: {
    base: '#d9d9d9',
    hover: '#cfcfcf',
    active: '#c5c5c5',
    ring: '#6d6d6d',
  },
  lantanideos: {
    base: 'var(--blue-75)',
    hover: 'var(--blue-100)',
    active: 'var(--blue-200)',
    ring: '#3f6fa9',
  },
  actinidios: {
    base: 'var(--purple-200)',
    hover: 'var(--purple-300)',
    active: 'var(--purple-400)',
    ring: '#5b3c8a',
  },
  metaisTransicao: {
    base: 'var(--red-100)',
    hover: 'var(--red-200)',
    active: 'var(--red-300)',
    ring: '#8d3b38',
  },
};

const LEGEND_ITEMS: ElementTone[] = [
  'ametais',
  'metaisAlcalinos',
  'metaisAlcalinoTerrosos',
  'gasesNobres',
  'halogenios',
  'semimetais',
  'outrosMetais',
  'lantanideos',
  'actinidios',
  'metaisTransicao',
];

type PeriodicCellStyle = React.CSSProperties & {
  '--button-background-color'?: string;
  '--button-background-color-hover'?: string;
  '--button-background-color-active'?: string;
  '--button-text-color'?: string;
  '--button-ring-color'?: string;
  '--periodic-cell-muted'?: string;
};

type LegendSwatchStyle = React.CSSProperties & {
  '--legend-swatch-color'?: string;
};

type PreviewAvatarStyle = React.CSSProperties & {
  '--preview-avatar-color'?: string;
};

type ReactionPillStyle = React.CSSProperties & {
  '--button-background-color'?: string;
  '--button-background-color-hover'?: string;
  '--button-background-color-active'?: string;
  '--button-text-color'?: string;
  '--button-ring-color'?: string;
};

const DEFAULT_TEMPERATURE_K = 298.15;
const DEFAULT_PRESSURE_PA = 101325;
const TEMP_UNIT_SYMBOLS: Record<TempUnit, string> = {
  K: 'K',
  C: '°C',
  F: '°F',
  Ra: '°Ra',
};

const getElementTone = (symbol: string, position: { xpos: number; ypos: number }): ElementTone => {
  if (AMETAIS.has(symbol)) return 'ametais';
  if (METAIS_ALCALINOS.has(symbol)) return 'metaisAlcalinos';
  if (METAIS_ALCALINOS_TERROSOS.has(symbol)) return 'metaisAlcalinoTerrosos';
  if (GASES_NOBRES.has(symbol)) return 'gasesNobres';
  if (HALOGENIOS.has(symbol)) return 'halogenios';
  if (SEMIMETAIS.has(symbol)) return 'semimetais';
  if (OUTROS_METAIS.has(symbol)) return 'outrosMetais';
  if (position.ypos === 9) return 'lantanideos';
  if (position.ypos === 10) return 'actinidios';

  const sourceCategory = CATEGORY_BY_SYMBOL.get(symbol) ?? '';
  if (sourceCategory.includes('transition metal')) return 'metaisTransicao';

  return 'metaisTransicao';
};

const getToneStyleBySymbol = (symbol: string): ToneStyle | null => {
  const position = POSITION_BY_SYMBOL.get(symbol);
  if (!position) return null;
  return TONE_STYLES[getElementTone(symbol, position)];
};

const getReadableTextColor = (hexColor: string): string => {
  const normalized = hexColor.replace('#', '').trim();
  const fullHex = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) {
    return '#111111';
  }

  const r = Number.parseInt(fullHex.slice(0, 2), 16);
  const g = Number.parseInt(fullHex.slice(2, 4), 16);
  const b = Number.parseInt(fullHex.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.63 ? '#111111' : '#ffffff';
};

const getReactionRingColor = (hexColor: string, textColor: string): string => {
  const contrastAnchor = textColor === '#111111' ? '#0f172a' : '#ffffff';
  return `color-mix(in oklab, ${hexColor} 78%, ${contrastAnchor} 22%)`;
};

const PeriodicTableSelector: React.FC<Props> = ({
  selectedElements,
  onSelect,
  reactionProducts,
  onSelectReactionProduct,
  bottomDockOffset = 16,
  isMultiSelect,
  onToggleMultiSelect,
  isOpen,
  onOpenChange,
  temperature,
  setTemperature,
  pressure,
  setPressure,
  showParticles,
  setShowParticles,
}) => {
  const { locale, messages, formatNumber } = useI18n();
  const [activeSlider, setActiveSlider] = useState<'temperature' | 'pressure' | null>(null);
  const [tempUnit, setTempUnit] = useState<TempUnit>('K');
  const [pressureUnit, setPressureUnit] = useState<PressureUnit>('Pa');
  const [dragOffset, setDragOffset] = useState(0);
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);
  const pointerStartY = useRef<number | null>(null);
  const activePointerId = useRef<number | null>(null);
  const dragHandleRef = useRef<HTMLDivElement | null>(null);
  const sheetSurfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const pendingDragOffset = useRef(0);
  const latestDragOffset = useRef(0);
  const [closedTranslateY, setClosedTranslateY] = useState(720);

  const visibleElements = useMemo(() => getLocalizedElements(locale), [locale]);

  const selectedPreview = useMemo(() => selectedElements.slice(0, 6), [selectedElements]);
  const getAvatarLabel = useCallback((element: ChemicalElement) => {
    if (element.category !== 'reaction_product') {
      return element.symbol;
    }

    return element.symbol.length > 2 ? `${element.symbol.slice(0, 2)}...` : element.symbol;
  }, []);

  const defaultTemperatureLabel = useMemo(() => {
    const valueInCurrentUnit = fromKelvin(DEFAULT_TEMPERATURE_K, tempUnit);
    const decimals = tempUnit === 'K' ? 0 : 2;
    const formatted = formatNumber(Number(valueInCurrentUnit.toFixed(decimals)), { maximumFractionDigits: decimals });
    return `${formatted} ${TEMP_UNIT_SYMBOLS[tempUnit]}`;
  }, [formatNumber, tempUnit]);

  const defaultPressureLabel = useMemo(() => {
    const valueInCurrentUnit = fromPascal(DEFAULT_PRESSURE_PA, pressureUnit);
    const formatted = formatNumber(Number(valueInCurrentUnit.toPrecision(6)), { maximumSignificantDigits: 6 });
    return `${formatted} ${pressureUnit}`;
  }, [formatNumber, pressureUnit]);

  const flushDragOffset = useCallback(() => {
    const nextOffset = pendingDragOffset.current;
    latestDragOffset.current = nextOffset;
    setDragOffset(nextOffset);
    dragRafRef.current = null;
  }, []);

  const scheduleDragUpdate = useCallback(() => {
    if (!dragRafRef.current) {
      dragRafRef.current = requestAnimationFrame(flushDragOffset);
    }
  }, [flushDragOffset]);

  const clearDragAnimation = useCallback(() => {
    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
  }, []);

  const resetDragState = useCallback(() => {
    const handleNode = dragHandleRef.current;
    const pointerId = activePointerId.current;
    if (handleNode?.releasePointerCapture && pointerId !== null) {
      try {
        if (handleNode.hasPointerCapture(pointerId)) {
          handleNode.releasePointerCapture(pointerId);
        }
      } catch {
        // Ignore unsupported release scenarios on mobile/legacy engines.
      }
    }

    pointerStartY.current = null;
    activePointerId.current = null;
    pendingDragOffset.current = 0;
    latestDragOffset.current = 0;
    setDragOffset(0);
    setIsDraggingSheet(false);
    clearDragAnimation();
  }, [clearDragAnimation]);

  const finalizeDrag = useCallback(() => {
    const finalOffset = Math.max(latestDragOffset.current, pendingDragOffset.current);
    const closeThreshold = 96;

    if (finalOffset >= closeThreshold) {
      onOpenChange(false);
    }

    resetDragState();
  }, [onOpenChange, resetDragState]);

  const handleDragMoveWindow = useCallback((event: PointerEvent) => {
    if (pointerStartY.current === null || activePointerId.current !== event.pointerId) return;
    const delta = event.clientY - pointerStartY.current;
    pendingDragOffset.current = Math.max(0, delta);
    scheduleDragUpdate();
  }, [scheduleDragUpdate]);

  const handleDragEndWindow = useCallback((event: PointerEvent) => {
    if (activePointerId.current !== event.pointerId) return;
    finalizeDrag();
  }, [finalizeDrag]);

  const handleDragStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    pointerStartY.current = event.clientY;
    activePointerId.current = event.pointerId;
    setIsDraggingSheet(true);

    const handleNode = dragHandleRef.current;
    if (handleNode?.setPointerCapture) {
      try {
        handleNode.setPointerCapture(event.pointerId);
      } catch {
        // Some mobile browsers can throw here; window listeners cover drag continuity.
      }
    }
  }, []);

  const pressureSliderValue = pressure <= 0.0001 ? -4 : Math.log10(pressure);

  const displayedTemperature = fromKelvin(temperature, tempUnit);
  const displayedPressure = fromPascal(pressure, pressureUnit);
  const currentTemperatureLabel = `${formatNumber(Number(displayedTemperature.toFixed(tempUnit === 'K' ? 0 : 2)), {
    maximumFractionDigits: tempUnit === 'K' ? 0 : 2,
  })} ${TEMP_UNIT_SYMBOLS[tempUnit]}`;
  const currentPressureLabel = pressure > 0
    ? `${formatNumber(Number(displayedPressure.toPrecision(6)), { maximumSignificantDigits: 6 })} ${pressureUnit}`
    : `0 ${pressureUnit}`;
  const isSliderActive = activeSlider !== null;

  const activateSlider = useCallback((slider: 'temperature' | 'pressure') => {
    setActiveSlider((current) => (current === slider ? current : slider));
  }, []);

  const releaseActiveSlider = useCallback(() => {
    setActiveSlider((current) => (current === null ? current : null));
  }, []);

  useEffect(() => {
    if (!isSliderActive) return;

    window.addEventListener('pointerup', releaseActiveSlider);
    window.addEventListener('pointercancel', releaseActiveSlider);

    return () => {
      window.removeEventListener('pointerup', releaseActiveSlider);
      window.removeEventListener('pointercancel', releaseActiveSlider);
    };
  }, [isSliderActive, releaseActiveSlider]);

  useEffect(() => {
    if (!isDraggingSheet) return;

    window.addEventListener('pointermove', handleDragMoveWindow, { passive: true });
    window.addEventListener('pointerup', handleDragEndWindow);
    window.addEventListener('pointercancel', handleDragEndWindow);

    return () => {
      window.removeEventListener('pointermove', handleDragMoveWindow);
      window.removeEventListener('pointerup', handleDragEndWindow);
      window.removeEventListener('pointercancel', handleDragEndWindow);
    };
  }, [handleDragEndWindow, handleDragMoveWindow, isDraggingSheet]);

  useEffect(() => {
    return () => {
      clearDragAnimation();
    };
  }, [clearDragAnimation]);

  useEffect(() => {
    const node = sheetSurfaceRef.current;
    if (!node) return;

    const measure = () => {
      const next = Math.ceil(node.getBoundingClientRect().height + 32);
      setClosedTranslateY((previous) => (Math.abs(previous - next) < 1 ? previous : next));
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => measure());
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/35"
          onClick={() => onOpenChange(false)}
          aria-hidden
        />
      )}

      {isOpen && <div className="fixed inset-0 z-[110] bg-black/30" onClick={() => onOpenChange(false)} aria-hidden="true" />}

      <section
        className="absolute inset-x-0 z-[120] px-0 pb-0"
        style={{
          bottom: `${bottomDockOffset}px`,
          transform: `translateY(${isOpen ? dragOffset : closedTranslateY}px)`,
          transition: isDraggingSheet ? 'none' : 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)',
          pointerEvents: isOpen ? 'auto' : 'none',
          willChange: isDraggingSheet || isSliderActive ? 'transform, opacity' : undefined,
        }}
      >
        <div ref={sheetSurfaceRef} className={`periodic-sheet mx-auto w-full max-w-5xl rounded-t-3xl sm:p-2 transition-opacity duration-200 ease-out ${isDraggingSheet || isSliderActive ? 'periodic-sheet-interacting' : ''} ${isSliderActive ? "border-transparent bg-transparent shadow-none" : "periodic-sheet-surface border border-default shadow-2xl"}`}>
          <div
            className="mx-auto mb-0 flex w-full max-w-xl flex-col items-center"
          >
            <div
              ref={dragHandleRef}
              className={`h-1.5 w-14 rounded-full bg-border ${isDraggingSheet ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={{ touchAction: 'none' }}
              onPointerDown={handleDragStart}
            />
          </div>
          <div className="mb-0 flex justify-center pt-0">
            <Button className="h-8 min-h-8 px-2.5" color="secondary" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              <ChevronDown className="size-4" />
              {messages.periodicTable.hide}
            </Button>
          </div>

          <div className={`mb-0.5 flex justify-end transition-opacity duration-200 ease-out ${isSliderActive ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <Switch checked={showParticles} onCheckedChange={setShowParticles} label={messages.periodicTable.xRayVision} />
          </div>

          <div className={`mb-0.5 rounded-xl p-1.5 transition-opacity duration-200 ease-out ${isSliderActive ? 'border-transparent bg-transparent shadow-none' : 'border border-subtle bg-surface'}`}>
            <div className={`${isSliderActive && activeSlider !== 'temperature' ? 'opacity-0 pointer-events-none absolute' : ''}`}>
              <div className="mb-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <p className="flex items-center gap-1 text-sm font-semibold text-default">
                  <FileZip className="size-4" />
                  {messages.periodicTable.temperature}
                </p>
                <div className="inline-flex h-8 min-h-8 items-center justify-center rounded-full border border-default bg-surface-secondary px-3 text-sm font-semibold text-default">
                  {currentTemperatureLabel}
                </div>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    color="secondary"
                    variant="outline"
                    size="sm"
                    uniform
                    className="h-8 min-h-8 w-8 min-w-8 p-0"
                    aria-label={messages.periodicTable.resetTemperatureTo(defaultTemperatureLabel)}
                    onClick={() => setTemperature(DEFAULT_TEMPERATURE_K)}
                  >
                    <Reload className="size-4" />
                  </Button>
                  <Select
                    options={TEMP_UNITS.map((unit) => ({ value: unit.value, label: unit.label }))}
                    value={tempUnit}
                    onChange={(next) => setTempUnit(next.value as TempUnit)}
                    block={false}
                    size="sm"
                  />
                </div>
              </div>
              <div
                onPointerDown={() => activateSlider('temperature')}
                onPointerUp={releaseActiveSlider}
                onPointerCancel={releaseActiveSlider}
              >
                <Slider
                  value={temperature}
                  min={0}
                  max={6000}
                  step={10}
                  unit="K"
                  className="hide-slider-value"
                  trackColor="var(--red-100)"
                  rangeColor="var(--red-500)"
                  onChange={setTemperature}
                />
              </div>
            </div>

            <div
              className={`mt-1 ${isSliderActive && activeSlider !== 'pressure' ? 'pointer-events-none opacity-0 invisible' : ''}`}
            >
              <div className="mb-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <p className="flex items-center gap-1 text-sm font-semibold text-default">
                  <SpeedometerLatencySpeed className="size-4" />
                  {messages.periodicTable.pressure}
                </p>
                <div className="inline-flex h-8 min-h-8 items-center justify-center rounded-full border border-default bg-surface-secondary px-3 text-sm font-semibold text-default">
                  {currentPressureLabel}
                </div>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    color="secondary"
                    variant="outline"
                    size="sm"
                    uniform
                    className="h-8 min-h-8 w-8 min-w-8 p-0"
                    aria-label={messages.periodicTable.resetPressureTo(defaultPressureLabel)}
                    onClick={() => setPressure(DEFAULT_PRESSURE_PA)}
                  >
                    <Reload className="size-4" />
                  </Button>
                  <Select
                    options={PRESSURE_UNITS.map((unit) => ({ value: unit.value, label: unit.label }))}
                    value={pressureUnit}
                    onChange={(next) => setPressureUnit(next.value as PressureUnit)}
                    block={false}
                    size="sm"
                  />
                </div>
              </div>
              <div
                onPointerDown={() => activateSlider('pressure')}
                onPointerUp={releaseActiveSlider}
                onPointerCancel={releaseActiveSlider}
              >
                <Slider
                  value={pressureSliderValue}
                  min={-4}
                  max={11}
                  step={0.05}
                  className="hide-slider-value"
                  trackColor="var(--purple-100)"
                  rangeColor="var(--purple-500)"
                  onChange={(value) => setPressure(value <= -3.9 ? 0 : Math.pow(10, value))}
                />
              </div>
            </div>
          </div>

          <div className={`relative mb-0.5 flex items-center justify-between gap-2 transition-opacity duration-200 ease-out ${isSliderActive ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
              <div className="pointer-events-auto">
                <Popover>
                  <Popover.Trigger>
                    <Button color="secondary" variant="outline" size="sm">
                      {messages.periodicTable.legend}
                    </Button>
                  </Popover.Trigger>
                  <Popover.Content
                    side="top"
                    align="center"
                    sideOffset={8}
                    minWidth={210}
                    maxWidth={248}
                    className="periodic-legend-popover z-[130]"
                  >
                    <div className="p-3">
                      <ul className="periodic-legend-list">
                        {LEGEND_ITEMS.map((item) => (
                          <li key={item} className="periodic-legend-item">
                            <span
                              className="periodic-legend-swatch"
                              style={{ '--legend-swatch-color': TONE_STYLES[item].base } as LegendSwatchStyle}
                            />
                            <p className="periodic-legend-label text-xs text-secondary">{messages.periodicTable.legendItems[item]}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Popover.Content>
                </Popover>
              </div>
            </div>
            <SegmentedControl
              aria-label={messages.periodicTable.selectionMode}
              value={isMultiSelect ? 'compare' : 'single'}
              size="sm"
              onChange={(next) => {
                if ((next === 'compare') !== isMultiSelect) {
                  onToggleMultiSelect();
                }
              }}
            >
              <SegmentedControl.Option value="single">{messages.periodicTable.single}</SegmentedControl.Option>
              <SegmentedControl.Option value="compare">{messages.periodicTable.compare}</SegmentedControl.Option>
            </SegmentedControl>
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {selectedPreview.map((element) => {
                  const toneStyle = getToneStyleBySymbol(element.symbol);
                  const avatarStyle: PreviewAvatarStyle | undefined = toneStyle
                    ? { '--preview-avatar-color': toneStyle.base }
                    : element.category === 'reaction_product'
                      ? { '--preview-avatar-color': element.visualDNA.solid.color }
                      : undefined;

                  return (
                    <span
                      key={element.atomicNumber}
                      className="periodic-preview-avatar flex size-6 items-center justify-center rounded-full border border-default text-[10px] font-semibold"
                      style={avatarStyle}
                      title={element.name}
                    >
                      {getAvatarLabel(element)}
                    </span>
                  );
                })}
              </div>
              <Badge color={isMultiSelect ? 'info' : 'secondary'} variant="soft">
                {selectedElements.length}/6
              </Badge>
            </div>
          </div>

          <div className={`${isSliderActive ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200 ease-out`}>
            <div className="periodic-grid">
              {reactionProducts.length > 0 && (
                <div className="periodic-reaction-cluster">
                  <p className="periodic-reaction-label">{messages.periodicTable.substances}</p>
                  <div className="periodic-reaction-list">
                    {reactionProducts.map((reaction) => {
                      const isSelected = selectedElements.some((selected) => selected.atomicNumber === reaction.atomicNumber);
                      const reactionTone = TONE_STYLES.outrosMetais;
                      const reactionColor = reactionTone.base;
                      const textColor = getReadableTextColor(reactionColor);
                      const reactionStyle: ReactionPillStyle = {
                        backgroundColor: reactionColor,
                        '--button-background-color': reactionTone.base,
                        '--button-background-color-hover': reactionTone.hover,
                        '--button-background-color-active': reactionTone.active,
                        '--button-text-color': textColor,
                        color: textColor,
                        borderColor: 'color-mix(in oklab, #111111 24%, transparent)',
                        '--button-ring-color': reactionTone.ring ?? getReactionRingColor(reactionColor, textColor),
                      };

                      return (
                        <Button
                          key={reaction.atomicNumber}
                          color="secondary"
                          variant="solid"
                          size="sm"
                          onClick={() => onSelectReactionProduct(reaction)}
                          className={`periodic-reaction-pill relative z-[5] text-xs font-semibold ${isSelected ? 'periodic-reaction-pill-selected' : ''}`}
                          style={reactionStyle}
                          title={reaction.name}
                        >
                          {reaction.symbol}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {visibleElements.map((el) => {
                const position = POSITION_BY_SYMBOL.get(el.symbol);
                if (!position) return null;

                const isSelected = selectedElements.some((selected) => selected.atomicNumber === el.atomicNumber);
                const selectionIndex = selectedElements.findIndex(
                  (selected) => selected.atomicNumber === el.atomicNumber,
                );
                const tone = getElementTone(el.symbol, position);
                const toneStyle = TONE_STYLES[tone];
                const cellStyle: PeriodicCellStyle = {
                  gridColumn: position.xpos,
                  gridRow: position.ypos,
                  marginTop: position.ypos === 9 ? '12px' : position.ypos === 10 ? '3px' : undefined,
                  '--button-background-color': toneStyle.base,
                  '--button-background-color-hover': toneStyle.hover,
                  '--button-background-color-active': toneStyle.active,
                  '--button-text-color': '#111111',
                  '--button-ring-color': toneStyle.ring,
                  '--periodic-cell-muted': 'color-mix(in oklab, #111111 62%, transparent)',
                };

                return (
                  <Button
                    key={el.atomicNumber}
                    color="secondary"
                    variant="solid"
                    size="sm"
                    onClick={() => onSelect(el)}
                    className={`periodic-cell ${isSelected ? 'periodic-cell-selected' : ''}`}
                    style={cellStyle}
                  >
                    <span
                      className="pointer-events-none absolute left-1 top-1 text-[8px] leading-none"
                      style={{ color: 'var(--periodic-cell-muted)' }}
                    >
                      {el.atomicNumber}
                    </span>
                    <span className="text-[10px] font-semibold leading-none sm:text-2xs">{el.symbol}</span>
                    {isMultiSelect && isSelected && (
                      <span className="pointer-events-none absolute right-0.5 top-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-white">
                        {selectionIndex + 1}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default PeriodicTableSelector;
