/**
 * Remembers the result of the last drop projection. While the pointer stays on the same
 * row and the horizontal offset maps to the same number of indentation steps nothing can
 * change, so `get` returns the previous result without calling `compute` again.
 */
export interface ProjectionCache<R> {
  get: (overIndex: number, steps: number, compute: () => R) => R;
}

export function createProjectionCache<R>(): ProjectionCache<R> {
  let hasValue = false;
  let lastOver = -1;
  let lastSteps = 0;
  let last: R;
  return {
    get(overIndex, steps, compute) {
      if (hasValue && overIndex === lastOver && steps === lastSteps) return last;
      last = compute();
      hasValue = true;
      lastOver = overIndex;
      lastSteps = steps;
      return last;
    },
  };
}
