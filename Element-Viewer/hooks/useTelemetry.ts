import { useEffect, useRef } from 'react';

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

export interface TelemetryEventPayload {
  sessionId: string;
  event: TelemetryEventName;
  timestamp: string;
  data: TelemetryData | null;
  userAgent: string;
}

// Override with VITE_API_BASE_URL only if you need a telemetry endpoint different from the
// Vercel production URL of the MCP server.
const telemetryEnv = import.meta.env as Record<string, string | undefined>;
const API_BASE_URL =
  telemetryEnv.VITE_API_BASE_URL ||
  (telemetryEnv.VITE_VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${telemetryEnv.VITE_VERCEL_PROJECT_PRODUCTION_URL}`
    : '');

const LOGS_ENDPOINT = API_BASE_URL ? `${API_BASE_URL.replace(/\/$/u, '')}/logs` : '';

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createPayload(
  sessionId: string,
  event: TelemetryEventName,
  data?: TelemetryData
): TelemetryEventPayload {
  return {
    sessionId,
    event,
    timestamp: new Date().toISOString(),
    data: data ?? null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
  };
}

function sendWithFetch(payload: TelemetryEventPayload) {
  if (!LOGS_ENDPOINT) {
    return;
  }

  try {
    void fetch(LOGS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Telemetry failures must not affect the widget UX.
    });
  } catch {
    // Telemetry failures must not affect the widget UX.
  }
}

export function useTelemetry() {
  const sessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(Date.now());

  if (sessionIdRef.current === null) {
    sessionIdRef.current = createSessionId();
  }

  const logEvent = (event: TelemetryEventName, data?: TelemetryData) => {
    sendWithFetch(createPayload(sessionIdRef.current!, event, data));
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      const payload = createPayload(sessionIdRef.current!, 'SESSION_END', {
        durationSeconds: Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)),
      });

      if (!LOGS_ENDPOINT) {
        return;
      }

      try {
        if (typeof navigator.sendBeacon === 'function') {
          const beaconBody = new Blob([JSON.stringify(payload)], {
            type: 'application/json',
          });
          const didSend = navigator.sendBeacon(LOGS_ENDPOINT, beaconBody);
          if (didSend) {
            return;
          }
        }
      } catch {
        // Fall back to fetch keepalive below.
      }

      sendWithFetch(payload);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return {
    sessionId: sessionIdRef.current,
    logEvent,
  };
}
