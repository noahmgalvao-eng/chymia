export function readSessionBoolean(key: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeSessionBoolean(key: string, value: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (value) {
      window.sessionStorage.setItem(key, '1');
      return;
    }

    window.sessionStorage.removeItem(key);
  } catch {
    // Storage access can fail inside sandboxed environments.
  }
}
