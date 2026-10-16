import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DraggableTreeView, TreeView } from "../src";
import type { MenuItem, RenderNodeState, TreeNode } from "../src";
import { generateTree } from "./data/generateTree";

const menuTree: TreeNode[] = [
  {
    id: "docs",
    label: "Documents",
    children: [
      { id: "cv", label: "CV.pdf" },
      { id: "reports", label: "Reports", children: [{ id: "q2", label: "Q2.xlsx" }] },
    ],
  },
  { id: "pics", label: "Pictures", children: [{ id: "holiday", label: "Holiday.png" }] },
  { id: "notes", label: "notes.txt" },
  { id: "locked", label: "Locked folder", isDisabled: true },
];

const largeTree = generateTree({ count: 1500, maxDepth: 4, seed: 11 });

const Icon = ({ isExpanded }: RenderNodeState) =>
  isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />;

interface DemoProps {
  data: TreeNode[];
  defaultExpandedIds?: string[];
  height?: number;
  draggable?: boolean;
}

function ContextMenuDemo({ data, defaultExpandedIds, height, draggable }: DemoProps) {
  const [message, setMessage] = useState("");
  const [tree, setTree] = useState(data);

  // Demo actions only show a message: they never change the tree.
  const items = (node: TreeNode): MenuItem[] => {
    // "notes" has no menu at all: the native one must stay available.
    if (node.id === "notes") return [];
    const act = (name: string) => (target: TreeNode) =>
      setMessage(`Azione: ${name} su ${target.label}`);
    return [
      { id: "rename", label: "Rinomina (demo)", onSelect: act("Rinomina") },
      { id: "share", label: "Condividi (demo)", onSelect: act("Condividi"), disabled: node.id === "cv" },
      { id: "delete", label: "Elimina (demo)", onSelect: act("Elimina") },
    ];
  };

  const common = {
    height,
    defaultExpandedIds,
    "aria-label": "Tree with context menu",
    className: "rounded border border-gray-200 bg-white p-2 text-sm text-gray-800",
    rowClassName: (state: RenderNodeState) =>
      `flex items-center gap-1 rounded px-1 py-1 hover:bg-gray-100 ${
        state.isDisabled ? "text-gray-400" : ""
      } ${state.isFocused ? "outline outline-2 outline-blue-500" : ""}`,
    renderIcon: Icon,
    contextMenu: {
      items,
      className: "min-w-40 rounded border border-gray-300 bg-white py-1 text-sm shadow-lg",
      itemClassName:
        "cursor-pointer px-3 py-1 focus:bg-blue-100 focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-gray-400",
    },
  };

  return (
    <div className="w-80 space-y-2">
      {draggable ? (
        <DraggableTreeView data={tree} onTreeChange={(next) => setTree(next)} {...common} />
      ) : (
        <TreeView data={tree} {...common} />
      )}
      <p data-testid="action-message" className="text-sm text-gray-600">
        {message}
      </p>
    </div>
  );
}

const meta = {
  title: "TreeView/ContextMenu",
  component: ContextMenuDemo,
} satisfies Meta<typeof ContextMenuDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Right click a node, or focus it (Tab) and press Shift+F10 / the ContextMenu key. "notes.txt"
 * has no entries, so the browser's own menu appears there.
 */
export const ContextMenu: Story = {
  args: { data: menuTree, defaultExpandedIds: ["docs"] },
};

/** 1500 nodes: the menu closes when the tree scrolls (the row may unmount). */
export const LargeTree: Story = {
  args: { data: largeTree, height: 300 },
};

/** `DraggableTreeView`: starting a drag closes the open menu. */
export const Draggable: Story = {
  args: { data: menuTree, defaultExpandedIds: ["docs"], draggable: true },
};
