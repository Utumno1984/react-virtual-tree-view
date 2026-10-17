import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DraggableTreeView } from "../src";
import type { RenderNodeState, TreeChangeEvent, TreeNode } from "../src";
import { DatasetBar } from "./data/DatasetBar";
import { DEEP_LEVELS, createDataset, flattenIds } from "./data/dataSwapPresets";
import type { DatasetName } from "./data/dataSwapPresets";

const Icon = ({ isExpanded }: RenderNodeState) =>
  isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />;

function DraggableDataSwapDemo({ maxDepth }: { maxDepth?: number }) {
  const [name, setName] = useState<DatasetName>("small");
  const [data, setData] = useState<TreeNode[]>(() => createDataset("small"));
  const [lastEvent, setLastEvent] = useState<TreeChangeEvent | null>(null);
  const [lastIds, setLastIds] = useState("");
  return (
    <div className="w-80 space-y-2">
      <DatasetBar
        active={name}
        onPick={(next) => {
          setName(next);
          setLastEvent(null);
          setLastIds("");
          // A brand new tree from the preset (a previous reorder is discarded); no remount.
          setData(createDataset(next));
        }}
      />
      <DraggableTreeView
        data={data}
        height={320}
        maxDepth={maxDepth}
        defaultExpandedIds={["a-docs"]}
        aria-label="Swappable draggable tree"
        onTreeChange={(tree, event) => {
          setLastEvent(event);
          setLastIds(flattenIds(tree).join(","));
          setData(tree);
        }}
        className="rounded border border-gray-200 bg-white p-2 text-sm text-gray-800"
        rowClassName={(state) =>
          `flex items-center gap-1 rounded px-1 py-1 hover:bg-gray-100 ${
            state.isDisabled ? "text-gray-400" : "cursor-grab"
          }`
        }
        renderIcon={Icon}
        emptyState={
          <p data-testid="empty-state" className="p-2 text-sm text-gray-500">
            Empty tree
          </p>
        }
      />
      <p data-testid="active-dataset" className="text-xs text-gray-600">
        {name}
      </p>
      <pre data-testid="last-event" className="rounded bg-gray-50 p-2 text-xs text-gray-700">
        {lastEvent ? `onTreeChange ${JSON.stringify(lastEvent)}` : "onTreeChange: none yet"}
      </pre>
      <div data-testid="last-tree-ids" data-ids={lastIds} hidden />
    </div>
  );
}

const meta = {
  title: "DraggableTreeView/DataSwap",
  component: DraggableDataSwapDemo,
  decorators: [
    (Story) => (
      <>
        <style>{`[data-dragging] { opacity: 0.4; } [data-drag-overlay] { background: #dbeafe; box-shadow: 0 4px 12px rgb(0 0 0 / 0.2); }`}</style>
        <Story />
      </>
    ),
  ],
} satisfies Meta<typeof DraggableDataSwapDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Same buttons as `TreeView/DataSwap`, on a `DraggableTreeView` with `maxDepth={6}` (the
 * `deep` preset reaches exactly that depth). Each click recreates the preset from scratch,
 * so a reorder made on `small` is gone when you come back to it. `defaultExpandedIds` is
 * read on mount only: after a swap the new tree starts collapsed.
 *
 * Note: the development warning "data already exceeds maxDepth" is evaluated when
 * `maxDepth` changes, not when `data` changes, so swapping to a tree deeper than the limit
 * does not warn (tracked in ticket #45).
 */
export const Default: Story = {
  args: { maxDepth: DEEP_LEVELS },
};
