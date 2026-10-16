import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DraggableTreeView } from "../src";
import type { RenderNodeState, TreeChangeEvent, TreeNode } from "../src";

const initialTree: TreeNode[] = [
  {
    id: "p",
    label: "Projects",
    children: [
      { id: "A", label: "Alpha" },
      { id: "B", label: "Bravo" },
      { id: "C", label: "Charlie", children: [{ id: "C1", label: "Charlie child" }] },
    ],
  },
  {
    id: "docs",
    label: "Documents",
    children: [
      { id: "cv", label: "CV.pdf" },
      { id: "notes", label: "notes.txt" },
    ],
  },
  { id: "misc", label: "Misc" },
  { id: "tail", label: "Tail" },
];

const Icon = ({ isExpanded }: RenderNodeState) =>
  isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />;

function MaxDepthDemo({ maxDepth }: { maxDepth?: number }) {
  const [data, setData] = useState(initialTree);
  const [lastEvent, setLastEvent] = useState<TreeChangeEvent | null>(null);
  return (
    <div className="w-80 space-y-2">
      <p data-testid="max-depth" className="text-sm text-gray-700">
        maxDepth = {maxDepth === undefined ? "none" : maxDepth} (roots are depth 0, the dragged
        subtree counts)
      </p>
      <DraggableTreeView
        data={data}
        defaultExpandedIds={["p", "C", "docs"]}
        maxDepth={maxDepth}
        aria-label="Draggable tree with a depth limit"
        onTreeChange={(tree, event) => {
          setLastEvent(event);
          setData(tree);
        }}
        className="rounded border border-gray-200 bg-white p-2 text-sm text-gray-800"
        rowClassName={(state) =>
          `flex items-center gap-1 rounded px-1 py-1 hover:bg-gray-100 ${
            state.isDisabled ? "text-gray-400" : "cursor-grab"
          }`
        }
        renderIcon={Icon}
        renderDropIndicator={(projection) => (
          <div
            className={`-mt-px flex items-center ${projection.clamped ? "text-orange-500" : "text-blue-500"}`}
          >
            <span className="h-2 w-2 rounded-full bg-current" />
            <span className="h-0.5 flex-1 bg-current" />
            {projection.clamped ? <span className="ml-1 text-xs">max depth</span> : null}
          </div>
        )}
      />
      <pre data-testid="last-event" className="rounded bg-gray-50 p-2 text-xs text-gray-700">
        {lastEvent ? `onTreeChange ${JSON.stringify(lastEvent)}` : "onTreeChange: none yet"}
      </pre>
    </div>
  );
}

const meta = {
  title: "DraggableTreeView/DraggableMaxDepth",
  component: MaxDepthDemo,
  decorators: [
    (Story) => (
      <>
        <style>{`[data-dragging] { opacity: 0.4; } [data-drag-overlay] { background: #dbeafe; box-shadow: 0 4px 12px rgb(0 0 0 / 0.2); }`}</style>
        <Story />
      </>
    ),
  ],
} satisfies Meta<typeof MaxDepthDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * `maxDepth={2}`: drag a node to the right to nest it; the projection stops at depth 2 (or
 * lower if the dragged node has children) and the indicator turns orange with
 * `data-depth-clamped="true"`. The drop is never refused, it lands at the cut depth.
 */
export const Default: Story = {
  args: { maxDepth: 2 },
};

/** `maxDepth={0}`: only reordering among the roots is possible. */
export const RootsOnly: Story = {
  args: { maxDepth: 0 },
};
