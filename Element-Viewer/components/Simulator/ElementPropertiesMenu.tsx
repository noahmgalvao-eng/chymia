import React, { useMemo, useState } from 'react';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import {
  ArrowDown,
  ArrowUp,
  CloseBold,
  ExternalLink,
} from '@openai/apps-sdk-ui/components/Icon';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import { CopyTooltip } from '@openai/apps-sdk-ui/components/Tooltip';
import { ChemicalElement, MatterState, PhysicsState } from '../../types';
import { SOURCE_DATA } from '../../data/periodic_table_source';
import { calculatePhaseBoundaries, predictMatterState } from '../../hooks/physics/phaseCalculations';
import { useI18n } from '../../i18n';

interface Props {
  data: {
    x: number;
    y: number;
    element: ChemicalElement;
    physicsState: PhysicsState;
  };
  onClose: () => void;
  onSetTemperature: (temp: number) => void;
  onSetPressure: (pressure: number) => void;
}

interface PropertyItem {
  label: string;
  value: string;
  unit?: string;
  sourceId?: number;
  estimated?: boolean;
  renderedValue?: React.ReactNode;
}

interface ReferenceItem {
  id: number;
  text: string;
  href?: string;
}

const FIXED_REFERENCES: ReferenceItem[] = [
  { id: 2, text: 'L. M. Mentel, mendeleev - A Python resource for properties of chemical elements, ions and isotopes.', href: 'https://github.com/lmmentel/mendeleev' },
  { id: 3, text: 'Servicos de dados fornecidos pelo PubChem PUG-REST API.' },
  { id: 4, text: 'Angstrom Sciences, Inc. (2026). Magnetron Sputtering Reference.', href: 'https://www.angstromsciences.com/magnetron-sputtering-reference' },
  { id: 5, text: 'Wolfram Research, Inc. (2026). ElementData curated properties.', href: 'https://periodictable.com' },
  { id: 6, text: 'Wikipedia contributors. (2025). Template:Periodic table (melting point).', href: 'https://en.wikipedia.org/wiki/Template:Periodic_table_(melting_point)' },
  { id: 7, text: 'Wikipedia contributors. (2026). Boiling points of the elements (data page).', href: 'https://en.wikipedia.org/wiki/Boiling_points_of_the_elements_(data_page)' },
  { id: 8, text: 'Wikipedia contributors. (2026). Melting points of the elements (data page).', href: 'https://en.wikipedia.org/wiki/Melting_points_of_the_elements_(data_page)' },
  { id: 9, text: 'Wikipedia contributors. (2024). Template:Infobox oganesson.', href: 'https://en.wikipedia.org/wiki/Template:Infobox_oganesson' },
  { id: 10, text: 'Wikipedia contributors. (2026, 20 de fevereiro). Boiling points of the elements (data page). Wikipedia.', href: 'https://en.wikipedia.org/wiki/Boiling_points_of_the_elements_(data_page)' },
  { id: 11, text: 'Helmenstine, A. (2023). Triple Point Definition - Triple Point of Water.', href: 'https://sciencenotes.org/triple-point-of-water/' },
  { id: 12, text: 'Wikipedia contributors. (2026, 20 de fevereiro). Triple point. Wikipedia.', href: 'https://en.wikipedia.org/wiki/Triple_point' },
  { id: 13, text: 'KnowledgeDoor. (n.d.). Enthalpy of Fusion. Elements Handbook. Retrieved February 19, 2026.', href: 'https://www.knowledgedoor.com/2/elements_handbook/enthalpy_of_fusion.html' },
  { id: 14, text: 'KnowledgeDoor. (n.d.). Enthalpy of Vaporization. Elements Handbook. Retrieved February 19, 2026.', href: 'https://www.knowledgedoor.com/2/elements_handbook/enthalpy_of_vaporization.html' },
  { id: 15, text: 'KnowledgeDoor. (n.d.). Isothermal Bulk Modulus. Elements Handbook. Retrieved February 19, 2026.', href: 'https://www.knowledgedoor.com/2/elements_handbook/isothermal_bulk_modulus.html' },
  { id: 16, text: 'Wikipedia contributors. (2026, 20 de fevereiro). Copernicium. Wikipedia.', href: 'https://en.wikipedia.org/wiki/Copernicium' },
  { id: 17, text: 'Cannon, J. F. (1974). Behavior of the elements at high pressures. Journal of Physical and Chemical Reference Data, 3(3), 781-824.', href: 'https://srd.nist.gov/JPCRD/jpcrd55.pdf' },
  { id: 18, text: 'KnowledgeDoor. (n.d.). Triple Point. Elements Handbook. Retrieved February 20, 2026.', href: 'https://www.knowledgedoor.com/2/elements_handbook/triple_point.html' },
  { id: 19, text: 'KnowledgeDoor. (n.d.). Critical Point. Elements Handbook. Retrieved February 20, 2026.', href: 'https://www.knowledgedoor.com/2/elements_handbook/critical_point.html' },
];

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '\u2070',
  '1': '\u00b9',
  '2': '\u00b2',
  '3': '\u00b3',
  '4': '\u2074',
  '5': '\u2075',
  '6': '\u2076',
  '7': '\u2077',
  '8': '\u2078',
  '9': '\u2079',
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clampActionTemperature = (value: number) => clamp(value, 1, 6000);

