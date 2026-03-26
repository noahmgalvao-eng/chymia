import { useEffect } from 'react';
import { applyDocumentTheme } from '@openai/apps-sdk-ui/theme';

export function useDocumentTheme(theme: 'light' | 'dark' | 'system' | null | undefined) {
  useEffect(() => {
    const resolveSystemTheme = () =>
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

    const resolvedTheme = theme === 'light' || theme === 'dark' ? theme : resolveSystemTheme();
    applyDocumentTheme(resolvedTheme);

    if (theme === 'light' || theme === 'dark') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => applyDocumentTheme(resolveSystemTheme());

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [theme]);
}
