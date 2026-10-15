import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findDuplicateIds, flattenTree } from "./tree-utils";
import type { TreeId } from "./tree-utils";
import type { RenderNodeState, TreeNode, TreeViewProps } from "./types";

const DEFAULT_INDENTATION = 24;

function isDevelopment(): boolean {
  // `process.env.NODE_ENV` must stay a literal expression: bundlers (Vite, webpack)
  // replace exactly that text, and `process` itself does not exist in the browser.
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

export function TreeView<T = unknown>({
  data,
  defaultExpandedIds,
  onExpandedChange,
  indentation = DEFAULT_INDENTATION,
  renderNode,
  renderIcon,
  className,
  rowClassName,
  emptyState,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: TreeViewProps<T>) {
  const [expanded, setExpanded] = useState<ReadonlySet<TreeId>>(
    () => new Set(defaultExpandedIds),
  );

  const rows = useMemo(() => {
    const flat = flattenTree(data, expanded);
    // aria-setsize / aria-posinset in one pass: `parents[d]` is the node at
    // depth d of the current path, `counters[d]` the siblings seen at depth d.
    const parents: TreeNode<T>[] = [];
    const counters: number[] = [];
    const seen = new Set<TreeId>();
    return flat.map((item) => {
      const { depth } = item;
      counters.length = depth + 1;
      counters[depth] = (counters[depth] ?? 0) + 1;
      parents.length = depth;
      parents[depth] = item.node;
      const setSize =
        depth === 0 ? data.length : (parents[depth - 1]?.children?.length ?? 1);
      // Keys are prefixed by id type (so 1 and "1" differ); rows with a repeated id
      // get a "d:<row index>" key, a prefix no regular key can have.
      const key = seen.has(item.id)
        ? `d:${item.index}`
        : `${typeof item.id === "number" ? "n" : "s"}:${String(item.id)}`;
      seen.add(item.id);
      return { item, key, setSize, posInSet: counters[depth] };
    });
  }, [data, expanded]);

  const warnedDuplicates = useRef("");

  useEffect(() => {
    if (!isDevelopment()) return;
    const duplicates = findDuplicateIds(data);
    // Refs survive StrictMode's simulated unmount/remount, so the same set of
    // duplicates is reported once, not once per effect run or per new `data` identity.
    const signature = duplicates.map(String).join("\u0000");
    if (signature === warnedDuplicates.current) return;
    warnedDuplicates.current = signature;
    if (duplicates.length > 0) {
      console.warn(
        `[react-virtual-tree-view] Duplicate node ids found: ${duplicates.map(String).join(", ")}. ` +
          "Ids must be unique.",
      );
    }
  }, [data]);

  const toggle = useCallback(
    (id: TreeId) => {
      const next = new Set(expanded);
      if (!next.delete(id)) next.add(id);
      setExpanded(next);
      onExpandedChange?.([...next]);
    },
    [expanded, onExpandedChange],
  );

  // Note: the toggle is aria-hidden and click-only on purpose; keyboard and AT
  // expansion arrive with the keyboard-navigation ticket. Ids in `expandedIds`
  // that no longer exist in `data` are ignored but kept in the set.
  return (
    <>
      <div
        role="tree"
        className={className}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
      >
        {rows.map(({ item, key, setSize, posInSet }) => {
          const { node, depth, hasChildren } = item;
          const isExpanded = hasChildren && expanded.has(node.id);
          const isDisabled = !!node.isDisabled;
          const state: RenderNodeState = {
            depth,
            isExpanded,
            isDisabled,
            hasChildren,
          };
          const rowClass =
            typeof rowClassName === "function"
              ? rowClassName(state)
              : rowClassName;
          return (
            <div
              key={key}
              role="treeitem"
              className={rowClass}
              data-node-id={String(node.id)}
              data-disabled={isDisabled ? "" : undefined}
              aria-level={depth + 1}
              aria-setsize={setSize}
              aria-posinset={posInSet}
              aria-expanded={hasChildren ? isExpanded : undefined}
              aria-disabled={isDisabled ? true : undefined}
              style={{ paddingLeft: depth * indentation }}
            >
              <span
                data-toggle=""
                aria-hidden="true"
                onClick={hasChildren ? () => toggle(node.id) : undefined}
                style={{
                  display: "inline-block",
                  minWidth: "1em",
                  cursor: hasChildren ? "pointer" : undefined,
                }}
              >
                {hasChildren
                  ? renderIcon
                    ? renderIcon(state)
                    : isExpanded
                      ? "▾"
                      : "▸"
                  : null}
              </span>
              {renderNode ? renderNode(node, state) : node.label}
            </div>
          );
        })}
      </div>
      {rows.length === 0 && emptyState}
    </>
  );
}