const formatNumber = (value: number, locale: string, maxFractionDigits = 4) =>
  value.toLocaleString(locale, { maximumFractionDigits: maxFractionDigits });

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseDisplayValue = (
  rawValue: unknown,
  locale: string,
  unit?: string,
  fallbackNumber?: number,
) => {
  try {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      return { value: formatNumber(rawValue, locale), estimated: false, na: false };
    }

    if (typeof rawValue === 'string') {
      const normalized = rawValue.replace(/\u00c2/g, '').trim();
      if (!normalized || normalized.toUpperCase() === 'N/A') {
        return { value: 'N/A', estimated: false, na: true };
      }

      const estimated = normalized.includes('*');
      let value = normalized.replace(/\*/g, '').trim();
      if (unit && value) {
        const unitPattern = new RegExp(`\\s*${escapeRegex(unit)}$`, 'i');
        value = value.replace(unitPattern, '').trim();
      }

      if (!value || value.toUpperCase() === 'N/A') {
        return { value: 'N/A', estimated: false, na: true };
      }

      return { value, estimated, na: false };
    }

    if (typeof fallbackNumber === 'number' && Number.isFinite(fallbackNumber)) {
      return { value: formatNumber(fallbackNumber, locale), estimated: false, na: false };
    }
  } catch {
    return { value: 'N/A', estimated: false, na: true };
  }

  return { value: 'N/A', estimated: false, na: true };
};

const formatElectronConfiguration = (config?: string) => {
  try {
    if (!config || config.trim() === '' || config.trim().toUpperCase() === 'N/A') return 'N/A';
    return config
      .trim()
      .split(/\s+/)
      .map((token, index, arr) => {
        const match = token.match(/^(\d+[spdfghijklm])(\d+)$/i);
        const spacer = index < arr.length - 1 ? ' ' : '';
        if (!match) return `${token}${spacer}`;
        const exponent = match[2]
          .split('')
          .map((digit) => SUPERSCRIPT_MAP[digit] || digit)
          .join('');
        return `${match[1]}${exponent}${spacer}`;
      });
  } catch {
    return config || 'N/A';
  }
};

const PropertyCard: React.FC<{ item: PropertyItem; hideSourceId?: boolean; forceEstimated?: boolean }> = ({ item, hideSourceId = false, forceEstimated = false }) => {
  const { messages } = useI18n();
  const isNA = item.value === 'N/A';
  const alreadyContainsUnit = Boolean(item.unit) && item.value.toLowerCase().includes(item.unit!.toLowerCase());
  const finalText = isNA
    ? messages.common.notAvailable
    : `${item.value}${item.unit && !alreadyContainsUnit ? ` ${item.unit}` : ''}`;

  return (
    <div className="rounded-xl border border-subtle bg-surface-secondary p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="break-words text-3xs uppercase tracking-wide text-secondary">{item.label}</p>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 text-3xs">
          {(forceEstimated || item.estimated) && <span className="font-semibold uppercase tracking-wide text-warning">{messages.common.estimated}</span>}
          {!hideSourceId && typeof item.sourceId === 'number' && <span className="text-tertiary">[{item.sourceId}]</span>}
        </div>
      </div>
      <div className="mt-1 break-words text-xs font-mono leading-snug text-default">
        {item.renderedValue && !isNA ? item.renderedValue : finalText}
      </div>
    </div>
  );
};

interface PhaseActionButtonProps {
  label: string;
  helpText: string;
  onClick: () => void;
  disabled?: boolean;
  heatsUp: boolean;
  color: React.ComponentProps<typeof Button>['color'];
  variant?: React.ComponentProps<typeof Button>['variant'];
  colSpanTwo?: boolean;
}

