import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DraggableTreeView } from "../src";
import type { RenderNodeState, TreeChangeEvent, TreeNode } from "../src";
import { generateTree } from "./data/generateTree";

const initialTree: TreeNode[] = [
  {
    id: "p",
    label: "Projects",
    children: [
      { id: "A", label: "Alpha" },
      { id: "B", label: "Bravo" },
      { id: "C", label: "Charlie", children: [{ id: "C1", label: "Charlie child" }] },
      { id: "D", label: "Delta (locked)", isDisabled: true },
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
];

const largeTree = generateTree({ count: 1500, maxDepth: 4, seed: 11 });

const Icon = ({ isExpanded }: RenderNodeState) =>
  isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />;

interface DemoProps {
  initialData: TreeNode[];
  defaultExpandedIds?: string[];
  initialQuery?: string;
  height?: number;
  /** When false the consumer ignores `onTreeChange`, so the tree never changes. */
  applyChanges?: boolean;
}

function DraggableDemo({
  initialData,
  defaultExpandedIds,
  initialQuery = "",
  height,
  applyChanges = true,
}: DemoProps) {
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState(initialQuery);
  const [lastEvent, setLastEvent] = useState<TreeChangeEvent | null>(null);
  return (
    <div className="w-80 space-y-2">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search..."
        aria-label="Search the tree"
        data-testid="search-input"
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
      />
      <DraggableTreeView
        data={data}
        searchQuery={query}
        defaultExpandedIds={defaultExpandedIds}
        height={height}
        aria-label="Draggable tree"
        onTreeChange={(tree, event) => {
          setLastEvent(event);
          if (applyChanges) setData(tree);
        }}
        className="rounded border border-gray-200 bg-white p-2 text-sm text-gray-800"
        rowClassName={(state) =>
          `flex items-center gap-1 rounded px-1 py-1 hover:bg-gray-100 ${
            state.isDisabled ? "text-gray-400" : "cursor-grab"
          }`
        }
        renderIcon={Icon}
        renderDropIndicator={() => (
          <div className="-mt-px flex items-center">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="h-0.5 flex-1 bg-blue-500" />
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
  title: "DraggableTreeView/Draggable",
  component: DraggableDemo,
  // The dragged row fades; the overlay carries the visible copy.
  decorators: [
    (Story) => (
      <>
        <style>{`[data-dragging] { opacity: 0.4; } [data-drag-overlay] { background: #dbeafe; box-shadow: 0 4px 12px rgb(0 0 0 / 0.2); }`}</style>
        <Story />
      </>
    ),
  ],
} satisfies Meta<typeof DraggableDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Drag a row onto another to reorder; move the pointer right to nest under the previous row
 * and left to move up a level. The indicator shows the projected depth live; the last
 * `onTreeChange` event is logged below.
 */
export const Draggable: Story = {
  args: { initialData: initialTree, defaultExpandedIds: ["p", "C", "docs"] },
};

/** "Documents" and "Charlie" start collapsed: nesting a node under them expands them on drop. */
export const NestUnderCollapsed: Story = {
  args: { initialData: initialTree, defaultExpandedIds: ["p"] },
};

/** `data` is controlled: the consumer ignores `onTreeChange`, so rows snap back after a drop. */
export const IgnoredChanges: Story = {
  args: { initialData: initialTree, defaultExpandedIds: ["p", "C", "docs"], applyChanges: false },
};

/** With a search query active nothing can be dragged (rows have `data-drag-disabled`). */
export const DragDisabledWhileSearching: Story = {
  args: { initialData: initialTree, defaultExpandedIds: ["p", "C", "docs"], initialQuery: "a" },
};

/** 1500 nodes: the drop target is resolved once on release, not on every pointer move. */
export const LargeTree: Story = {
  args: { initialData: largeTree, height: 400 },
};
