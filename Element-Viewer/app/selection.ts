import { ChemicalElement } from '../types';

export interface SelectionResult {
  didChange: boolean;
  nextSelection: ChemicalElement[];
}

interface ComputeNextSelectionArgs {
  allowSingleDeselect: boolean;
  candidate: ChemicalElement;
  fallbackElement?: ChemicalElement;
  isMultiSelect: boolean;
  maxElements?: number;
  selectedElements: ChemicalElement[];
}

export function computeNextSelection({
  allowSingleDeselect,
  candidate,
  fallbackElement,
  isMultiSelect,
  maxElements = 6,
  selectedElements,
}: ComputeNextSelectionArgs): SelectionResult {
  let nextSelection = selectedElements;
  let didChange = false;
  const exists = selectedElements.some(
    (item) => item.atomicNumber === candidate.atomicNumber
  );

  if (!isMultiSelect) {
    if (allowSingleDeselect && exists && selectedElements.length === 1) {
      nextSelection = fallbackElement ? [fallbackElement] : selectedElements;
      didChange = nextSelection !== selectedElements;
    } else if (!exists || selectedElements.length > 1) {
      nextSelection = [candidate];
      didChange = true;
    }

    return { didChange, nextSelection };
  }

  if (exists) {
    const filtered = selectedElements.filter(
      (element) => element.atomicNumber !== candidate.atomicNumber
    );

    if (filtered.length === 0) {
      return { didChange: false, nextSelection: selectedElements };
    }

    return {
      didChange: true,
      nextSelection: filtered,
    };
  }

  nextSelection = [...selectedElements, candidate];
  if (nextSelection.length > maxElements) {
    nextSelection = nextSelection.slice(1);
  }

  return {
    didChange: true,
    nextSelection,
  };
}

export function collapseSelectionForSingleMode(
  selectedElements: ChemicalElement[]
): ChemicalElement[] {
  if (selectedElements.length <= 1) {
    return selectedElements;
  }

  return [selectedElements[selectedElements.length - 1]];
}
