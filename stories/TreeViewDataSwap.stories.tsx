import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TreeView } from "../src";
import type { MenuItem, RenderNodeState, TreeNode } from "../src";
import { DatasetBar } from "./data/DatasetBar";
import { createDataset } from "./data/dataSwapPresets";
import type { DatasetName } from "./data/dataSwapPresets";

const Icon = ({ isExpanded }: RenderNodeState) =>
  isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />;

function DataSwapDemo({
  initial = "small",
  controlled = false,
}: {
  initial?: DatasetName;
  /** Drive the selection with `selectedId` instead of leaving it to the tree. */
  controlled?: boolean;
}) {
  const [name, setName] = useState<DatasetName>(initial);
  const [data, setData] = useState<TreeNode[]>(() => createDataset(initial));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>("none");
  const [controlledId, setControlledId] = useState<string | number | null>(null);
  const [expandedEvents, setExpandedEvents] = useState(0);
  const [menuSelects, setMenuSelects] = useState(0);
  const [menuLabel, setMenuLabel] = useState("none");
  // Pressing a button outside closes the context menu (a user action), so to swap `data`
  // while the menu is open there are keyboard shortcuts: Alt+L (large), Alt+V (variant).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey) return;
      const next: DatasetName | null =
        event.code === "KeyL" ? "large" : event.code === "KeyV" ? "variant" : null;
      if (!next) return;
      event.preventDefault();
      setName(next);
      setData(createDataset(next));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
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
        selectedId={controlled ? controlledId : undefined}
        onSelect={(id, node) => {
          setSelected(`${id}|${node.label}`);
          setControlledId(id);
        }}
        onExpandedChange={() => setExpandedEvents((count) => count + 1)}
        contextMenu={{
          items: (): MenuItem[] => [
            {
              id: "act",
              label: "Action",
              onSelect: (target) => {
                setMenuSelects((count) => count + 1);
                setMenuLabel(target.label);
              },
            },
          ],
        }}
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
      <p data-testid="expanded-events" className="text-xs text-gray-600">
        {expandedEvents}
      </p>
      <p data-testid="menu-selects" className="text-xs text-gray-600">
        {menuSelects}
      </p>
      <p data-testid="menu-label" className="text-xs text-gray-600">
        {menuLabel}
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
 * `deep` (narrow, 7 levels, ids `c-`), `empty`, `single` (one node, id `d-solo`) and
 * `variant` (the ids of `small`, with other labels and some nodes removed).
 * `small`, `large`, `deep` and `single` have disjoint id spaces; `variant` shares ids with
 * `small`.
 *
 * What a swap does to the internal state (uncontrolled selection):
 *
 * - the selected id is not in the new tree (select a `small` node, click `large`): the
 *   selection is reset, no `treeitem` is `aria-selected`, `onSelect` is not called;
 * - the selected id is only hidden (closed branch, search filter) but exists in the new tree:
 *   the selection stays;
 * - the selected id exists in both trees (select `a-cv`, click `variant`): it stays selected
 *   and shows the new label. The id is the node's identity, not its content;
 * - expanded nodes and the keyboard-focused node whose id disappeared are dropped silently,
 *   without `onExpandedChange` (the counter below the tree does not move) and an id that
 *   comes back later is not expanded again. Exactly one `treeitem` keeps `tabindex=0`.
 *
 * An open context menu (right click a node) follows the same rule: if its node's id is not in
 * the new tree it closes silently, without running any item (the `menu-selects` counter does
 * not move). If the id exists in the new tree, or the node is only hidden by the search filter,
 * it stays open, and the item receives the new node (`menu-label` shows its label).
 * Pressing a button closes the menu on its own (like any press outside), so to swap while it
 * is open use the keyboard: right click a `small` node, then press Alt+L (`large`: the menu
 * closes); right click `a-cv`, then press Alt+V (`variant`: the menu stays open and the
 * action receives "CV (updated).pdf").
 *
 * `defaultExpandedIds` is read on mount only, so `a-docs` is expanded at first and is not
 * again once a swap to a tree without it has removed it. The search field is kept across
 * swaps and recomputed on the new tree. Whoever swaps `data` must also reset its own state
 * tied to the old nodes (the library has no callback for the reset).
 */
export const Default: Story = {};

/**
 * Same swaps with a controlled `selectedId`. The library never touches it: after selecting a
 * `small` node and clicking `large`, the selection state still holds the old id (nothing is
 * highlighted, because the id is not in the tree) and, in development, the console shows
 * `[react-virtual-tree-view] The controlled selectedId "..." does not exist in data`, once
 * per missing id (never in a production build). It is up to the parent to update
 * `selectedId` together with `data`.
 */
export const ControlledSelection: Story = { args: { controlled: true } };
