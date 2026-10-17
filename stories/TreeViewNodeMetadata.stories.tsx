import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { TreeView } from "../src";
import type { TreeNode } from "../src";
import { fileTree } from "./data/fileTree";
import { generateTree } from "./data/generateTree";
import type { FileMeta } from "./data/generateTree";

const largeTree = generateTree({ count: 1500, maxDepth: 4, seed: 21, withData: true });

const formatSize = (bytes: number) => {
  const fmt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${fmt(bytes / 1024)} KB`;
  return `${fmt(bytes / (1024 * 1024))} MB`;
};

interface Selected {
  id: TreeNode["id"];
  label: string;
  meta: FileMeta | undefined;
}

interface DemoProps {
  data: TreeNode<FileMeta>[];
  height?: number;
  defaultExpandedIds?: string[];
}

function NodeMetadataDemo({ data, height, defaultExpandedIds }: DemoProps) {
  const [selected, setSelected] = useState<Selected | null>(null);

  return (
    <div className="flex gap-4">
      <div className="w-72">
        <TreeView<FileMeta>
          data={data}
          height={height}
          defaultExpandedIds={defaultExpandedIds}
          aria-label="Files"
          emptyState={<p className="p-2 text-sm text-gray-500">Nessun file</p>}
          className="rounded border border-gray-200 bg-white p-2 text-sm text-gray-800"
          rowClassName={(state) =>
            `rounded px-1 py-1 hover:bg-gray-100 ${state.isDisabled ? "text-gray-400" : ""} ${
              state.isSelected ? "bg-blue-100" : ""
            } ${state.isFocused ? "outline outline-2 outline-blue-500" : ""}`
          }
          // `node` is the full TreeNode<FileMeta>: no lookup in the tree, no cast.
          onSelect={(id, node) => setSelected({ id, label: node.label, meta: node.data })}
        />
      </div>
      <aside
        data-testid="metadata-panel"
        aria-live="polite"
        className="w-72 rounded border border-gray-200 bg-gray-50 p-3 text-sm"
      >
        {selected === null ? (
          <p>Seleziona un nodo</p>
        ) : (
          <MetadataDetails id={selected.id} label={selected.label} meta={selected.meta} />
        )}
      </aside>
    </div>
  );
}

function MetadataDetails({
  id,
  label,
  meta,
}: {
  id: TreeNode["id"];
  label: string;
  meta: FileMeta | undefined;
}) {
  return (
    <div className="space-y-1">
      <p>
        <strong>Id:</strong> <span data-testid="meta-id">{String(id)}</span>
      </p>
      <p>
        <strong>Label:</strong> <span data-testid="meta-label">{label}</span>
      </p>
      {meta === undefined ? (
        <p data-testid="meta-empty">Nessun metadato</p>
      ) : (
        <>
          <p>
            <strong>Owner:</strong> <span data-testid="meta-owner">{meta.owner}</span>
          </p>
          <p>
            <strong>Status:</strong> <span data-testid="meta-status">{meta.status}</span>
          </p>
          <p>
            <strong>Size:</strong> <span data-testid="meta-size">{meta.sizeBytes}</span> bytes (
            {formatSize(meta.sizeBytes)})
          </p>
          <p>
            <strong>Updated:</strong> <span data-testid="meta-updated">{meta.updatedAt}</span> (
            {new Date(meta.updatedAt).toLocaleDateString("it-IT")})
          </p>
          <pre data-testid="meta-json" className="overflow-auto rounded bg-white p-2 text-xs">
            {JSON.stringify(meta, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}

const meta = {
  title: "TreeView/NodeMetadata",
  component: NodeMetadataDemo,
} satisfies Meta<typeof NodeMetadataDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Per-node metadata: give `TreeNode<T>.data` any payload and read it back from
 * `onSelect(id, node)` as `node.data` (typed `T | undefined`), without searching the tree.
 * The panel shows the selected node's id, label and `data`. Disabled nodes do not fire
 * `onSelect`; "scratch.txt" has no `data`.
 */
export const NodeMetadata: Story = {
  args: { data: fileTree, defaultExpandedIds: ["docs", "pics"] },
};

/** 1500 generated nodes with metadata: the list stays virtualized while you select at the bottom. */
export const NodeMetadataLargeTree: Story = {
  args: { data: largeTree, height: 300 },
};

/** Empty `data`: the tree shows `emptyState` and the panel its empty state. */
export const NodeMetadataEmpty: Story = {
  args: { data: [] },
};
