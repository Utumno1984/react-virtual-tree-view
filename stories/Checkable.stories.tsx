import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DraggableTreeView, TreeView } from "../src";
import type { RenderNodeState, TreeNode } from "../src";

const tree: TreeNode[] = [
  {
    id: "docs",
    label: "Documents",
    children: [
      { id: "cv", label: "CV.pdf" },
      { id: "notes", label: "notes.txt" },
      {
        id: "reports",
        label: "Reports",
        children: [
          { id: "q1", label: "Q1 report" },
          { id: "q2", label: "Q2 report" },
        ],
      },
    ],
  },
  {
    id: "src",
    label: "Source",
    children: [
      { id: "index", label: "index.ts" },
      { id: "util", label: "util.ts" },
    ],
  },
  { id: "readme", label: "README.md" },
];

/** Permissions: an admin branch and a viewer role that cannot be changed. */
const permissions: TreeNode[] = [
  {
    id: "all",
    label: "All permissions",
    children: [
      {
        id: "admin",
        label: "Admin (locked)",
        isDisabled: true,
        children: [
          { id: "a1", label: "Manage users" },
          { id: "a2", label: "Manage billing" },
        ],
      },
      {
        id: "editor",
        label: "Editor",
        children: [
          { id: "e1", label: "Edit pages" },
          { id: "e2", label: "Publish pages" },
        ],
      },
      { id: "viewer", label: "Viewer (locked, on)", isDisabled: true },
      { id: "guest", label: "Guest" },
    ],
  },
];

const Icon = ({ isExpanded }: RenderNodeState) =>
  isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />;

const rowClassName = (state: RenderNodeState) =>
  `flex items-center gap-1 rounded px-1 py-1 hover:bg-gray-100 ${
    state.isSelected ? "bg-blue-50" : ""
  } ${state.isDisabled ? "text-gray-400" : ""}`;

interface DemoProps {
  data: TreeNode[];
  defaultExpandedIds?: string[];
  defaultCheckedIds?: string[];
  /** The parent owns `checkedIds` (and can refuse the changes with the "Apply changes" box). */
  controlled?: boolean;
  withSearch?: boolean;
  draggable?: boolean;
}

function CheckableDemo({
  data: initialData,
  defaultExpandedIds,
  defaultCheckedIds,
  controlled = false,
  withSearch = false,
  draggable = false,
}: DemoProps) {
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<string[]>(defaultCheckedIds ?? []);
  const [apply, setApply] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);

  const common = {
    data,
    checkable: true,
    searchQuery: withSearch ? query : undefined,
    defaultExpandedIds,
    ...(controlled ? { checkedIds: checked } : { defaultCheckedIds }),
    onCheckedChange: (ids: Array<string | number>) => {
      setEvents((prev) => [...prev, `onCheckedChange ${JSON.stringify(ids)}`]);
      if (controlled && apply) setChecked(ids.map(String));
    },
    onSelect: (id: string | number) => setSelected(String(id)),
    selectedId: selected,
    "aria-label": "Checkable tree",
    className: "rounded border border-gray-200 bg-white p-2 text-sm text-gray-800",
    rowClassName,
    renderIcon: Icon,
    noResults: <p data-testid="no-results">No results</p>,
  };
  const eventLog = useMemo(() => events.slice(-5), [events]);

  return (
    <div className="w-96 space-y-2">
      {withSearch && (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search..."
          aria-label="Search the tree"
          data-testid="search-input"
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
      )}
      {controlled && (
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={apply}
              onChange={(event) => setApply(event.target.checked)}
              data-testid="apply"
            />
            Apply changes
          </label>
          <button
            type="button"
            data-testid="set-q1"
            className="rounded border px-2 py-0.5"
            onClick={() => setChecked(["q1"])}
          >
            Set checkedIds to [q1]
          </button>
        </div>
      )}
      {draggable ? (
        <DraggableTreeView {...common} onTreeChange={(next) => setData(next)} />
      ) : (
        <TreeView {...common} />
      )}
      <p data-testid="selected" className="text-xs text-gray-500">
        selected: {selected ?? "none"}
      </p>
      <pre data-testid="events" className="rounded bg-gray-50 p-2 text-xs text-gray-700">
        {eventLog.length > 0 ? eventLog.join("\n") : "onCheckedChange: none yet"}
      </pre>
    </div>
  );
}

const meta = {
  title: "TreeView/Checkable",
  component: CheckableDemo,
} satisfies Meta<typeof CheckableDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Check a parent: all descendants follow. Uncheck one child: the parent turns indeterminate. */
export const Default: Story = {
  args: { data: tree, defaultExpandedIds: ["docs", "reports", "src"] },
};

/**
 * Filter the tree, check a parent, clear the filter: the children hidden by the filter were
 * checked too (the cascade and the indeterminate state use the whole `data`).
 */
export const WithSearch: Story = {
  args: { data: tree, defaultExpandedIds: ["docs"], withSearch: true },
};

/** A disabled node (and its subtree) is skipped by the cascade; its own state still counts. */
export const WithDisabled: Story = {
  args: { data: permissions, defaultExpandedIds: ["all", "admin", "editor"], defaultCheckedIds: ["viewer"] },
};

/** `checkedIds` owned by the parent. Untick "Apply changes": clicks call the callback but nothing moves. */
export const Controlled: Story = {
  args: { data: tree, defaultExpandedIds: ["docs", "reports"], defaultCheckedIds: ["cv"], controlled: true },
};

/** The checked state follows the node id: drag a checked node elsewhere and it stays checked. */
export const Draggable: Story = {
  args: {
    data: tree,
    defaultExpandedIds: ["docs", "reports", "src"],
    defaultCheckedIds: ["cv", "index"],
    draggable: true,
  },
};
