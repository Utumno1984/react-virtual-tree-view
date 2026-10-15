import { useCallback, useEffect, useMemo, useState } from "react";
import { findDuplicateIds, flattenTree } from "./tree-utils";
import type { TreeId } from "./tree-utils";
import type { RenderNodeState, TreeNode, TreeViewProps } from "./types";

const DEFAULT_INDENTATION = 24;

function isDevelopment(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV !== "production";
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
      const setSize = depth === 0 ? data.length : (parents[depth - 1]?.children?.length ?? 1);
      // duplicate ids must not produce duplicate React keys
      const key = seen.has(item.id) ? `${String(item.id)}#${item.index}` : item.id;
      seen.add(item.id);
      return { item, key, setSize, posInSet: counters[depth] };
    });
  }, [data, expanded]);

  useEffect(() => {
    if (!isDevelopment()) return;
    const duplicates = findDuplicateIds(data);
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

  return (
    <div role="tree" className={className}>
      {rows.length === 0 && emptyState}
      {rows.map(({ item, key, setSize, posInSet }) => {
        const { node, depth, hasChildren } = item;
        const isExpanded = hasChildren && expanded.has(node.id);
        const isDisabled = !!node.isDisabled;
        const state: RenderNodeState = { depth, isExpanded, isDisabled, hasChildren };
        const rowClass = typeof rowClassName === "function" ? rowClassName(state) : rowClassName;
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
              {hasChildren ? (renderIcon ? renderIcon(state) : isExpanded ? "▾" : "▸") : null}
            </span>
            {renderNode ? renderNode(node, state) : node.label}
          </div>
        );
      })}
    </div>
  );
}
