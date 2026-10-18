import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { TreeView } from "../src";
import type { RenderNodeState, SearchResult, TreeNode } from "../src";
import { generateTree } from "./data/generateTree";

const projectTree: TreeNode[] = [
  {
    id: "src",
    label: "src",
    children: [
      { id: "index", label: "index.ts" },
      { id: "search", label: "search.ts" },
      {
        id: "components",
        label: "components",
        children: [
          { id: "tree", label: "TreeView.tsx" },
          { id: "tree-test", label: "TreeView.test.tsx" },
        ],
      },
    ],
  },
  {
    id: "tests",
    label: "tests",
    children: [
      { id: "unit", label: "unit", children: [{ id: "search-test", label: "search.test.ts" }] },
      { id: "e2e", label: "e2e", children: [{ id: "smoke", label: "smoke.spec.ts" }] },
    ],
  },
  {
    id: "docs",
    label: "docs",
    children: [
      { id: "apple", label: "apple pie recipe.md" },
      { id: "applesauce", label: "applesauce notes.md" },
    ],
  },
  { id: "readme", label: "README.md" },
  { id: "locked", label: "locked test fixture", isDisabled: true },
];

const largeTree = generateTree({ count: 5000, maxDepth: 5, seed: 21 });
const largeTerms = Array.from({ length: 10 }, (_, i) => `node ${i + 1}`);

const PALETTE = [
  { bg: "#fde68a", badge: "bg-amber-200 text-amber-900" },
  { bg: "#a5f3fc", badge: "bg-cyan-200 text-cyan-900" },
  { bg: "#fbcfe8", badge: "bg-pink-200 text-pink-900" },
  { bg: "#bbf7d0", badge: "bg-green-200 text-green-900" },
  { bg: "#ddd6fe", badge: "bg-violet-200 text-violet-900" },
] as const;
const colorFor = (index: number) => PALETTE[index % PALETTE.length]!;

// The library only tags each <mark> with data-term-index: the colors are the consumer's CSS.
const markCss = PALETTE.map(
  (c, i) =>
    `.search-terms-demo mark[data-term-index="${i}"], .search-terms-demo mark[data-term-index="${i + PALETTE.length}"] { background: ${c.bg}; }`,
).join("\n");

const Icon = ({ isExpanded }: RenderNodeState) =>
  isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />;

interface DemoProps {
  data: TreeNode[];
  initialTerms: string[];
  height?: number;
}

function SearchTermsDemo({ data, initialTerms, height }: DemoProps) {
  const [terms, setTerms] = useState(initialTerms);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<SearchResult>({ terms: [], matchCount: 0 });

  const commit = () => {
    const term = input.trim();
    if (term !== "") setTerms((prev) => [...prev, term]);
    setInput("");
  };

  return (
    <div className="search-terms-demo w-96 space-y-2">
      <style>{markCss}</style>
      <input
        type="search"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
        placeholder="Type a term and press Enter..."
        aria-label="Add a search term"
        data-testid="term-input"
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
      />
      <ul className="flex flex-wrap gap-1" aria-label="Search terms" data-testid="badges">
        {terms.map((term, index) => {
          // `terms` is shared with the tree below, so result.terms[index] is this badge's term.
          const count = result.terms[index]?.matchCount ?? 0;
          return (
            <li
              key={`${index}:${term}`}
              data-testid="badge"
              data-term-index={index}
              data-empty={count === 0 ? "" : undefined}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                count === 0 ? "bg-gray-100 text-gray-400 line-through" : colorFor(index).badge
              }`}
            >
              <span>{term}</span>
              <span data-testid="badge-count" className="font-semibold">
                {count}
              </span>
              <button
                type="button"
                aria-label={`Remove ${term}`}
                onClick={() => setTerms((prev) => prev.filter((_, i) => i !== index))}
              >
                <X size={12} />
              </button>
            </li>
          );
        })}
      </ul>
      <p data-testid="total" className="text-xs text-gray-500">
        {result.matchCount} matching nodes
      </p>
      <TreeView
        data={data}
        searchTerms={terms}
        onSearchResult={setResult}
        defaultExpandedIds={["src"]}
        height={height}
        aria-label="Searchable tree"
        className="rounded border border-gray-200 bg-white p-2 text-sm text-gray-800"
        rowClassName={(state) =>
          `flex items-center gap-1 rounded px-1 py-1 hover:bg-gray-100 ${
            state.isDisabled ? "text-gray-400" : ""
          }`
        }
        renderIcon={Icon}
        noResults={
          <p data-testid="no-results" className="p-2 text-sm text-gray-500">
            No results
          </p>
        }
      />
    </div>
  );
}

const meta = {
  title: "TreeView/SearchTerms",
  component: SearchTermsDemo,
} satisfies Meta<typeof SearchTermsDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No terms yet: type "src" + Enter, then "test" + Enter. Each term gets its own color and count. */
export const Default: Story = {
  args: { data: projectTree, initialTerms: [] },
};

/** None of the terms matches: every badge shows 0 and the tree shows `noResults`. */
export const NoMatches: Story = {
  args: { data: projectTree, initialTerms: ["zzzz", "qqqq"] },
};

/** "app" is contained in "apple": only the longest term is highlighted, both are counted. */
export const Overlapping: Story = {
  args: { data: projectTree, initialTerms: ["app", "apple"] },
};

/** 5000 nodes and 10 terms: one tree pass and one automaton, however many terms there are. */
export const LargeTree: Story = {
  args: { data: largeTree, initialTerms: largeTerms, height: 400 },
};
