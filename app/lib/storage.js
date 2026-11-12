// localStorage holds only per-browser view preferences (open tab, board split,
// compared companies). Access can throw (private mode, blocked storage) and is
// unavailable during server rendering, so every call is guarded.

export function readStorage(key) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Preferences are optional; ignore storage failures.
  }
}

export function readStorageJson(key) {
  const raw = readStorage(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
