import { ChemicalElement } from '../types';
import {
  IAReactionSubstance,
  clampPositive,
  formatCompact,
  normalizeElementLookup,
  roundTo,
  safeHexColor,
} from './appDefinitions';

export function buildReactionCacheKey(formula: string, name: string): string {
  return `${normalizeElementLookup(formula)}::${normalizeElementLookup(name)}`;
}

export function getReactionElementKey(element: ChemicalElement): string {
  return buildReactionCacheKey(element.symbol, element.name);
}

export function createReactionElement(
  reaction: IAReactionSubstance,
  atomicNumber: number
): ChemicalElement {
  const color = safeHexColor(reaction.suggestedColorHex);

  return {
    atomicNumber,
    symbol: reaction.formula,
    name: reaction.substanceName,
    summary: 'Model-estimated reaction product.',
    mass: clampPositive(reaction.mass, 18),
    category: 'reaction_product',
    classification: {
      group: 'N/A',
      groupBlock: 'N/A',
      period: 0,
      electronShells: 0,
    },
    visualDNA: {
      solid: { color, opacidade: 1 },
      liquid: { color, opacidade: 0.8 },
      gas: { color, opacidade: 0.4 },
    },
    properties: {
      meltingPointK: clampPositive(reaction.meltingPointK, 273.15),
      boilingPointK: clampPositive(reaction.boilingPointK, 373.15),
      specificHeatSolid: clampPositive(reaction.specificHeatSolid, 1000),
      specificHeatLiquid: clampPositive(reaction.specificHeatLiquid, 1000),
      specificHeatGas: clampPositive(reaction.specificHeatGas, 1000),
      latentHeatFusion: clampPositive(reaction.latentHeatFusion, 100000),
      latentHeatVaporization: clampPositive(reaction.latentHeatVaporization, 1000000),
      enthalpyVapJmol: clampPositive(reaction.enthalpyVapJmol, 40000),
      enthalpyFusionJmol: clampPositive(reaction.enthalpyFusionJmol, 6000),
      triplePoint: {
        tempK: clampPositive(reaction.triplePoint.tempK, 200),
        pressurePa: clampPositive(reaction.triplePoint.pressurePa, 100),
      },
      criticalPoint: {
        tempK: clampPositive(reaction.criticalPoint.tempK, 500),
        pressurePa: clampPositive(reaction.criticalPoint.pressurePa, 100000),
      },
      meltingPointDisplay: formatCompact(clampPositive(reaction.meltingPointK, 273.15), 'K'),
      boilingPointDisplay: formatCompact(clampPositive(reaction.boilingPointK, 373.15), 'K'),
      specificHeatSolidDisplay: `${roundTo(clampPositive(reaction.specificHeatSolid, 1000), 2)}`,
      specificHeatLiquidDisplay: `${roundTo(clampPositive(reaction.specificHeatLiquid, 1000), 2)}`,
      specificHeatGasDisplay: `${roundTo(clampPositive(reaction.specificHeatGas, 1000), 2)}`,
      latentHeatFusionDisplay: `${roundTo(clampPositive(reaction.latentHeatFusion, 100000) / 1000, 2)}`,
      latentHeatVaporizationDisplay: `${roundTo(clampPositive(reaction.latentHeatVaporization, 1000000) / 1000, 2)}`,
      triplePointTempDisplay: `${roundTo(clampPositive(reaction.triplePoint.tempK, 200), 2)}`,
      triplePointPressDisplay: `${roundTo(clampPositive(reaction.triplePoint.pressurePa, 100) / 1000, 4)}`,
      criticalPointTempDisplay: `${roundTo(clampPositive(reaction.criticalPoint.tempK, 500), 2)}`,
      criticalPointPressDisplay: `${roundTo(clampPositive(reaction.criticalPoint.pressurePa, 100000) / 1000, 2)}`,
    },
  };
}
