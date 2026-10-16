import type { Meta, StoryObj } from "@storybook/react-vite";
import { TreeView } from "../src";
import type { TreeNode } from "../src";

// Two nodes share the id "dup": the library warns once (development only) and still renders.
const duplicateTree: TreeNode[] = [
  { id: "dup", label: "First node" },
  { id: "dup", label: "Second node with the same id" },
  { id: "unique", label: "Unique node" },
];

const meta = {
  title: "Tests/DuplicateIds",
  component: TreeView,
  args: {
    data: duplicateTree,
    "aria-label": "Tree with duplicate ids",
    className: "w-80 rounded border border-gray-200 bg-white p-2 text-sm text-gray-800",
  },
} satisfies Meta<typeof TreeView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Test-only story for the e2e smoke suite: `data` contains a duplicate id. */
export const DuplicateIds: Story = {};
