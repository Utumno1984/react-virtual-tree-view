import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TreeView } from "../src";
import { generateTree } from "./data/generateTree";
import type { RenderNodeState, TreeNode } from "../src";

const basicTree: TreeNode[] = [
  {
    id: "docs",
    label: "Documents",
    children: [
      { id: "cv", label: "CV.pdf" },
      {
        id: "reports",
        label: "Reports",
        children: [
          { id: "q1", label: "Q1.xlsx" },
          { id: "q2", label: "Q2.xlsx" },
        ],
      },
    ],
  },
  {
    id: "pics",
    label: "Pictures",
    children: [{ id: "holiday", label: "Holiday.png" }],
  },
  { id: "notes", label: "notes.txt" },
];

const disabledTree: TreeNode[] = [
  { id: "open", label: "Enabled folder", children: [{ id: "open-1", label: "Enabled child" }] },
  {
    id: "locked",
    label: "Disabled folder (still expandable)",
    isDisabled: true,
    children: [{ id: "locked-1", label: "Child of disabled folder" }],
  },
  { id: "locked-leaf", label: "Disabled leaf", isDisabled: true },
];

const Icon = ({ isExpanded }: RenderNodeState) =>
  isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />;

const meta = {
  title: "TreeView",
  component: TreeView,
  args: {
    data: basicTree,
    "aria-label": "File browser",
    className: "w-80 rounded border border-gray-200 bg-white p-2 text-sm text-gray-800",
    rowClassName: (state: RenderNodeState) =>
      `flex items-center gap-1 rounded px-1 py-1 hover:bg-gray-100 ${
        state.isDisabled ? "text-gray-400" : ""
      }`,
    renderIcon: Icon,
  },
} satisfies Meta<typeof TreeView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

export const Empty: Story = {
  args: {
    data: [],
    emptyState: <p className="p-2 text-gray-500">Nothing to show</p>,
  },
};

/** An empty tree with a fixed `height`: the empty state sits right below, not under a blank box. */
export const EmptyWithHeight: Story = {
  args: {
    data: [],
    height: 400,
    emptyState: <p className="p-2 text-gray-500">Nothing to show</p>,
  },
};

export const SingleNode: Story = {
  args: { data: [{ id: "only", label: "Only node" }] },
};

export const WithDisabledNodes: Story = {
  args: { data: disabledTree },
};

const largeTree = generateTree({ count: 1200, maxDepth: 4, seed: 7 });
const largeTreeParentIds: string[] = [];
(function collect(nodes: TreeNode[]) {
  for (const n of nodes) {
    if (n.children?.length) {
      largeTreeParentIds.push(String(n.id));
      collect(n.children);
    }
  }
})(largeTree);

/** Same tree, but the first parent starts collapsed (expanding it moves rows below it). */
export const LargeTreeFirstParentCollapsed: Story = {
  args: {
    data: largeTree,
    defaultExpandedIds: largeTreeParentIds.slice(1),
    height: 400,
    rowHeight: 32,
    "aria-label": "Large tree, first parent collapsed",
  },
};

/** 1200 nodes, all expanded: only the visible rows (plus overscan) are in the DOM. */
export const LargeTree: Story = {
  args: {
    data: largeTree,
    defaultExpandedIds: largeTreeParentIds,
    height: 400,
    rowHeight: 32,
    "aria-label": "Large tree",
  },
};
