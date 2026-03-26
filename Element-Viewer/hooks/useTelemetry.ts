import { usePostHog } from '@posthog/react';
import { hasInitializedPostHog } from '../infrastructure/posthog';

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

export function useTelemetry() {
  const posthog = usePostHog();

  const logEvent = (event: TelemetryEventName, data?: TelemetryData) => {
    if (!hasInitializedPostHog()) {
      return;
    }

    try {
      posthog?.capture(event, data);
    } catch {
      // Telemetry failures must not affect the widget UX.
    }
  };

  let sessionId = SESSION_ID_PLACEHOLDER;

  if (hasInitializedPostHog()) {
    try {
      const currentSessionId = posthog?.get_session_id?.();
      if (typeof currentSessionId === 'string' && currentSessionId.length > 0) {
        sessionId = currentSessionId;
      }
    } catch {
      sessionId = SESSION_ID_PLACEHOLDER;
    }
  }

  return {
    sessionId,
    logEvent,
  };
}
