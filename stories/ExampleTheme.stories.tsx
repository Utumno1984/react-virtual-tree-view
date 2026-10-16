import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DraggableTreeView } from "../src";
import type { TreeNode } from "../src";
// Documentation theme: lives in docs/ and is not part of the published package.
import "../docs/example-theme.css";

const data: TreeNode[] = [
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
  { id: "locked", label: "Locked (disabled)", isDisabled: true },
];

function ThemedTree({ searchQuery }: { searchQuery?: string }) {
  const [tree, setTree] = useState(data);
  return (
    <div style={{ width: 320 }}>
      <DraggableTreeView
        data={tree}
        onTreeChange={(next) => setTree(next)}
        defaultExpandedIds={["docs"]}
        searchQuery={searchQuery}
        maxDepth={2}
        aria-label="Themed tree"
        className="rvtv-tree"
        renderDropIndicator={() => <div className="rvtv-drop-line" />}
        contextMenu={{
          items: (node) => [
            { id: "rename", label: "Rename (demo)", onSelect: () => undefined },
            { id: "delete", label: "Delete (demo)", disabled: node.id === "cv", onSelect: () => undefined },
          ],
        }}
      />
    </div>
  );
}

const meta = {
  title: "Styling/ExampleTheme",
  component: ThemedTree,
} satisfies Meta<typeof ThemedTree>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * `docs/example-theme.css` applied to a `DraggableTreeView` with plain CSS (no Tailwind):
 * selection, focus, disabled, drag, drop indicator (orange when the depth is clamped by `maxDepth`),
 * search highlight and context menu. See `docs/styling-hooks.md`.
 */
export const Themed: Story = {};

/** The same theme while searching: matches are wrapped in `<mark>`. */
export const ThemedSearch: Story = {
  args: { searchQuery: "re" },
};
