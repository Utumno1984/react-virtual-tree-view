/**
 * A fake "database" for the StatePersistence story.
 *
 * `localStorage` is only a stand-in for a real store: in production `saveState` would be an API
 * call (possibly debounced by the consumer) and `loadState` a fetch done before mounting the tree.
 */
export const STORAGE_KEY = "rvtv-demo:state-persistence";

export interface LoadResult {
  /** The parsed JSON, exactly as stored (it may have any shape). `undefined` when nothing usable. */
  state: unknown;
  /** Raw text of the key, `null` when absent or unreadable. */
  raw: string | null;
  /** Human-readable problem (storage unavailable, value is not JSON), `null` when all fine. */
  error: string | null;
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Reads and parses the saved state. Never throws. */
export function loadState(): LoadResult {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    return {
      state: undefined,
      raw: null,
      error: `Storage unavailable: ${message(error)}`,
    };
  }
  if (raw === null) return { state: undefined, raw, error: null };
  try {
    return { state: JSON.parse(raw) as unknown, raw, error: null };
  } catch {
    return {
      state: undefined,
      raw,
      error: "The stored value is not valid JSON and was ignored.",
    };
  }
}

/** Serializes and stores the state. Returns an error message, or `null` on success. Never throws. */
export function saveState(state: unknown): {
  raw: string | null;
  error: string | null;
} {
  try {
    const raw = JSON.stringify(state);
    window.localStorage.setItem(STORAGE_KEY, raw);
    return { raw, error: null };
  } catch (error) {
    return { raw: null, error: `Could not save the state: ${message(error)}` };
  }
}

/** Removes the saved state. Returns an error message, or `null` on success. Never throws. */
export function clearState(): string | null {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch (error) {
    return `Could not clear the storage: ${message(error)}`;
  }
}
