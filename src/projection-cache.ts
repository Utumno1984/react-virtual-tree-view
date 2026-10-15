/**
 * Remembers the result of the last drop projection. While the dragged node, the row under
 * the pointer and the horizontal offset (in indentation steps) stay the same nothing can
 * change, so `get` returns the previous result without calling `compute` again. The dragged
 * node is part of the key: two drags in a row over the same row must not share a result.
 */
export interface ProjectionCache<R, K = unknown> {
  get: (activeId: K, overIndex: number, steps: number, compute: () => R) => R;
}

export function createProjectionCache<R, K = unknown>(): ProjectionCache<R, K> {
  let hasValue = false;
  let lastActive: K | undefined;
  let lastOver = -1;
  let lastSteps = 0;
  let last: R;
  return {
    get(activeId, overIndex, steps, compute) {
      if (hasValue && activeId === lastActive && overIndex === lastOver && steps === lastSteps) {
        return last;
      }
      last = compute();
      hasValue = true;
      lastActive = activeId;
      lastOver = overIndex;
      lastSteps = steps;
      return last;
    },
  };
}
