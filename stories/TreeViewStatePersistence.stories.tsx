import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TreeView } from "../src";
import type {
  RenderNodeState,
  TreeNode,
  TreeViewPersistableState,
} from "../src";
import { clearState, loadState, saveState, STORAGE_KEY } from "./data/fakeDb";
import type { LoadResult } from "./data/fakeDb";
import { generateTree } from "./data/generateTree";

const files: TreeNode[] = [
  {
    id: "docs",
    label: "Documents",
    children: [
      { id: "cv", label: "CV.pdf" },
      {
        id: "reports",
        label: "Reports",
        children: [{ id: "q2", label: "Q2.xlsx" }],
      },
    ],
  },
  {
    id: "pics",
    label: "Pictures",
    children: [{ id: "holiday", label: "Holiday.png" }],
  },
  { id: "readme", label: "README.md" },
  { id: "locked", label: "Locked (disabled)", isDisabled: true },
];

const datasets = {
  files,
  empty: [] as TreeNode[],
  single: [{ id: "only", label: "Only node" }] as TreeNode[],
  large: generateTree({ count: 1200, maxDepth: 4, seed: 48 }),
};

const Icon = ({ isExpanded }: RenderNodeState) =>
  isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />;

const queryOf = (state: unknown) => {
  const q = (state as { searchQuery?: unknown } | null | undefined)
    ?.searchQuery;
  return typeof q === "string" ? q : "";
};

interface DemoProps {
  dataset?: keyof typeof datasets;
}

/**
 * The whole persistence pattern: the "database" is read before mounting the tree, its content
 * goes to `initialState`, and every `onStateChange` is saved as JSON. NOTE: `localStorage` is
 * only a stand-in for a real database. In production `saveState` would be an API call, possibly
 * debounced by the consumer.
 */
function StatePersistenceDemo({ dataset = "files" }: DemoProps) {
  const [session, setSession] = useState<{ key: number; load: LoadResult }>(
    () => ({
      key: 0,
      load: loadState(),
    }),
  );
  const [query, setQuery] = useState(() => queryOf(session.load.state));
  const [raw, setRaw] = useState<string | null>(session.load.raw);
  const [error, setError] = useState<string | null>(session.load.error);

  const remount = (load: LoadResult) => {
    setQuery(queryOf(load.state));
    setRaw(load.raw);
    setError(load.error);
    setSession((s) => ({ key: s.key + 1, load }));
  };

  const handleStateChange = (state: TreeViewPersistableState) => {
    const result = saveState(state);
    if (result.error === null) setRaw(result.raw);
    setError(result.error);
  };

  const handleClear = () => {
    const clearError = clearState();
    remount({ state: undefined, raw: null, error: clearError });
  };

  return (
    <div className="w-96 space-y-2">
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
        key={session.key}
        data={datasets[dataset]}
        searchQuery={query}
        height={240}
        aria-label="Persisted tree"
        initialState={
          session.load.state as TreeViewPersistableState | undefined
        }
        onStateChange={handleStateChange}
        className="rounded border border-gray-200 bg-white p-2 text-sm text-gray-800"
        rowClassName={(state) =>
          `flex items-center gap-1 rounded px-1 py-1 hover:bg-gray-100 ${
            state.isDisabled ? "text-gray-400" : ""
          } ${state.isSelected ? "bg-blue-50" : ""}`
        }
        renderIcon={Icon}
        emptyState={
          <p className="p-2 text-sm text-gray-500">The tree is empty</p>
        }
        noResults={
          <p data-testid="no-results" className="p-2 text-sm text-gray-500">
            No results
          </p>
        }
      />
      {error !== null && (
        <p
          role="alert"
          data-testid="storage-error"
          className="rounded bg-amber-50 p-2 text-xs text-amber-800"
        >
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="simulate-reload"
          onClick={() => remount(loadState())}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          Simulate reload
        </button>
        <button
          type="button"
          data-testid="clear-storage"
          onClick={handleClear}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          Clear storage
        </button>
      </div>
      <p className="text-xs text-gray-600">
        Content of <code>{STORAGE_KEY}</code>:
      </p>
      <pre
        data-testid="stored-json"
        className="rounded bg-gray-50 p-2 text-xs text-gray-700"
      >
        {raw ?? "(empty)"}
      </pre>
    </div>
  );
}

const meta = {
  title: "TreeView/StatePersistence",
  component: StatePersistenceDemo,
} satisfies Meta<typeof StatePersistenceDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Persist the whole tree state (open branches, selection, search text) with the single-object
 * pattern: `initialState` in, `onStateChange` out, nothing else. The state is stored in
 * `localStorage` under `rvtv-demo:state-persistence`, which here is a stand-in for a real
 * database (in production: an API call, possibly debounced by the consumer). Open branches,
 * select a node, search, then reload the page or press "Simulate reload": everything comes
 * back, search field included (the library cannot set the controlled `searchQuery`, so the story
 * re-initializes the field from the saved JSON). A non-JSON value shows a warning and starts
 * empty; the first interaction overwrites it. A valid but malformed value is cleaned by the
 * library, and ids missing from `data` are dropped from the stored value.
 */
export const Default: Story = {};

/** Empty `data`: the saved state is cleaned up without errors. */
export const EmptyTree: Story = { args: { dataset: "empty" } };

/** A single node without children: its selection is persisted. */
export const SingleNode: Story = { args: { dataset: "single" } };

/** 1200 nodes: saving the state at every gesture stays instantaneous. */
export const LargeTree: Story = { args: { dataset: "large" } };
