import React from 'react';
import { SET_GLOBALS_EVENT_TYPE } from '../../types';

export type HostEnvironment = 'unknown' | 'chatgpt' | 'standalone';

const STANDALONE_FALLBACK_DELAY_MS = 750;

const HostEnvironmentContext = React.createContext<HostEnvironment>('unknown');

function resolveInitialHostEnvironment(): HostEnvironment {
  if (typeof window === 'undefined') {
    return 'unknown';
  }

  return window.openai ? 'chatgpt' : 'unknown';
}

export function HostEnvironmentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [hostEnvironment, setHostEnvironment] = React.useState<HostEnvironment>(
    resolveInitialHostEnvironment,
  );

  React.useEffect(() => {
    if (typeof window === 'undefined' || hostEnvironment === 'chatgpt') {
      return;
    }

    const resolveChatGptHost = () => {
      setHostEnvironment((currentEnvironment) =>
        currentEnvironment === 'chatgpt' ? currentEnvironment : 'chatgpt',
      );
    };

    const handleSetGlobals = () => {
      resolveChatGptHost();
    };

    window.addEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobals);

    if (hostEnvironment === 'standalone') {
      const intervalId = window.setInterval(() => {
        if (window.openai) {
          resolveChatGptHost();
        }
      }, 500);

      if (window.openai) {
        resolveChatGptHost();
      }

      return () => {
        window.clearInterval(intervalId);
        window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobals);
      };
    }

    let animationFrameId = 0;
    const pollForHostBridge = () => {
      if (window.openai) {
        resolveChatGptHost();
        return;
      }

      animationFrameId = window.requestAnimationFrame(pollForHostBridge);
    };

    pollForHostBridge();

    const timeoutId = window.setTimeout(() => {
      setHostEnvironment((currentEnvironment) => {
        if (currentEnvironment === 'chatgpt' || window.openai) {
          return 'chatgpt';
        }

        return 'standalone';
      });
    }, STANDALONE_FALLBACK_DELAY_MS);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(timeoutId);
      window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobals);
    };
  }, [hostEnvironment]);

  return (
    <HostEnvironmentContext.Provider value={hostEnvironment}>
      {children}
    </HostEnvironmentContext.Provider>
  );
}

export function useHostEnvironment(): HostEnvironment {
  return React.useContext(HostEnvironmentContext);
}
