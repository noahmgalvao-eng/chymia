import posthog from 'posthog-js';

export type TelemetryEventName =
  | 'ELEMENT_SELECT'
  | 'XRAY_TOGGLE'
  | 'SIMULATION_PAUSE_TOGGLE'
  | 'SIMULATION_SPEED_CHANGE'
  | 'RECORD_START'
  | 'RECORD_STOP'
  | 'FULLSCREEN_TOGGLE'
  | 'AI_INFO_CLICK'
  | 'AI_PROMPT_HELP_CLICK'
  | 'SESSION_END';

export type TelemetryData = Record<string, unknown>;

const SESSION_ID_PLACEHOLDER = 'posthog-session-unavailable';

function getSessionId(): string {
  try {
    const currentSessionId = posthog.get_session_id?.();
    return typeof currentSessionId === 'string' && currentSessionId.length > 0
      ? currentSessionId
      : SESSION_ID_PLACEHOLDER;
  } catch {
    return SESSION_ID_PLACEHOLDER;
  }
}

export function useTelemetry() {
  const logEvent = (event: TelemetryEventName, data?: TelemetryData) => {
    try {
      posthog.capture(event, data);
    } catch {
      // Telemetry failures must not affect the widget UX.
    }
  };

  return {
    sessionId: getSessionId(),
    logEvent,
  };
}
