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
  const [selected, setSelected] = useState("none");
  const [expandedEvents, setExpandedEvents] = useState(0);
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
        height={400}
        maxDepth={maxDepth}
        defaultExpandedIds={["a-docs"]}
        aria-label="Swappable draggable tree"
        onSelect={(id, node) => setSelected(`${id}|${node.label}`)}
        onExpandedChange={() => setExpandedEvents((count) => count + 1)}
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
      <p data-testid="selected" className="text-xs text-gray-600">
        {selected}
      </p>
      <p data-testid="expanded-events" className="text-xs text-gray-600">
        {expandedEvents}
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
 * Stale ids are cleaned up like in `TreeView/DataSwap`: click a `small` node and then
 * `large` (the uncontrolled selection is reset, no `treeitem` is `aria-selected`); click
 * `a-cv` and then `variant` (same id in both trees: it stays selected, with the new label).
 * Expanded and focused ids that disappear are dropped silently, without `onExpandedChange`
 * (the counter below the tree does not move), and exactly one `treeitem` keeps `tabindex=0`.
 * A drop (`onTreeChange`) keeps all ids, so it never resets anything.
 *
 * In development, swapping to a tree deeper than `maxDepth` logs the "data already exceeds
 * maxDepth" warning once. It re-arms after the data returns within the limit.
 */
export const Default: Story = {
  args: { maxDepth: DEEP_LEVELS },
};
