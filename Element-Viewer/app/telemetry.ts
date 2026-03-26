import { ChemicalElement } from '../types';
import { roundTo } from './appDefinitions';

export function getSelectedAtomicNumbers(
  elements: ChemicalElement[]
): number[] {
  return elements.map((element) => element.atomicNumber);
}

export function buildSimulationTelemetryContext(
  elements: ChemicalElement[],
  temperature: number,
  pressure: number
) {
  return {
    pressurePa: roundTo(pressure, 6),
    selectedAtomicNumbers: getSelectedAtomicNumbers(elements),
    selectedSymbols: elements.map((element) => element.symbol),
    temperatureK: roundTo(temperature, 2),
  };
}
