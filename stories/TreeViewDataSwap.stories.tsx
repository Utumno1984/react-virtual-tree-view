import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TreeView } from "../src";
import type { RenderNodeState, TreeNode } from "../src";
import { DatasetBar } from "./data/DatasetBar";
import { createDataset } from "./data/dataSwapPresets";
import type { DatasetName } from "./data/dataSwapPresets";

const Icon = ({ isExpanded }: RenderNodeState) =>
  isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />;

function DataSwapDemo({ initial = "small" }: { initial?: DatasetName }) {
  const [name, setName] = useState<DatasetName>(initial);
  const [data, setData] = useState<TreeNode[]>(() => createDataset(initial));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>("none");
  return (
    <div className="w-80 space-y-2">
      <DatasetBar
        active={name}
        onPick={(next) => {
          setName(next);
          // A brand new tree from the preset; the TreeView below is never remounted.
          setData(createDataset(next));
        }}
      />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search..."
        aria-label="Search the tree"
        data-testid="search-input"
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
      />
      <TreeView
        data={data}
        searchQuery={query}
        height={400}
        defaultExpandedIds={["a-docs"]}
        aria-label="Swappable tree"
        onSelect={(id, node) => setSelected(`${id}|${node.label}`)}
        className="rounded border border-gray-200 bg-white p-2 text-sm text-gray-800"
        rowClassName={(state) =>
          `flex items-center gap-1 rounded px-1 py-1 hover:bg-gray-100 ${
            state.isDisabled ? "text-gray-400" : ""
          } ${state.isSelected ? "bg-blue-50" : ""} ${
            state.isFocused ? "outline outline-2 outline-blue-500" : ""
          }`
        }
        renderIcon={Icon}
        emptyState={
          <p data-testid="empty-state" className="p-2 text-sm text-gray-500">
            Empty tree
          </p>
        }
        noResults={
          <p data-testid="no-results" className="p-2 text-sm text-gray-500">
            No results
          </p>
        }
      />
      <p data-testid="active-dataset" className="text-xs text-gray-600">
        {name}
      </p>
      <p data-testid="selected" className="text-xs text-gray-600">
        {selected}
      </p>
    </div>
  );
}

const meta = {
  title: "TreeView/DataSwap",
  component: DataSwapDemo,
} satisfies Meta<typeof DataSwapDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The buttons replace the whole `data` prop of the same mounted `TreeView` (no `key`
 * change): `small` (hand-written, ids `a-`), `large` (1200 generated nodes, ids `b-`),
 * `deep` (narrow, 7 levels, ids `c-`), `empty` and `single` (one node, id `d-solo`).
 * Id spaces are disjoint, so no id of the old tree can survive a swap.
 *
 * `defaultExpandedIds` is read on mount only: after a swap the new tree starts collapsed
 * (only ids that happen to coincide stay expanded). The search field is kept across swaps
 * and recomputed on the new tree. What happens to the selection when its id disappears is
 * not specified here.
 */
export const Default: Story = {};
