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
 * Shows where the dragged node would land. For the sibling zones (`projection.zone` is
 * `"before"` / `"after"`) it is a line between two rows, positioned with `top` and indented to
 * the projected depth (`data-drop-mode="line"`). For `"inside"` ("becomes a child") it
 * covers the whole hovered row (`data-drop-mode="child"`), so the two cases cannot be confused.
 * Subscribes to the store itself, so a projection change re-renders only this element, not the
 * list.
 */
export function DropIndicator({ store, rowHeight, indentation, render }: DropIndicatorProps) {
  const preview = useSyncExternalStore(store.subscribe, store.get, store.get);
  if (!preview) return null;
  const { projection, slot } = preview;
  const child = projection.zone === "inside";
  return (
    <div
      aria-hidden="true"
      data-drop-indicator=""
      data-drop-mode={child ? "child" : "line"}
      data-drop-zone={projection.zone}
      data-projected-depth={projection.depth}
      data-depth-clamped={projection.clamped ? "true" : "false"}
      style={{
        position: "absolute",
        top: slot * rowHeight,
        // The child highlight spans the whole row (its depth is the child's, one level in).
        left: child ? 0 : projection.depth * indentation,
        right: 0,
        height: child ? rowHeight : undefined,
        pointerEvents: "none",
      }}
    >
      {render ? (
        render(projection)
      ) : child ? (
        <div
          style={{
            height: "100%",
            boxSizing: "border-box",
            border: "2px solid #3b82f6",
            background: "rgba(59, 130, 246, 0.12)",
            borderRadius: 4,
          }}
        />
      ) : (
        <div style={{ height: 2, marginTop: -1, background: "#3b82f6", borderRadius: 1 }} />
      )}
    </div>
  );
}
