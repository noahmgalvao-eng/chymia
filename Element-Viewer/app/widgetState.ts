import { Messages } from '../i18n/types';
import { predictMatterState } from '../hooks/physics/phaseCalculations';
import { ChemicalElement, MatterState, PhysicsState } from '../types';
import {
  getSupportedEquilibria,
  phaseToPresentPhases,
  phaseToReadable,
  roundTo,
} from './appDefinitions';

export interface ResolvedWidgetPhysicsSnapshot {
  boilProgress: number;
  boilingPointCurrent: number;
  effectiveState: MatterState;
  effectiveTempK: number;
  meltProgress: number;
  meltingPointCurrent: number;
  powerInput: number;
  scfTransitionProgress: number;
  sublimationPointCurrent: number;
  sublimationProgress: number;
}

interface ResolveWidgetPhysicsSnapshotArgs {
  currentState: PhysicsState | null;
  element: ChemicalElement;
  pressure: number;
  targetTemperature: number;
}

interface BuildElementWidgetStateEntryArgs {
  element: ChemicalElement;
  messages: Messages;
  pressure: number;
  snapshot: ResolvedWidgetPhysicsSnapshot;
  targetTemperature: number;
}

export function resolveWidgetPhysicsSnapshot({
  currentState,
  element,
  pressure,
  targetTemperature,
}: ResolveWidgetPhysicsSnapshotArgs): ResolvedWidgetPhysicsSnapshot {
  const shouldFallbackToPredicted =
    !currentState ||
    (currentState.simTime === 0 &&
      currentState.temperature === 0 &&
      targetTemperature > 0);

  const predicted = predictMatterState(element, targetTemperature, pressure);
  const effectiveState = shouldFallbackToPredicted
    ? predicted.state
    : currentState.state;
  const effectiveTempK = shouldFallbackToPredicted
    ? targetTemperature
    : currentState.temperature;

  return {
    boilProgress: shouldFallbackToPredicted
      ? effectiveState === MatterState.EQUILIBRIUM_BOIL
        ? 0.5
        : 0
      : currentState.boilProgress,
    boilingPointCurrent: shouldFallbackToPredicted
      ? predicted.T_boil
      : currentState.boilingPointCurrent,
    effectiveState,
    effectiveTempK,
    meltProgress: shouldFallbackToPredicted
      ? effectiveState === MatterState.EQUILIBRIUM_MELT
        ? 0.5
        : 0
      : currentState.meltProgress,
    meltingPointCurrent: shouldFallbackToPredicted
      ? predicted.T_melt
      : currentState.meltingPointCurrent,
    powerInput: shouldFallbackToPredicted ? 0 : currentState.powerInput,
    scfTransitionProgress: shouldFallbackToPredicted
      ? 0
      : currentState.scfTransitionProgress,
    sublimationPointCurrent: shouldFallbackToPredicted
      ? predicted.T_sub
      : currentState.sublimationPointCurrent,
    sublimationProgress: shouldFallbackToPredicted
      ? effectiveState === MatterState.EQUILIBRIUM_SUB
        ? 0.5
        : 0
      : currentState.sublimationProgress,
  };
}

export function buildElementWidgetStateEntry({
  element,
  messages,
  pressure,
  snapshot,
  targetTemperature,
}: BuildElementWidgetStateEntryArgs) {
  const deltaToTargetK = targetTemperature - snapshot.effectiveTempK;
  const absDelta = Math.abs(deltaToTargetK);

  let thermalTrend = messages.app.widgetState.thermalTrendStable;
  if (absDelta > 0.2) {
    thermalTrend =
      deltaToTargetK > 0
        ? messages.app.widgetState.thermalTrendHeatingTowardTarget
        : messages.app.widgetState.thermalTrendCoolingTowardTarget;
  } else if (Math.abs(snapshot.powerInput) > 0.05) {
    thermalTrend =
      snapshot.powerInput > 0
        ? messages.app.widgetState.thermalTrendHeatingLightly
        : messages.app.widgetState.thermalTrendCoolingLightly;
  }

  const hasTriplePoint = !!element.properties.triplePoint;
  const hasCriticalPoint = !!element.properties.criticalPoint;
  const isAtTriplePointNow =
    snapshot.effectiveState === MatterState.EQUILIBRIUM_TRIPLE ||
    (!!element.properties.triplePoint &&
      Math.abs(snapshot.effectiveTempK - element.properties.triplePoint.tempK) < 1 &&
      Math.max(pressure, element.properties.triplePoint.pressurePa) /
        Math.min(
          Math.max(1e-9, pressure),
          element.properties.triplePoint.pressurePa
        ) <
        1.1);
  const isAtSupercriticalNow =
    snapshot.effectiveState === MatterState.SUPERCRITICAL ||
    snapshot.effectiveState === MatterState.TRANSITION_SCF;

  return {
    delta_para_temperatura_alvo_K: roundTo(deltaToTargetK, 2),
    estado_da_materia: phaseToReadable(messages, snapshot.effectiveState),
    estado_da_materia_codigo: snapshot.effectiveState,
    estados_de_equilibrio_suportados_no_modelo: getSupportedEquilibria(
      messages,
      element
    ),
    fases_presentes: phaseToPresentPhases(messages, snapshot.effectiveState),
    limites_fase_K: {
      ebulicao: roundTo(snapshot.boilingPointCurrent, 2),
      fusao: roundTo(snapshot.meltingPointCurrent, 2),
      sublimacao:
        snapshot.sublimationPointCurrent > 0
          ? roundTo(snapshot.sublimationPointCurrent, 2)
          : null,
    },
    nome: element.name,
    numero_atomico: element.atomicNumber,
    pontos_termodinamicos: {
      esta_em_regime_supercritico_agora: isAtSupercriticalNow,
      esta_no_ponto_triplo_agora: isAtTriplePointNow,
      tem_ponto_critico: hasCriticalPoint,
      tem_ponto_triplo: hasTriplePoint,
    },
    progresso: {
      ebulicao: roundTo(Math.min(1, Math.max(0, snapshot.boilProgress)), 3),
      fusao: roundTo(Math.min(1, Math.max(0, snapshot.meltProgress)), 3),
      sublimacao: roundTo(
        Math.min(1, Math.max(0, snapshot.sublimationProgress)),
        3
      ),
      transicao_supercritica: roundTo(
        Math.min(1, Math.max(0, snapshot.scfTransitionProgress)),
        3
      ),
    },
    simbolo: element.symbol,
    temperatura_efetiva_atual_K: roundTo(snapshot.effectiveTempK, 2),
    tendencia_termica: thermalTrend,
  };
}

export function buildWidgetStatePayload(
  selectedElements: ChemicalElement[],
  elementEntries: ReturnType<typeof buildElementWidgetStateEntry>[],
  temperature: number,
  pressure: number
) {
  return {
    ambiente: {
      pressao_Pa: roundTo(pressure, 6),
      temperatura_alvo_K: roundTo(temperature, 2),
      total_elementos_visiveis: selectedElements.length,
    },
    elementos_selecionados_em_ordem: selectedElements.map(
      (element) => element.symbol
    ),
    elementos_visiveis: elementEntries,
  };
}
