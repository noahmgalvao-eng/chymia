import { useCallback, useEffect, useState, type RefObject } from 'react';
import {
  STANDALONE_HOME_ROUTE,
  getStandaloneRouteFromLocation,
  normalizeStandaloneRoute,
  type StandaloneRoute,
} from '../app/standalone';

export function useStandaloneRouting({
  routeTitles,
  scrollContainerRef,
}: {
  routeTitles: Record<StandaloneRoute, string>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}) {
  const [standaloneRoute, setStandaloneRoute] = useState<StandaloneRoute>(getStandaloneRouteFromLocation);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncRouteWithLocation = (replace = false) => {
      const nextRoute = getStandaloneRouteFromLocation();
      setStandaloneRoute((previous) => previous === nextRoute ? previous : nextRoute);

      if (window.location.pathname === nextRoute) {
        return;
      }

      window.history[replace ? 'replaceState' : 'pushState'](window.history.state, '', nextRoute);
    };

    syncRouteWithLocation(true);

    const handlePopState = () => {
      syncRouteWithLocation(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.title = routeTitles[standaloneRoute];
  }, [routeTitles, standaloneRoute]);

  useEffect(() => {
    if (standaloneRoute === STANDALONE_HOME_ROUTE) {
      return;
    }

    scrollContainerRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }, [scrollContainerRef, standaloneRoute]);

  const navigateStandalone = useCallback((route: StandaloneRoute) => {
    if (typeof window === 'undefined') {
      return;
    }

    const nextRoute = normalizeStandaloneRoute(route);
    const currentRoute = getStandaloneRouteFromLocation();

    if (currentRoute === nextRoute && window.location.pathname === nextRoute) {
      setStandaloneRoute(nextRoute);
      return;
    }

    window.history.pushState(window.history.state, '', nextRoute);
    setStandaloneRoute(nextRoute);
  }, []);

  return {
    standaloneRoute,
    navigateStandalone,
  };
}
