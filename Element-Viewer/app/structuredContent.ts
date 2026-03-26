import { IAReactionSubstance, IAStructuredContent, normalizeElementLookup } from './appDefinitions';

const MAX_PRESSURE_PA = 100000000000;
const MAX_SELECTED_ELEMENTS = 6;
const MAX_TEMPERATURE_K = 6000;

export interface StructuredContentUpdate {
  elementLookups: string[];
  pressurePa: number | null;
  reactionSubstance: IAReactionSubstance | null;
  temperatureK: number | null;
  timestamp: number;
}

export function parseStructuredContentUpdate(
  rawContent: unknown,
  lastProcessedTimestamp: number
): StructuredContentUpdate | null {
  if (!rawContent || typeof rawContent !== 'object') {
    return null;
  }

  const content = rawContent as IAStructuredContent;
  const { configuracao_ia, timestamp_atualizacao } = content;

  if (
    !configuracao_ia ||
    typeof timestamp_atualizacao !== 'number' ||
    timestamp_atualizacao <= lastProcessedTimestamp
  ) {
    return null;
  }

  return {
    elementLookups: Array.isArray(configuracao_ia.elementos)
      ? configuracao_ia.elementos
          .map((value) => normalizeElementLookup(value))
          .filter(Boolean)
          .slice(0, MAX_SELECTED_ELEMENTS)
      : [],
    pressurePa:
      typeof configuracao_ia.pressao_Pa === 'number'
        ? Math.min(configuracao_ia.pressao_Pa, MAX_PRESSURE_PA)
        : null,
    reactionSubstance: content.substancia_reacao ?? null,
    temperatureK:
      typeof configuracao_ia.temperatura_K === 'number'
        ? Math.min(configuracao_ia.temperatura_K, MAX_TEMPERATURE_K)
        : null,
    timestamp: timestamp_atualizacao,
  };
}
