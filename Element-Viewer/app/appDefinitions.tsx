import { ChemicalElement, MatterState, PhysicsState } from '../types';
import type { Messages } from '../i18n/types';

export interface ContextMenuData {
  x: number;
  y: number;
  element: ChemicalElement;
  physicsState: PhysicsState;
}

export interface IAConfiguracao {
  elementos?: string[] | null;
  temperatura_K?: number | null;
  pressao_Pa?: number | null;
  interpretacao_do_modelo?: string | null;
}

export interface IAReactionSubstance {
  substanceName: string;
  formula: string;
  suggestedColorHex: string;
  mass: number;
  meltingPointK: number;
  boilingPointK: number;
  specificHeatSolid: number;
  specificHeatLiquid: number;
  specificHeatGas: number;
  latentHeatFusion: number;
  latentHeatVaporization: number;
  enthalpyVapJmol: number;
  enthalpyFusionJmol: number;
  triplePoint: { tempK: number; pressurePa: number };
  criticalPoint: { tempK: number; pressurePa: number };
}

export interface IAStructuredContent {
  configuracao_ia?: IAConfiguracao;
  substancia_reacao?: IAReactionSubstance;
  timestamp_atualizacao?: number;
}

export const roundTo = (value: number, digits = 2): number => Number(value.toFixed(digits));

export const normalizeElementLookup = (value: string): string => value.trim().toLowerCase();

export const clampPositive = (value: number, fallback: number): number => (Number.isFinite(value) && value > 0 ? value : fallback);

export const safeHexColor = (value: string): string => {
  if (typeof value !== 'string') return '#38bdf8';
  const trimmed = value.trim();
  return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(trimmed) ? trimmed : '#38bdf8';
};

export const formatCompact = (value: number, unit: string) => `${roundTo(value, 2)} ${unit}`;

export const phaseToReadable = (messages: Messages, state: MatterState): string => {
  const { readableStates } = messages.matter;

  switch (state) {
    case MatterState.SOLID:
      return readableStates.solid;
    case MatterState.MELTING:
      return readableStates.melting;
    case MatterState.EQUILIBRIUM_MELT:
      return readableStates.equilibriumMelt;
    case MatterState.LIQUID:
      return readableStates.liquid;
    case MatterState.BOILING:
      return readableStates.boiling;
    case MatterState.EQUILIBRIUM_BOIL:
      return readableStates.equilibriumBoil;
    case MatterState.EQUILIBRIUM_TRIPLE:
      return readableStates.equilibriumTriple;
    case MatterState.SUBLIMATION:
      return readableStates.sublimation;
    case MatterState.EQUILIBRIUM_SUB:
      return readableStates.equilibriumSub;
    case MatterState.GAS:
      return readableStates.gas;
    case MatterState.TRANSITION_SCF:
      return readableStates.transitionScf;
    case MatterState.SUPERCRITICAL:
      return readableStates.supercritical;
    default:
      return readableStates.unknown;
  }
};

export const phaseToPresentPhases = (messages: Messages, state: MatterState): string[] => {
  const { phaseNames } = messages.matter;

  switch (state) {
    case MatterState.EQUILIBRIUM_TRIPLE:
      return [phaseNames.solid, phaseNames.liquid, phaseNames.gas];
    case MatterState.MELTING:
    case MatterState.EQUILIBRIUM_MELT:
      return [phaseNames.solid, phaseNames.liquid];
    case MatterState.BOILING:
    case MatterState.EQUILIBRIUM_BOIL:
      return [phaseNames.liquid, phaseNames.gas];
    case MatterState.SUBLIMATION:
    case MatterState.EQUILIBRIUM_SUB:
      return [phaseNames.solid, phaseNames.gas];
    case MatterState.TRANSITION_SCF:
    case MatterState.SUPERCRITICAL:
      return [phaseNames.supercriticalFluid];
    case MatterState.LIQUID:
      return [phaseNames.liquid];
    case MatterState.GAS:
      return [phaseNames.gas];
    case MatterState.SOLID:
    default:
      return [phaseNames.solid];
  }
};

export const getSupportedEquilibria = (messages: Messages, element: ChemicalElement): string[] => {
  const hasTriplePoint = !!element.properties.triplePoint;
  const canSublimationEq = hasTriplePoint && !!element.properties.enthalpyFusionJmol;
  const { equilibria } = messages.matter;

  const results = [equilibria.melt, equilibria.boil];

  if (canSublimationEq) results.push(equilibria.sublimation);
  if (hasTriplePoint) results.push(equilibria.triple);

  return results;
};

export const getPhaseStatusLabel = (messages: Messages, state: MatterState, powerInput: number): string => {
  const { visualizerStatus } = messages.matter;

  switch (state) {
    case MatterState.SOLID:
      return visualizerStatus.solidPhase;
    case MatterState.MELTING:
      return powerInput < 0 ? visualizerStatus.solidifying : visualizerStatus.melting;
    case MatterState.EQUILIBRIUM_MELT:
      return visualizerStatus.equilibriumSolidLiquid;
    case MatterState.LIQUID:
      return visualizerStatus.liquidPhase;
    case MatterState.BOILING:
      return powerInput < 0 ? visualizerStatus.condensing : visualizerStatus.boiling;
    case MatterState.EQUILIBRIUM_BOIL:
      return visualizerStatus.equilibriumLiquidGas;
    case MatterState.EQUILIBRIUM_TRIPLE:
      return visualizerStatus.threePhaseSystem;
    case MatterState.SUBLIMATION:
      return powerInput < 0 ? visualizerStatus.depositing : visualizerStatus.sublimation;
    case MatterState.EQUILIBRIUM_SUB:
      return visualizerStatus.sublimationEquilibrium;
    case MatterState.GAS:
      return visualizerStatus.gasPhase;
    case MatterState.TRANSITION_SCF:
      return visualizerStatus.supercriticalFluidTransition;
    case MatterState.SUPERCRITICAL:
      return visualizerStatus.supercriticalFluid;
    default:
      return visualizerStatus.fallback(state);
  }
};

export const readOpenAiStructuredContent = (): unknown => {
  if (typeof window === 'undefined' || !window.openai) return null;

  const openaiWithStructured = window.openai as typeof window.openai & {
    structuredContent?: unknown;
  };

  if (openaiWithStructured.structuredContent && typeof openaiWithStructured.structuredContent === 'object') {
    return openaiWithStructured.structuredContent;
  }

  if (openaiWithStructured.toolOutput && typeof openaiWithStructured.toolOutput === 'object') {
    const toolOutput = openaiWithStructured.toolOutput as Record<string, unknown>;
    if (toolOutput.structuredContent && typeof toolOutput.structuredContent === 'object') {
      return toolOutput.structuredContent;
    }
    return toolOutput;
  }

  return null;
};