const PhaseActionButton: React.FC<PhaseActionButtonProps> = ({
  label,
  helpText,
  onClick,
  disabled,
  heatsUp,
  color,
  variant = 'soft',
  colSpanTwo = false,
}) => {
  const { messages } = useI18n();

  return (
    <div className={`relative ${colSpanTwo ? 'col-span-2' : ''}`}>
      <Button
        color={color}
        variant={variant}
        block
        size="sm"
        className="h-8 min-h-8 whitespace-nowrap px-2 pr-8 text-xs font-semibold"
        disabled={disabled}
        onClick={onClick}
      >
        {heatsUp ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
        <span>{label}</span>
      </Button>

      <Popover>
        <Popover.Trigger>
          <Button
            color="secondary"
            variant="soft"
            size="2xs"
            uniform
            pill
            className="absolute right-1 top-1 z-20 h-5 min-h-5 w-5 min-w-5 p-0 text-[10px] font-bold"
            aria-label={messages.common.helpAria(label)}
            onClick={(event) => event.stopPropagation()}
          >
            ?
          </Button>
        </Popover.Trigger>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={6}
          minWidth={260}
          maxWidth={360}
          className="z-[130] rounded-2xl border border-default bg-surface shadow-lg"
        >
          <p className="p-3 text-xs leading-relaxed text-default">{helpText}</p>
        </Popover.Content>
      </Popover>
    </div>
  );
};

const ElementPropertiesMenu: React.FC<Props> = ({ data, onClose, onSetTemperature, onSetPressure }) => {
  const { locale, messages, formatNumber } = useI18n();
  const { element, physicsState, x, y } = data;
  const [showFullDescription, setShowFullDescription] = useState(false);
  const isReactionProduct = element.category === 'reaction_product';

  const sourceInfo = SOURCE_DATA.elements.find((entry) => entry.symbol === element.symbol) as
    | Record<string, any>
    | undefined;
  const periodicSourceRef = sourceInfo ? 1 : undefined;
  const wikiUrl = typeof sourceInfo?.source === 'string'
    ? sourceInfo.source
    : 'https://en.wikipedia.org/wiki/Periodic_table';

  const fmt = (value: number, unit = '') =>
    `${formatNumber(value, { maximumFractionDigits: 3 })}${unit}`;

  const triplePoint = element.properties.triplePoint;
  const criticalPoint = element.properties.criticalPoint;
  const hasTriplePoint = Boolean(triplePoint && triplePoint.tempK > 0 && triplePoint.pressurePa > 0);
  const hasCriticalPoint = Boolean(criticalPoint && criticalPoint.tempK > 0 && criticalPoint.pressurePa > 0);
  const isPressureBelowTriple = hasTriplePoint && physicsState.pressure < triplePoint!.pressurePa;

  const isGasLike = [
    MatterState.GAS,
    MatterState.SUPERCRITICAL,
    MatterState.TRANSITION_SCF,
    MatterState.BOILING,
    MatterState.EQUILIBRIUM_BOIL,
    MatterState.SUBLIMATION,
    MatterState.EQUILIBRIUM_SUB,
  ].includes(physicsState.state);

  const isSolidState = [
    MatterState.SOLID,
    MatterState.MELTING,
    MatterState.EQUILIBRIUM_MELT,
  ].includes(physicsState.state);

  const isLiquidState = [
    MatterState.LIQUID,
    MatterState.BOILING,
    MatterState.EQUILIBRIUM_BOIL,
  ].includes(physicsState.state);

  const isGasState = [
    MatterState.GAS,
    MatterState.SUBLIMATION,
    MatterState.EQUILIBRIUM_SUB,
  ].includes(physicsState.state);

  const isTripleState = physicsState.state === MatterState.EQUILIBRIUM_TRIPLE;
  const isCriticalState = [MatterState.SUPERCRITICAL, MatterState.TRANSITION_SCF].includes(physicsState.state);

  const actionPhaseBoundaries = useMemo(
    () => calculatePhaseBoundaries(element, physicsState.pressure),
    [element, physicsState.pressure],
  );
  const actionMeltingPoint = actionPhaseBoundaries.meltingPointCurrent;
  const actionBoilingPoint = actionPhaseBoundaries.boilingPointCurrent;
  const actionSublimationPoint = actionPhaseBoundaries.sublimationPointCurrent;
  const hasActionMeltingPoint = Number.isFinite(actionMeltingPoint) && actionMeltingPoint > 0;
  const hasActionBoilingPoint = Number.isFinite(actionBoilingPoint) && actionBoilingPoint > actionMeltingPoint;
  const liquidBandSpan = Math.max(2, actionBoilingPoint - actionMeltingPoint);
  const pressureAboveTriple = triplePoint ? Math.max(triplePoint.pressurePa * 1.1, triplePoint.pressurePa + 500) : Math.max(physicsState.pressure, 101325);
  const pressureBelowCritical = criticalPoint ? Math.max(1, criticalPoint.pressurePa * 0.8) : Math.max(1, physicsState.pressure);
  const solidifyPressureTarget = isPressureBelowTriple ? pressureAboveTriple : physicsState.pressure;
  const liquefyPressureTarget = isPressureBelowTriple ? pressureAboveTriple : physicsState.pressure;
  const boilPressureTarget = (isCriticalState && criticalPoint)
    ? pressureBelowCritical
    : (isPressureBelowTriple ? pressureAboveTriple : physicsState.pressure);
  const condensePressureTarget = isPressureBelowTriple ? pressureAboveTriple : physicsState.pressure;
  const condenseTargetTemp = Math.max(
    actionMeltingPoint + 1,
    Math.min(actionBoilingPoint - 1, actionMeltingPoint + (actionBoilingPoint - actionMeltingPoint) * 0.45),
  );
  const condenseCriticalTargetTemp = criticalPoint
    ? Math.max(actionMeltingPoint + 2, Math.min(criticalPoint.tempK - 2, actionMeltingPoint + (criticalPoint.tempK - actionMeltingPoint) * 0.65))
    : condenseTargetTemp;
  const rawSolidifyTargetTemp = Math.max(1, actionMeltingPoint - 25);
  const sublimationTemp = Math.max(
    1,
    actionSublimationPoint || physicsState.sublimationPointCurrent || triplePoint?.tempK || actionMeltingPoint,
  );
  const sublimationPressure = triplePoint ? Math.max(1, triplePoint.pressurePa * 0.8) : 1;
  const rawSublimationTargetTemp = isGasLike ? Math.max(1, sublimationTemp - 40) : sublimationTemp + 40;
  const supercriticalTargetTemp = criticalPoint ? criticalPoint.tempK + 25 : physicsState.temperature;
  const tripleTargetTemp = triplePoint?.tempK ?? physicsState.temperature;
  const criticalTempLabel = hasCriticalPoint
    ? fmt(criticalPoint!.tempK, ' K')
    : 'N/A';
  const criticalPressureLabel = hasCriticalPoint
    ? fmt(criticalPoint!.pressurePa / 1000, ' kPa')
    : messages.common.notAvailable;
  const sublimationPhaseFrom = isGasLike
    ? messages.propertiesMenu.actions.terms.gaseousAdjective
    : messages.propertiesMenu.actions.terms.solidAdjective;
  const sublimationPhaseTo = isGasLike
    ? messages.propertiesMenu.actions.terms.solidAdjective
    : messages.propertiesMenu.actions.terms.gaseousAdjective;
  const sublimationTemperatureCondition = isGasLike
    ? messages.propertiesMenu.actions.terms.below
    : messages.propertiesMenu.actions.terms.above;

  const isSolidLikePrediction = (state: MatterState) =>
    [MatterState.SOLID, MatterState.EQUILIBRIUM_MELT].includes(state);
  const isLiquidLikePrediction = (state: MatterState) =>
    [MatterState.LIQUID, MatterState.EQUILIBRIUM_MELT, MatterState.EQUILIBRIUM_BOIL].includes(state);
  const isGasLikePrediction = (state: MatterState) =>
    [MatterState.GAS, MatterState.EQUILIBRIUM_BOIL, MatterState.EQUILIBRIUM_SUB].includes(state);
  const isSublimationSolidSidePrediction = (state: MatterState) =>
    [MatterState.SOLID, MatterState.EQUILIBRIUM_SUB].includes(state);
  const isSublimationGasSidePrediction = (state: MatterState) =>
    [MatterState.GAS, MatterState.EQUILIBRIUM_SUB].includes(state);

  const resolveActionTemperature = (
    pressureTarget: number,
    seedTemperature: number,
    direction: 'up' | 'down',
    matcher: (state: MatterState) => boolean,
  ): number => {
    const boundedPressure = Math.max(1e-9, pressureTarget);
    const start = clampActionTemperature(seedTemperature);

    const isMatch = (temp: number) => matcher(predictMatterState(element, temp, boundedPressure).state);
    if (isMatch(start)) return start;

    const stepBase = Math.max(1, Math.abs(start) * 0.015);
    const forward = direction === 'up' ? 1 : -1;

    const runSearch = (dirFactor: number) => {
      let candidate = start;
      let step = stepBase;

      for (let i = 0; i < 120; i += 1) {
        candidate = clampActionTemperature(candidate + (dirFactor * step));
        if (isMatch(candidate)) return candidate;

        if (candidate <= 1 || candidate >= 6000) {
          break;
        }

        if ((i + 1) % 20 === 0) {
          step *= 1.35;
        }
      }

      return null;
    };

    return runSearch(forward) ?? runSearch(-forward) ?? start;
  };

  const solidifyTargetTemp = resolveActionTemperature(
    solidifyPressureTarget,
    rawSolidifyTargetTemp,
    'down',
    isSolidLikePrediction,
  );
  const actionMeltTarget = resolveActionTemperature(
    liquefyPressureTarget,
    hasActionBoilingPoint
      ? actionMeltingPoint + Math.max(1, liquidBandSpan * 0.35)
      : actionMeltingPoint + 25,
    'up',
    isLiquidLikePrediction,
  );
  const actionBoilTarget = resolveActionTemperature(
    boilPressureTarget,
    actionBoilingPoint + Math.max(5, actionBoilingPoint * 0.02),
    'up',
    isGasLikePrediction,
  );
  const condenseActionTarget = resolveActionTemperature(
    condensePressureTarget,
    isCriticalState ? condenseCriticalTargetTemp : condenseTargetTemp,
    'down',
    isLiquidLikePrediction,
  );
  const sublimationTargetTemp = resolveActionTemperature(
    sublimationPressure,
    rawSublimationTargetTemp,
    isGasLike ? 'down' : 'up',
    isGasLike ? isSublimationSolidSidePrediction : isSublimationGasSidePrediction,
  );

  const atomicMass = parseDisplayValue(
    typeof sourceInfo?.atomic_mass === 'number' ? sourceInfo.atomic_mass : element.mass,
    locale,
    'u',
  );
  const density = parseDisplayValue(element.properties.densityDisplay, locale);
  const atomicRadius = parseDisplayValue(element.properties.atomicRadiusDisplay, locale, 'pm', element.properties.atomicRadiusPm);
  const electronAffinity = parseDisplayValue(
    typeof sourceInfo?.electron_affinity === 'number' ? sourceInfo.electron_affinity : undefined,
    locale,
    'kJ/mol',
  );
  const ionizationEnergy = parseDisplayValue(
    Array.isArray(sourceInfo?.ionization_energies) ? sourceInfo.ionization_energies[0] : undefined,
    locale,
    'kJ/mol',
  );
  const oxidationStates = parseDisplayValue(element.properties.oxidationStatesDisplay, locale);
  const electronConfigurationRaw =
    typeof sourceInfo?.electron_configuration_semantic === 'string'
      ? sourceInfo.electron_configuration_semantic
      : typeof element.properties.electronConfiguration === 'string'
        ? element.properties.electronConfiguration
        : 'N/A';
  const electronConfiguration = parseDisplayValue(electronConfigurationRaw, locale);

  const meltingPoint = parseDisplayValue(element.properties.meltingPointDisplay, locale, 'K', element.properties.meltingPointK);
  const boilingPoint = parseDisplayValue(element.properties.boilingPointDisplay, locale, 'K', element.properties.boilingPointK);
  const triplePointTemp = parseDisplayValue(element.properties.triplePointTempDisplay, locale, 'K', triplePoint?.tempK);
  const triplePointPress = parseDisplayValue(
    element.properties.triplePointPressDisplay,
    locale,
    'kPa',
    typeof triplePoint?.pressurePa === 'number' ? triplePoint.pressurePa / 1000 : undefined,
  );
  const tripleTempLabel = triplePointTemp.na
    ? messages.common.notAvailable
    : `${triplePointTemp.value} K`;
  const triplePressureLabel = triplePointPress.na
    ? messages.common.notAvailable
    : `${triplePointPress.value} kPa`;
  const liquefyExplanation = messages.propertiesMenu.actions.liquefyHelp(
    fmt(actionMeltingPoint, ' K'),
    fmt(actionBoilingPoint, ' K'),
    triplePressureLabel,
  );
  const condenseExplanation = messages.propertiesMenu.actions.condenseHelp(
    fmt(actionMeltingPoint, ' K'),
    fmt(actionBoilingPoint, ' K'),
    triplePressureLabel,
  );
  const criticalPointTemp = parseDisplayValue(element.properties.criticalPointTempDisplay, locale, 'K', criticalPoint?.tempK);
  const criticalPointPress = parseDisplayValue(
    element.properties.criticalPointPressDisplay,
    locale,
    'kPa',
    typeof criticalPoint?.pressurePa === 'number' ? criticalPoint.pressurePa / 1000 : undefined,
  );
  const thermalConductivity = parseDisplayValue(
    element.properties.thermalConductivityDisplay,
    locale,
    'W/mK',
    element.properties.thermalConductivity,
  );
  const specificHeatSolid = parseDisplayValue(
    element.properties.specificHeatSolidDisplay,
    locale,
    'J/kgK',
    element.properties.specificHeatSolid,
  );
  const specificHeatLiquid = parseDisplayValue(
    element.properties.specificHeatLiquidDisplay,
    locale,
    'J/kgK',
    element.properties.specificHeatLiquid,
  );
  const specificHeatGas = parseDisplayValue(
    element.properties.specificHeatGasDisplay,
    locale,
    'J/kgK',
    element.properties.specificHeatGas,
  );
  const latentHeatFusion = parseDisplayValue(
    element.properties.latentHeatFusionDisplay,
    locale,
    'J/kg',
    element.properties.latentHeatFusion,
  );
  const latentHeatVaporization = parseDisplayValue(
    element.properties.latentHeatVaporizationDisplay,
    locale,
    'J/kg',
    element.properties.latentHeatVaporization,
  );
  const enthalpyFusionKjMol = parseDisplayValue(element.properties.enthalpyFusionKjMolDisplay, locale, 'kJ/mol');
  const enthalpyVaporizationKjMol = parseDisplayValue(element.properties.enthalpyVaporizationKjMolDisplay, locale, 'kJ/mol');
  const bulkModulus = parseDisplayValue(element.properties.bulkModulusDisplay, locale, 'GPa');

  const atomicChemicalProperties: PropertyItem[] = [
    { label: messages.propertiesMenu.propertyLabels.atomicMass, value: atomicMass.value, unit: atomicMass.na ? undefined : 'u', sourceId: periodicSourceRef },
    { label: messages.propertiesMenu.propertyLabels.density, value: density.value, sourceId: periodicSourceRef, estimated: density.estimated },
    { label: messages.propertiesMenu.propertyLabels.atomicRadius, value: atomicRadius.value, unit: atomicRadius.na ? undefined : 'pm', sourceId: element.properties.atomicRadiusSource, estimated: atomicRadius.estimated },
    { label: messages.propertiesMenu.propertyLabels.electronAffinity, value: electronAffinity.value, unit: electronAffinity.na ? undefined : 'kJ/mol', sourceId: periodicSourceRef, estimated: electronAffinity.estimated },
    { label: messages.propertiesMenu.propertyLabels.firstIonizationEnergy, value: ionizationEnergy.value, unit: ionizationEnergy.na ? undefined : 'kJ/mol', sourceId: periodicSourceRef, estimated: ionizationEnergy.estimated },
    { label: messages.propertiesMenu.propertyLabels.oxidationStates, value: oxidationStates.value, sourceId: periodicSourceRef, estimated: oxidationStates.estimated },
    { label: messages.propertiesMenu.propertyLabels.electronConfiguration, value: electronConfiguration.value, sourceId: periodicSourceRef, renderedValue: electronConfiguration.na ? undefined : formatElectronConfiguration(electronConfigurationRaw) },
  ];

  const physicsProperties: PropertyItem[] = [
    { label: messages.propertiesMenu.propertyLabels.meltingPoint, value: meltingPoint.value, unit: meltingPoint.na ? undefined : 'K', sourceId: element.properties.meltingPointSource, estimated: meltingPoint.estimated },
    { label: messages.propertiesMenu.propertyLabels.boilingPoint, value: boilingPoint.value, unit: boilingPoint.na ? undefined : 'K', sourceId: element.properties.boilingPointSource, estimated: boilingPoint.estimated },
    { label: messages.propertiesMenu.propertyLabels.triplePointTemperature, value: triplePointTemp.value, unit: triplePointTemp.na ? undefined : 'K', sourceId: element.properties.triplePointSource, estimated: triplePointTemp.estimated },
    { label: messages.propertiesMenu.propertyLabels.triplePointPressure, value: triplePointPress.value, unit: triplePointPress.na ? undefined : 'kPa', sourceId: element.properties.triplePointSource, estimated: triplePointPress.estimated },
    { label: messages.propertiesMenu.propertyLabels.criticalPointTemperature, value: criticalPointTemp.value, unit: criticalPointTemp.na ? undefined : 'K', sourceId: element.properties.criticalPointSource, estimated: criticalPointTemp.estimated },
    { label: messages.propertiesMenu.propertyLabels.criticalPointPressure, value: criticalPointPress.value, unit: criticalPointPress.na ? undefined : 'kPa', sourceId: element.properties.criticalPointSource, estimated: criticalPointPress.estimated },
    { label: messages.propertiesMenu.propertyLabels.thermalConductivity, value: thermalConductivity.value, unit: thermalConductivity.na ? undefined : 'W/mK', sourceId: element.properties.thermalConductivitySource, estimated: thermalConductivity.estimated },
    { label: messages.propertiesMenu.propertyLabels.specificHeatSolid, value: specificHeatSolid.value, unit: specificHeatSolid.na ? undefined : 'J/kgK', sourceId: element.properties.specificHeatSolidSource, estimated: specificHeatSolid.estimated },
    { label: messages.propertiesMenu.propertyLabels.specificHeatLiquid, value: specificHeatLiquid.value, unit: specificHeatLiquid.na ? undefined : 'J/kgK', sourceId: element.properties.specificHeatLiquidSource, estimated: specificHeatLiquid.estimated },
    { label: messages.propertiesMenu.propertyLabels.specificHeatGas, value: specificHeatGas.value, unit: specificHeatGas.na ? undefined : 'J/kgK', sourceId: element.properties.specificHeatGasSource, estimated: specificHeatGas.estimated },
    { label: messages.propertiesMenu.propertyLabels.latentHeatFusion, value: latentHeatFusion.value, unit: latentHeatFusion.na ? undefined : 'J/kg', sourceId: element.properties.latentHeatFusionSource, estimated: latentHeatFusion.estimated },
    { label: messages.propertiesMenu.propertyLabels.latentHeatVaporization, value: latentHeatVaporization.value, unit: latentHeatVaporization.na ? undefined : 'J/kg', sourceId: element.properties.latentHeatVaporizationSource, estimated: latentHeatVaporization.estimated },
    { label: messages.propertiesMenu.propertyLabels.enthalpyFusion, value: enthalpyFusionKjMol.value, unit: enthalpyFusionKjMol.na ? undefined : 'kJ/mol', sourceId: element.properties.enthalpyFusionSource, estimated: enthalpyFusionKjMol.estimated },
    { label: messages.propertiesMenu.propertyLabels.enthalpyVaporization, value: enthalpyVaporizationKjMol.value, unit: enthalpyVaporizationKjMol.na ? undefined : 'kJ/mol', sourceId: element.properties.enthalpyVaporizationSource, estimated: enthalpyVaporizationKjMol.estimated },
    { label: messages.propertiesMenu.propertyLabels.bulkModulus, value: bulkModulus.value, unit: bulkModulus.na ? undefined : 'GPa', sourceId: element.properties.bulkModulusSource, estimated: bulkModulus.estimated },
  ];

  const references = useMemo<ReferenceItem[]>(
    () => [
      { id: 1, text: `${element.name}. (2026). In Wikipedia.`, href: wikiUrl },
      ...FIXED_REFERENCES,
    ],
    [element.name, wikiUrl],
  );

  const summaryText = element.summary?.trim() || messages.common.notAvailable;
  const categoryText = element.displayCategory?.trim() || element.classification.groupName || messages.common.notAvailable;
  const canExpandDescription = summaryText.length > 140;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1366;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
  const side = x > viewportWidth * 0.6 ? 'left' : 'right';
  const panelWidth = 432;
  const panelLeft = side === 'right'
    ? clamp(x + 12, 8, viewportWidth - panelWidth)
    : clamp(x - panelWidth, 8, viewportWidth - panelWidth);
  const panelTop = clamp(y - 24, 8, viewportHeight - 640);

  return (
    <div className="fixed inset-0 z-[100]" onMouseDown={onClose}>
      <div
        className="pointer-events-auto fixed w-[min(96vw,27rem)] max-h-[min(86vh,40rem)] overflow-y-auto overflow-x-hidden rounded-3xl border border-default bg-surface shadow-xl"
        style={{ left: `${panelLeft}px`, top: `${panelTop}px` }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="space-y-4 p-4">
          <div className="sticky top-0 z-10 -mx-4 -mt-4 border-b border-subtle bg-surface/95 px-4 py-3 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                <CopyTooltip copyValue={element.symbol}>
                  <span>
                    <Badge color="info" variant="soft">{element.symbol}</Badge>
                  </span>
                </CopyTooltip>
                {!isReactionProduct && <Badge color="secondary" variant="outline">#{element.atomicNumber}</Badge>}
                </div>
                <h3 className="heading-xs text-default">{element.name}</h3>
              </div>
              <Button color="secondary" variant="ghost" pill uniform onClick={onClose} aria-label={messages.propertiesMenu.closeDetails}>
                <CloseBold className="size-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-secondary">
              {categoryText}
            </p>
            <p className={`max-w-[20rem] text-xs leading-5 text-default ${showFullDescription ? 'whitespace-pre-wrap' : 'line-clamp-2-soft'}`}>
              {summaryText}
              {!isReactionProduct && periodicSourceRef && <span className="ml-1 text-tertiary">[{periodicSourceRef}]</span>}
            </p>
            {canExpandDescription && (
              <Button
                color="secondary"
                variant="ghost"
                size="sm"
                className="w-fit px-0"
                onClick={() => setShowFullDescription((prev) => !prev)}
              >
                {showFullDescription ? messages.propertiesMenu.seeLess : messages.propertiesMenu.seeMore}
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(isLiquidState || isGasState || isTripleState || isCriticalState) && (
              <PhaseActionButton
                label={messages.propertiesMenu.actions.solidify}
                color="info"
                variant="soft"
                disabled={!hasActionMeltingPoint}
                heatsUp={solidifyTargetTemp >= physicsState.temperature}
                onClick={() => {
                  if (Math.abs(solidifyPressureTarget - physicsState.pressure) > 1e-9) {
                    onSetPressure(solidifyPressureTarget);
                  }
                  onSetTemperature(solidifyTargetTemp);
                }}
                helpText={messages.propertiesMenu.actions.solidifyHelp(fmt(actionMeltingPoint, ' K'), triplePressureLabel)}
              />
            )}

            {(isSolidState || isTripleState) && (
              <PhaseActionButton
                label={messages.propertiesMenu.actions.liquefy}
                color="warning"
                variant="soft"
                disabled={!hasActionMeltingPoint || !hasActionBoilingPoint}
                heatsUp={actionMeltTarget >= physicsState.temperature}
                onClick={() => {
                  if (Math.abs(liquefyPressureTarget - physicsState.pressure) > 1e-9) {
                    onSetPressure(liquefyPressureTarget);
                  }
                  onSetTemperature(actionMeltTarget);
                }}
                helpText={liquefyExplanation}
              />
            )}

            {(isSolidState || isLiquidState || isTripleState || isCriticalState) && (
              <PhaseActionButton
                label={messages.propertiesMenu.actions.boil}
                color="danger"
                variant="soft"
                disabled={actionBoilingPoint >= 49000 || !hasActionBoilingPoint}
                heatsUp={actionBoilTarget >= physicsState.temperature}
                onClick={() => {
                  if (Math.abs(boilPressureTarget - physicsState.pressure) > 1e-9) {
                    onSetPressure(boilPressureTarget);
                  }
                  onSetTemperature(actionBoilTarget);
                }}
                helpText={messages.propertiesMenu.actions.boilHelp(fmt(actionBoilingPoint, ' K'), triplePressureLabel)}
              />
            )}

            {(isGasState || isCriticalState) && (
              <PhaseActionButton
                label={messages.propertiesMenu.actions.condense}
                color="warning"
                variant="soft"
                disabled={!hasActionBoilingPoint || !hasActionMeltingPoint}
                heatsUp={condenseActionTarget >= physicsState.temperature}
                onClick={() => {
                  if (Math.abs(condensePressureTarget - physicsState.pressure) > 1e-9) {
                    onSetPressure(condensePressureTarget);
                  }
                  onSetTemperature(condenseActionTarget);
                }}
                helpText={condenseExplanation}
              />
            )}

            <PhaseActionButton
              label={messages.propertiesMenu.actions.sublimation}
              color="secondary"
              variant="soft"
              disabled={!hasTriplePoint || isLiquidState}
              heatsUp={sublimationTargetTemp >= physicsState.temperature}
              onClick={() => {
                if (!triplePoint) return;
                onSetPressure(sublimationPressure);
                onSetTemperature(sublimationTargetTemp);
              }}
              helpText={messages.propertiesMenu.actions.sublimationHelp(
                sublimationPhaseTo,
                sublimationPhaseFrom,
                sublimationTemperatureCondition,
                fmt(sublimationTemp, ' K'),
                triplePressureLabel,
              )}
            />

            <PhaseActionButton
              label={messages.propertiesMenu.actions.triplePoint}
              color="success"
              variant="soft"
              disabled={!hasTriplePoint}
              heatsUp={tripleTargetTemp >= physicsState.temperature}
              onClick={() => {
                if (!triplePoint) return;
                onSetTemperature(triplePoint.tempK);
                onSetPressure(triplePoint.pressurePa);
              }}
              helpText={messages.propertiesMenu.actions.triplePointHelp(tripleTempLabel, triplePressureLabel)}
            />

            <PhaseActionButton
              label={messages.propertiesMenu.actions.supercriticalFluid}
              color="danger"
              variant="solid"
              colSpanTwo={!(isTripleState || isCriticalState)}
              disabled={!hasCriticalPoint}
              heatsUp={supercriticalTargetTemp >= physicsState.temperature}
              onClick={() => {
                if (!criticalPoint) return;
                onSetTemperature(supercriticalTargetTemp);
                onSetPressure(criticalPoint.pressurePa + 1000);
              }}
              helpText={messages.propertiesMenu.actions.supercriticalFluidHelp(criticalTempLabel, criticalPressureLabel)}
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-subtle bg-surface p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-default">{messages.propertiesMenu.sectionTitles.atomicChemical}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {atomicChemicalProperties.map((item) => (
                <PropertyCard key={item.label} item={item} hideSourceId={isReactionProduct} forceEstimated={isReactionProduct} />
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-subtle bg-surface p-3">
            <p className="text-sm font-semibold text-default">{messages.propertiesMenu.sectionTitles.physics}</p>
            <div className="grid grid-cols-2 gap-2">
              {physicsProperties.map((item) => (
                <PropertyCard key={item.label} item={item} hideSourceId={isReactionProduct} forceEstimated={isReactionProduct} />
              ))}
            </div>
          </div>

          {!isReactionProduct && <div className="space-y-2 rounded-2xl border border-subtle bg-surface p-3">
            <Popover>
              <Popover.Trigger>
                <Button color="secondary" variant="soft" block>
                  <ExternalLink className="size-4" />
                  {messages.propertiesMenu.viewReferences}
                </Button>
              </Popover.Trigger>
              <Popover.Content
                side="top"
                align="end"
                sideOffset={8}
                minWidth={320}
                maxWidth={390}
                className="z-[130] rounded-2xl border border-default bg-surface shadow-lg"
              >
                <div className="max-h-64 space-y-2 overflow-y-auto p-3" onMouseDown={(event) => event.stopPropagation()}>
                  <p className="text-xs font-medium text-secondary">{messages.propertiesMenu.referencesTitle}</p>
                  <ul className="space-y-2">
                    {references.map((reference) => (
                      <li key={reference.id} className="rounded-xl border border-subtle bg-surface-secondary p-2">
                        <div className="flex gap-2">
                          <span className="text-xs font-semibold text-secondary">[{reference.id}]</span>
                          <div className="min-w-0 space-y-1">
                            <p className="break-words text-sm text-default">{reference.text}</p>
                            {reference.href && (
                              <ButtonLink
                                as="a"
                                href={reference.href}
                                external
                                color="secondary"
                                variant="soft"
                                size="sm"
                                className="w-fit"
                              >
                                <ExternalLink className="size-4" />
                                {messages.common.openLink}
                              </ButtonLink>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </Popover.Content>
            </Popover>
          </div>}
        </div>
      </div>
    </div>
  );
};

export default ElementPropertiesMenu;
