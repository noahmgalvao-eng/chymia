export function readStructuredContentFromOpenAi(): unknown {
  if (typeof window === 'undefined' || !window.openai) {
    return null;
  }

  const openaiWithStructured = window.openai as typeof window.openai & {
    structuredContent?: unknown;
  };

  if (
    openaiWithStructured.structuredContent &&
    typeof openaiWithStructured.structuredContent === 'object'
  ) {
    return openaiWithStructured.structuredContent;
  }

  if (
    openaiWithStructured.toolOutput &&
    typeof openaiWithStructured.toolOutput === 'object'
  ) {
    const toolOutput = openaiWithStructured.toolOutput as Record<string, unknown>;
    if (
      toolOutput.structuredContent &&
      typeof toolOutput.structuredContent === 'object'
    ) {
      return toolOutput.structuredContent;
    }

    return toolOutput;
  }

  return null;
}
