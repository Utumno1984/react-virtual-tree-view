import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DraggableTreeView, TreeView } from "../src";
import type { RenderNodeState, TreeId, TreeNode, TreeViewPersistableState } from "../src";

const initialTree: TreeNode[] = [
  {
    id: "docs",
    label: "Documents",
    children: [
      { id: "cv", label: "CV.pdf" },
      {
        id: 7,
        label: "Archive (numeric id)",
        children: [{ id: 8, label: "Old.zip (numeric id)" }],
      },
    ],
  },
  { id: "pics", label: "Pictures", children: [{ id: "p1", label: "Photo.png" }] },
  { id: "readme", label: "README.md" },
  { id: "off", label: "Locked (disabled)", isDisabled: true },
];

const Icon = ({ isExpanded }: RenderNodeState) =>
  isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />;

interface DemoProps {
  /** Raw value handed to `initialState` on the first mount (may be deliberately malformed). */
  initial?: unknown;
  /** Drive the selection with `selectedId` instead of leaving it to the tree. */
  controlled?: boolean;
  /** Use `DraggableTreeView` (drops that nest under a collapsed node expand it). */
  draggable?: boolean;
}

function PersistableDemo({ initial, controlled = false, draggable = false }: DemoProps) {
  const [data, setData] = useState(initialTree);
  const [mountKey, setMountKey] = useState(0);
  // The `initialState` of the current mount: the story's arg first, then the saved JSON.
  const [initialState, setInitialState] = useState<unknown>(initial);
  const [query, setQuery] = useState(() => {
    const q = (initial as { searchQuery?: unknown } | null | undefined)?.searchQuery;
    return typeof q === "string" ? q : "";
  });
  const [controlledId, setControlledId] = useState<TreeId | null>(null);
  const [json, setJson] = useState("none");
  const [count, setCount] = useState(0);
  // What a database would hold: the last state as text.
  const saved = useRef<string | null>(null);

  const Component = draggable ? DraggableTreeView : TreeView;

  const remount = () => {
    // Restore from the saved JSON; the search field is repopulated by the story (Q1).
    const restored = saved.current === null ? initialState : JSON.parse(saved.current);
    setInitialState(restored);
    const q = (restored as { searchQuery?: unknown } | null)?.searchQuery;
    setQuery(typeof q === "string" ? q : "");
    setJson("none");
    setCount(0);
    setMountKey((key) => key + 1);
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
      <Component
        key={mountKey}
        data={data}
        searchQuery={query}
        height={240}
        aria-label="Persistable tree"
        initialState={initialState as TreeViewPersistableState | undefined}
        selectedId={controlled ? controlledId : undefined}
        onSelect={(id) => setControlledId(id)}
        onStateChange={(state) => {
          saved.current = JSON.stringify(state);
          setJson(saved.current);
          setCount((c) => c + 1);
        }}
        {...(draggable ? { onTreeChange: (tree: TreeNode[]) => setData(tree) } : {})}
        className="rounded border border-gray-200 bg-white p-2 text-sm text-gray-800"
        rowClassName={(state) =>
          `flex items-center gap-1 rounded px-1 py-1 hover:bg-gray-100 ${
            state.isDisabled ? "text-gray-400" : ""
          } ${state.isSelected ? "bg-blue-50" : ""}`
        }
        renderIcon={Icon}
        noResults={
          <p data-testid="no-results" className="p-2 text-sm text-gray-500">
            No results
          </p>
        }
      />
      <button
        type="button"
        data-testid="remount"
        onClick={remount}
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      >
        Remount with the last state
      </button>
      <p className="text-xs text-gray-600">
        onStateChange calls since mount: <span data-testid="state-count">{count}</span>
      </p>
      <pre data-testid="state-log" className="rounded bg-gray-50 p-2 text-xs text-gray-700">
        {json}
      </pre>
    </div>
  );
}

const meta = {
  title: "Tests/PersistableState",
  component: PersistableDemo,
  decorators: [
    (Story) => (
      <>
        <style>{`[data-dragging] { opacity: 0.4; } [data-drag-overlay] { background: #dbeafe; }`}</style>
        <Story />
      </>
    ),
  ],
} satisfies Meta<typeof PersistableDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The whole persistable state in one object. Below the tree, `state-log` shows the JSON of the
 * last `onStateChange` and `state-count` how many times it fired since the mount (once per
 * gesture, never at mount). Opening or closing a branch while a search is active does not
 * change it. "Remount" stores that JSON like a database would and mounts a new tree with it as
 * `initialState`; the story re-initializes the search field from the same JSON, because the
 * library cannot set the controlled `searchQuery` prop.
 */
export const Default: Story = {};

/**
 * `initialState` with an invalid `expandedIds` item, a `selectedId` that is an object and a
 * `searchQuery` that is a number: the tree mounts, invalid parts count as empty and the console
 * shows a single `[react-virtual-tree-view]` warning (development only).
 */
export const Malformed: Story = {
  args: { initial: { expandedIds: ["docs", { not: "an id" }], selectedId: {}, searchQuery: 5 } },
};

/**
 * `initialState` refers to ids missing from `data` (`gone`, `99`). The tree drops them and
 * `onStateChange` fires once after the mount with the cleaned state (`selectedId: null`,
 * only `docs` expanded).
 */
export const StaleIds: Story = {
  args: { initial: { expandedIds: ["docs", "gone", 99], selectedId: "gone", searchQuery: "" } },
};

/**
 * A controlled `selectedId` always wins over `initialState.selectedId`, and `onStateChange`
 * fires when the prop changes (here the story updates it from `onSelect`).
 */
export const ControlledSelection: Story = {
  args: { initial: { expandedIds: [], selectedId: "cv", searchQuery: "" }, controlled: true },
};

/**
 * `DraggableTreeView` forwards the same props. Drag "README.md" one indentation to the right to
 * nest it under the collapsed "Pictures": the drop expands it and `onStateChange` reports it.
 */
export const Draggable: Story = { args: { draggable: true } };
