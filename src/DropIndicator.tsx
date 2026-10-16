import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { PreviewStore } from "./dnd-internal";
import type { Projection } from "./tree-utils";

interface DropIndicatorProps {
  store: PreviewStore;
  rowHeight: number;
  indentation: number;
  render?: (projection: Projection) => ReactNode;
}

/**
 * Shows where the dragged node would land: positioned with `top` (between the two rows)
 * and indented to the projected depth. Subscribes to the store itself, so a projection
 * change re-renders only this element, not the list.
 */
export function DropIndicator({ store, rowHeight, indentation, render }: DropIndicatorProps) {
  const preview = useSyncExternalStore(store.subscribe, store.get, store.get);
  if (!preview) return null;
  const { projection, slot } = preview;
  return (
    <div
      aria-hidden="true"
      data-drop-indicator=""
      data-projected-depth={projection.depth}
      data-depth-clamped={projection.clamped ? "true" : "false"}
      style={{
        position: "absolute",
        top: slot * rowHeight,
        left: projection.depth * indentation,
        right: 0,
        pointerEvents: "none",
      }}
    >
      {render ? (
        render(projection)
      ) : (
        <div style={{ height: 2, marginTop: -1, background: "#3b82f6", borderRadius: 1 }} />
      )}
    </div>
  );
}
