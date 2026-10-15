import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TreeView } from "../src";
import type { RenderNodeState, TreeNode } from "../src";
import { generateTree } from "./data/generateTree";

const searchTree: TreeNode[] = [
  {
    id: "docs",
    label: "Documents",
    children: [
      { id: "cv", label: "CV.pdf" },
      {
        id: "reports",
        label: "Reports",
        children: [
          {
            id: "archive",
            label: "Archive",
            children: [{ id: "q1-2019", label: "Quarterly-2019.xlsx" }],
          },
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
  { id: "locked", label: "Quarterly locked", isDisabled: true },
];

const largeTree = generateTree({ count: 1500, maxDepth: 4, seed: 11 });

const Icon = ({ isExpanded }: RenderNodeState) =>
  isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />;

interface DemoProps {
  data: TreeNode[];
  initialQuery: string;
  defaultExpandedIds?: string[];
  height?: number;
}

function SearchDemo({ data, initialQuery, defaultExpandedIds, height }: DemoProps) {
  const [query, setQuery] = useState(initialQuery);
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
      <TreeView
        data={data}
        searchQuery={query}
        defaultExpandedIds={defaultExpandedIds}
        height={height}
        aria-label="Searchable tree"
        className="rounded border border-gray-200 bg-white p-2 text-sm text-gray-800"
        rowClassName={(state) =>
          `flex items-center gap-1 rounded px-1 py-1 hover:bg-gray-100 ${
            state.isDisabled ? "text-gray-400" : ""
          } ${state.isFocused ? "outline outline-2 outline-blue-500" : ""}`
        }
        renderIcon={Icon}
        noResults={
          <p data-testid="no-results" className="p-2 text-sm text-gray-500">
            Nessun risultato
          </p>
        }
      />
    </div>
  );
}

const meta = {
  title: "TreeView/Search",
  component: SearchDemo,
} satisfies Meta<typeof SearchDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty field, only "Documents" expanded: type a term from a deep node (e.g. "quarterly"). */
export const Search: Story = {
  args: { data: searchTree, initialQuery: "", defaultExpandedIds: ["docs"] },
};

/** The query matches a deep node: its ancestors are expanded and the text is in `<mark>`. */
export const WithMatches: Story = {
  args: { data: searchTree, initialQuery: "quarterly" },
};

/** The query matches nothing: no `treeitem`, the `noResults` message is shown. */
export const NoMatches: Story = {
  args: { data: searchTree, initialQuery: "zzzz" },
};

/** 1500 nodes: typing stays fluid because match collection is a single O(n) pass. */
export const LargeTree: Story = {
  args: { data: largeTree, initialQuery: "", height: 400 },
};
