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

/**
 * 60 roots (`r0`..`r59`); `r30` is expanded with 8 children, one of which (`r30-c0`) holds a
 * 3-level subtree. Enough rows for the virtualization window to be smaller than the list.
 */
const expandedSubtreeTree: TreeNode[] = Array.from({ length: 60 }, (_, i): TreeNode => {
  const id = `r${i}`;
  if (i === 59) {
    // The last root is expanded too: hiding its children shrinks the list at the very end.
    return {
      id,
      label: `Root ${i}`,
      children: Array.from({ length: 6 }, (_, c): TreeNode => ({ id: `${id}-c${c}`, label: `Child ${c}` })),
    };
  }
  if (i !== 30) return { id, label: `Root ${i}` };
  return {
    id,
    label: `Root ${i}`,
    children: Array.from({ length: 8 }, (_, c): TreeNode => {
      const childId = `${id}-c${c}`;
      if (c !== 0) return { id: childId, label: `Child ${c}` };
      return {
        id: childId,
        label: "Child 0",
        children: [
          {
            id: `${childId}-g0`,
            label: "Grandchild",
            children: [{ id: `${childId}-g0-x`, label: "Great-grandchild" }],
          },
        ],
      };
    }),
  };
});

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
        renderDropIndicator={(projection) =>
          projection.zone === "inside" ? (
            <div className="h-full rounded border-2 border-blue-500 bg-blue-500/10" />
          ) : (
            <div className="-mt-px flex items-center">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="h-0.5 flex-1 bg-blue-500" />
            </div>
          )
        }
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
 * Drag a row over another: the upper quarter of the target row drops it as the previous
 * sibling (line above), the middle half makes it the first child (the whole row is
 * highlighted), the lower quarter makes it the next sibling (line below). The indicator shows
 * the result live; the last `onTreeChange` event is logged below.
 */
export const Draggable: Story = {
  args: { initialData: initialTree, defaultExpandedIds: ["p", "C", "docs"] },
};

/** "Documents" and "Charlie" start collapsed: dropping on the middle of their row expands them on drop. */
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

/**
 * Dragging an expanded node: its descendants are hidden while the drag is active and come
 * back, still expanded, wherever the node is dropped. `r30` is expanded in the middle of a
 * virtualized list.
 */
export const DragExpandedNode: Story = {
  args: {
    initialData: expandedSubtreeTree,
    defaultExpandedIds: ["r30", "r30-c0", "r30-c0-g0", "r59"],
    height: 300,
  },
};
