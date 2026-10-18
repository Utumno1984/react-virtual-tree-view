/**
 * Remembers the result of the last drop projection. While the dragged node, the row under
 * the pointer and the zone of that row (upper / middle / lower band) stay the same nothing can
 * change, so `get` returns the previous result without calling `compute` again. The dragged
 * node is part of the key: two drags in a row over the same row must not share a result.
 */
export interface ProjectionCache<R, K = unknown, Z = unknown> {
  get: (activeId: K, overIndex: number, zone: Z, compute: () => R) => R;
}

export function createProjectionCache<R, K = unknown, Z = unknown>(): ProjectionCache<R, K, Z> {
  let hasValue = false;
  let lastActive: K | undefined;
  let lastOver = -1;
  let lastZone: Z | undefined;
  let last: R;
  return {
    get(activeId, overIndex, zone, compute) {
      if (hasValue && activeId === lastActive && overIndex === lastOver && zone === lastZone) {
        return last;
      }
      last = compute();
      hasValue = true;
      lastActive = activeId;
      lastOver = overIndex;
      lastZone = zone;
      return last;
    },
  };
}
