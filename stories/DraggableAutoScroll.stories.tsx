import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState } from "react";
import { DraggableTreeView } from "../src";
import type { TreeChangeEvent, TreeNode } from "../src";
import { generateTree } from "./data/generateTree";

/** A flat list of `count` roots: every row is visible once the branches are expanded. */
function flatRoots(count: number): TreeNode[] {
  return Array.from({ length: count }, (_, i) => ({ id: `n${i}`, label: `Item ${i}` }));
}

interface DemoProps {
  count?: number;
  nested?: boolean;
  autoScroll?: boolean;
  autoScrollThreshold?: number;
  autoScrollMaxSpeed?: number;
  maxDepth?: number;
}

function AutoScrollDemo({ count = 1200, nested = false, ...rest }: DemoProps) {
  const initial = useMemo(
    () => (nested ? generateTree({ count, maxDepth: 3, seed: 7 }) : flatRoots(count)),
    [count, nested],
  );
  const [data, setData] = useState(initial);
  const [lastEvent, setLastEvent] = useState<TreeChangeEvent | null>(null);
  return (
    <div className="w-80 space-y-2">
      <p className="text-sm text-gray-700">
        {count} nodes in a 400 px container: drag a row and hold the pointer near the top or
        bottom edge to scroll.
      </p>
      <DraggableTreeView
        data={data}
        height={400}
        aria-label="Draggable tree with auto-scroll"
        onTreeChange={(tree, event) => {
          setLastEvent(event);
          setData(tree);
        }}
        className="rounded border border-gray-200 bg-white text-sm text-gray-800"
        rowClassName="flex items-center gap-1 px-2 hover:bg-gray-100 cursor-grab"
        {...rest}
      />
      <pre data-testid="last-event" className="rounded bg-gray-50 p-2 text-xs text-gray-700">
        {lastEvent ? `onTreeChange ${JSON.stringify(lastEvent)}` : "onTreeChange: none yet"}
      </pre>
    </div>
  );
}

const meta = {
  title: "DraggableTreeView/DraggableAutoScroll",
  component: AutoScrollDemo,
  decorators: [
    (Story) => (
      <>
        <style>{`[data-dragging] { opacity: 0.4; } [data-drag-overlay] { background: #dbeafe; box-shadow: 0 4px 12px rgb(0 0 0 / 0.2); }`}</style>
        <Story />
      </>
    ),
  ],
} satisfies Meta<typeof AutoScrollDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 1200 rows, 400 px container: hold the pointer in the 40 px band to scroll. */
export const Default: Story = {};

/** `autoScroll={false}`: the tree never scrolls on its own while dragging. */
export const Disabled: Story = {
  args: { autoScroll: false },
};

/** A short list (fits in the container): nothing to scroll. */
export const ShortList: Story = {
  args: { count: 8 },
};

/** Nested tree of 5000 nodes with `maxDepth`: projection stays consistent while scrolling. */
export const ManyNodesNested: Story = {
  args: { count: 5000, nested: true, maxDepth: 2 },
};
