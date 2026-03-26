import { useEffect } from 'react';
import { useHostEnvironment } from './browser/hostEnvironment';
import { initializePostHog, type PublicEnv } from './posthog';

export function PostHogBootstrap({
  env,
  isDevelopment,
}: {
  env: PublicEnv;
  isDevelopment: boolean;
}) {
  const hostEnvironment = useHostEnvironment();

  useEffect(() => {
    if (hostEnvironment === 'unknown') {
      return;
    }

    if (hostEnvironment === 'standalone') {
      initializePostHog(env, isDevelopment);
      return;
    }

    let animationFrameId = 0;
    let nestedAnimationFrameId = 0;

    animationFrameId = window.requestAnimationFrame(() => {
      nestedAnimationFrameId = window.requestAnimationFrame(() => {
        initializePostHog(env, isDevelopment);
      });
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.cancelAnimationFrame(nestedAnimationFrameId);
    };
  }, [env, hostEnvironment, isDevelopment]);

  return null;
}
