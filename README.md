# react-virtual-tree-view

`TreeView` and `DraggableTreeView` for React: headless, stand-alone components built for
large, performant trees, with drag & drop (re-ordering, re-parenting and a maximum depth
limit) powered by [`@dnd-kit`](https://dndkit.com). The design is virtualization-friendly,
and [Storybook](https://storybook.js.org) is the showcase and documentation.

## Status

**Pre-1.0:** the API may change between minor versions.

## Installation

```bash
npm install react-virtual-tree-view react react-dom @dnd-kit/core
```

`react` (>= 18) and `@dnd-kit/core` (^6) are **peer dependencies**: the package has no other runtime
dependency (`react-dom` is installed too because `@dnd-kit/core` needs it; a test checks that `dist/` only imports them). `@dnd-kit/core` is used by
`DraggableTreeView` but the bundle imports it for all components, so install it in any case.

The library is **headless**: it ships no CSS. Layout that virtualization and drag & drop depend on is
inline; everything visual is up to you, see [Styling](#styling).

## Usage

### TreeView

```tsx
import { TreeView } from "react-virtual-tree-view";
import type { TreeNode } from "react-virtual-tree-view";

const files: TreeNode[] = [
  {
    id: "docs",
    label: "Documents",
    children: [
      { id: "cv", label: "CV.pdf" },
      { id: "reports", label: "Reports", children: [{ id: "q2", label: "Q2.xlsx" }] },
    ],
  },
  { id: "notes", label: "notes.txt" },
];

function MinimalTree() {
  return (
    <TreeView
      data={files}
      height={320}
      aria-label="Files"
      defaultExpandedIds={["docs"]}
      onSelect={(id, node) => console.log("selected", id, node.label)}
    />
  );
}
```

### DraggableTreeView

`data` is controlled: store the tree handed to `onTreeChange`, otherwise a drop is not displayed.

```tsx
import { useState } from "react";
import { DraggableTreeView } from "react-virtual-tree-view";
import type { TreeChangeEvent, TreeNode } from "react-virtual-tree-view";

function MinimalDraggableTree() {
  const [tree, setTree] = useState<TreeNode[]>(files);

  return (
    <DraggableTreeView
      data={tree}
      height={320}
      maxDepth={3}
      aria-label="Files"
      onTreeChange={(nextTree: TreeNode[], event: TreeChangeEvent) => {
        // `data` is controlled: store the new tree or the drop is not shown.
        setTree(nextTree);
        console.log(event.nodeId, event.fromParentId, event.toParentId, event.index);
      }}
    />
  );
}
```

`DraggableTreeView` needs no `DndContext` of your own. Dragging is disabled while a search is active
and on disabled nodes. On touch screens press and hold a row (about 250 ms) to drag it; a normal
swipe scrolls the tree as usual.

While a touch press is in progress on a draggable row (the long-press wait and the drag itself) the
draggable rows get an inline `user-select: none` (and `-webkit-touch-callout: none`) so the browser does
not start a text selection that would cancel the drag; it is removed when the gesture ends. With the mouse,
and when nothing is being pressed, text stays selectable. Also during that gesture the row `contextmenu`
event is ignored (Chrome Android sends one after a long-press), so a `contextMenu` does not open
mid-drag: on a draggable row the menu is reached with a right click or the menu key, not with a
touch long-press. If a custom `renderNode` contains an `<input>`, note that iOS Safari does not let you
type into `user-select: none` elements, but this only applies while a touch press is in progress.

### Selection, search and scrolling

```tsx
import { useMemo, useRef, useState } from "react";
import { TreeView } from "react-virtual-tree-view";
import type { TreeNode, TreeViewHandle } from "react-virtual-tree-view";

function SearchableTree({ query }: { query: string }) {
  const [selectedId, setSelectedId] = useState<TreeNode["id"] | null>(null);
  const treeRef = useRef<TreeViewHandle>(null);
  // Memoize `data`: the O(n) search pass reruns whenever its identity changes.
  const data = useMemo(() => files, []);

  return (
    <>
      <TreeView
        ref={treeRef}
        data={data}
        searchQuery={query}
        noResults={<p aria-live="polite">No results</p>}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        rowHeight={28}
        height={320}
        aria-label="Searchable files"
      />
      <button onClick={() => treeRef.current?.scrollToId("q2")}>Go to Q2</button>
    </>
  );
}
```

Uncontrolled selection: `<TreeView data={files} defaultSelectedId="cv" aria-label="Files" />`.

### Several search terms (badges)

`searchTerms` searches for several terms at once, each one highlighted on its own. The library is
headless: it gives you the data, you render the badges.

```tsx
function TermBadges({ terms }: { terms: string[] }) {
  const [result, setResult] = useState<SearchResult>({ terms: [], matchCount: 0 });

  return (
    <>
      <ul>
        {result.terms.map((t) => (
          <li key={t.termIndex} data-term-index={t.termIndex}>
            {t.term} ({t.matchCount})
          </li>
        ))}
      </ul>
      <TreeView
        data={files}
        searchTerms={terms}
        onSearchResult={setResult}
        noResults={<p>No results</p>}
        aria-label="Multi-term search"
      />
    </>
  );
}
```

```css
/* Each <mark> carries the index of the term in `searchTerms`. */
mark[data-term-index="0"] { background: #fde68a; }
mark[data-term-index="1"] { background: #a5f3fc; }
```

- Active terms are the non-empty ones after `trim`. With at least one, `searchQuery` is ignored (a
  development warning flags it); otherwise `searchQuery` applies as before. To combine badges and the
  text being typed pass `[...terms, input]`.
- A node matches when its label contains any term (case-insensitive substring, no regex). Duplicates
  (after `trim` + lowercase) count as the one with the lowest index; empty terms keep their index.
- Overlaps: the leftmost start wins, then the longest term, then the lowest index (`["app", "apple"]` on
  "apple pie" highlights `apple` with `termIndex: 1`). `RenderNodeState.termMatches` lists the winning
  `{ range, termIndex }`; `matchRanges` stays equal to their ranges.
- `onSearchResult` runs after commit when the terms, their `active` flags or the counts change (never
  twice for the same result; `terms: []` when the search is cleared). A term's `matchCount` is the number
  of nodes whose label contains it, even if an overlap hides its highlight.
- Cost: one pass over the tree whatever the number of terms; the terms are normalized and the
  Aho-Corasick automaton is built once per set of terms, so each label costs O(length + occurrences), not
  O(terms x length). `searchTerms` is not part of `TreeViewPersistableState`.

### Persisting the tree state

`onStateChange` hands you one JSON-serializable object, `TreeViewPersistableState`
(`{ expandedIds, selectedId, searchQuery }`, only ids and a string), and `initialState` takes it
back on the next mount:

```tsx
import { useState } from "react";
import { TreeView } from "react-virtual-tree-view";
import type { TreeNode, TreeViewPersistableState } from "react-virtual-tree-view";

function PersistedTree({ data, isLoading }: { data: TreeNode[]; isLoading: boolean }) {
  // Read the saved state once; null the first time or when it is unreadable.
  const [saved] = useState<TreeViewPersistableState | null>(() => {
    try {
      const raw = localStorage.getItem("files-tree");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  // The search field is yours: start it from the saved value too.
  const [query, setQuery] = useState(saved?.searchQuery ?? "");

  // Mount the tree only once `data` is complete (see below).
  if (isLoading) return <p>Loading...</p>;
  return (
    <>
      <input value={query} onChange={(event) => setQuery(event.target.value)} />
      <TreeView
        data={data}
        searchQuery={query}
        initialState={saved ?? undefined}
        onStateChange={(state) => localStorage.setItem("files-tree", JSON.stringify(state))}
        aria-label="Files"
      />
    </>
  );
}
```

- `onStateChange` runs after the render where the expanded ids (the persistent set also reported
  by `onExpandedChange`, drag auto-expansion included), the selection or the `searchQuery` prop
  changed. It is not called at mount, there is no debounce (do it in your handler), and every call
  gets fresh objects. Opening branches while a search is active is temporary and not reported.
- With a controlled `selectedId` the prop is what is reported: it fires when the prop changes, the
  click itself is still `onSelect`.
- **Pass `initialState` only when `data` is already complete.** Ids missing from `data` at mount
  are dropped and the cleaned state is reported. If the tree mounts with `data={[]}` while the
  real data is loading, `onStateChange` fires with the empty state, and a handler that saves it
  overwrites what you had stored. Render the `TreeView` only once the data has arrived (as above),
  or give it a `key` that changes when the data does, so it remounts with the saved state.
- `initialState` is read on mount only and replaces `defaultExpandedIds` and `defaultSelectedId`
  entirely (a development warning names them if you pass both). A controlled `selectedId` wins.
- The library cannot set a controlled prop, so `initialState.searchQuery` is **not** applied:
  initialize your own search field with it, as above (a development warning flags a mismatch).
- Malformed input never throws: invalid parts count as empty, with one development warning.
  Ids missing from `data` are dropped, and `onStateChange` then fires once with the cleaned state.
  The same happens when `data` is replaced and ids vanish (even though `onExpandedChange` stays
  silent): the reported state only ever contains ids that exist in the current `data`.

### Empty tree, disabled node, depth limit

```tsx
import { useState } from "react";
import { DraggableTreeView, TreeView } from "react-virtual-tree-view";
import type { TreeNode } from "react-virtual-tree-view";

// Empty tree: `emptyState` is rendered next to the (empty) `role="tree"` container.
function EmptyTree() {
  return <TreeView data={[]} emptyState={<p>Nothing here yet</p>} aria-label="Empty tree" />;
}

// A disabled node cannot be selected or dragged by the user.
const withDisabled: TreeNode[] = [
  { id: "a", label: "Editable" },
  { id: "b", label: "Read only", isDisabled: true },
];

function DisabledNodeTree() {
  return <TreeView data={withDisabled} aria-label="With a disabled node" />;
}

// Roots are depth 0, so `maxDepth={1}` allows two levels (a dragged subtree counts too).
function DepthLimitedTree() {
  const [tree, setTree] = useState<TreeNode[]>(files);
  return (
    <DraggableTreeView
      data={tree}
      maxDepth={1}
      autoScroll={false}
      onTreeChange={(nextTree: TreeNode[]) => setTree(nextTree)}
      aria-label="Two levels at most"
    />
  );
}
```

#### Where a dragged node lands: drop zones

While dragging, the row under the pointer and the vertical position of the pointer inside it decide
the drop. The horizontal position is irrelevant (this also makes it work the same on touch):

| Zone of the hovered row | Result | Indicator |
|---|---|---|
| upper ~25% | previous sibling of the row | a line above the row |
| middle ~50% | **first child** of the row (a collapsed parent is expanded on drop) | the whole row highlighted |
| lower ~25% | next sibling of the row if it is collapsed or a leaf; **first child** of the row if it is expanded with visible children | a line right below the row (indented one level more when it is a first child) |

The line is therefore always next to the pointer, even under an expanded row with hundreds of
children. To drop a node after an expanded row's subtree, use the upper band of the next row. With
`maxDepth`, the first-child reading of an expanded row's lower band is refused (not demoted to a
sibling) when it would exceed the limit.

A pointer **below the last row** of the list (the blank space under a short list, or the very bottom
edge of the container when the list is scrolled to its end) means "the end of the whole tree": the
last position among the roots.

While a drag is active, a list tall enough to scroll, or close enough that the drag itself (and its
reserved row) might make it start scrolling, keeps one blank row at its end, so this zone is always
at least one row tall, whatever padding or border the container has. The row normally clears right
after the drop, once the scroll position no longer needs it (if the list was scrolled into the space
the row provides, it stays until the list is scrolled back up by a row, so the content does not
jump); a shorter list, or a container that grows with its content, is left untouched (to avoid
shifting the layout under the pointer).

**Known limit:** for every ancestor of the last visible row, except its direct parent, "become the
last child of that ancestor" is not reachable without first collapsing something in its subtree (the
lower band of an expanded row is its first-child zone). There is no keyboard alternative for
dragging yet.

Not valid targets (no indicator, nothing happens on release): the dragged node itself, and with
`maxDepth` a zone that would put the node or any descendant deeper than the limit (the "child" zone
of a row at the limit is refused while its sibling zones stay valid). A subtree already taller than
`maxDepth` can only be dropped at the root level. Disabled nodes cannot be dragged but accept
children and siblings like any other row.

The indicator wrapper carries `data-drop-zone` (`before` / `inside` / `after`) and
`data-drop-mode` (`line` / `child`), and `renderDropIndicator` receives `projection.zone`.
A custom `renderDropIndicator` that ignores `projection.zone` draws the same line for `"inside"` as
for `"before"` (at the top of the hovered row, at `left: 0`), which is easy to mistake for "previous
sibling": branch on `projection.zone` (for `"inside"`, highlight the whole row instead).
`projection.clamped` is always `false` and `minDepth` / `maxDepth` always equal `depth`: they are kept
only for compatibility. If `data` already has nodes deeper than `maxDepth` the drop is not refused
because of that data, only because of where the node would land.

### Context menu

The library defines no actions: you return them from `items(node)`. Returning `[]` means no menu for
that node. The menu opens with right click, Shift+F10 or the ContextMenu key.

`items(node)` runs when the menu opens. If `data` changes while the menu is open, the menu closes
silently when the node's id is gone; otherwise it stays open with the entries computed at opening,
and `onSelect` receives the new node with that id (first occurrence if ids repeat).

```tsx
import { TreeView } from "react-virtual-tree-view";
import type { MenuItem, TreeNode } from "react-virtual-tree-view";

function TreeWithContextMenu() {
  return (
    <TreeView
      data={files}
      aria-label="Files"
      contextMenu={{
        items: (node: TreeNode): MenuItem[] => [
          { id: "rename", label: "Rename", onSelect: (target) => console.log("rename", target.id) },
          { id: "delete", label: "Delete", onSelect: (target) => console.log("delete", target.id), disabled: node.id === "cv" },
        ],
        className: "my-menu",
        itemClassName: "my-menu-item",
      }}
    />
  );
}
```

If a new `data` no longer contains the id of the node the menu is open on, the menu closes
silently: no item runs, the consumer is not notified and the focus is not moved. A node that is
only hidden (closed branch, `searchQuery`) or that keeps its id with different content leaves the
menu open.

`TreeContextMenu` is also exported to use on its own. It renders a `role="menu"` with
`position: fixed` (no portal), kept inside the viewport:

```tsx
import { TreeContextMenu } from "react-virtual-tree-view";
import type { TreeNode } from "react-virtual-tree-view";

function StandaloneContextMenu() {
  const node: TreeNode = { id: "cv", label: "CV.pdf" };
  return (
    <TreeContextMenu
      node={node}
      items={[{ id: "open", label: "Open", onSelect: (target) => console.log(target.label) }]}
      anchor={{ x: 120, y: 80 }}
      onClose={(restoreFocus) => console.log("closed", restoreFocus)}
    />
  );
}
```

### Checkbox mode

`checkable` adds a checkbox to every row, with a cascade towards the descendants and an aggregated
(indeterminate) state towards the ancestors. It works on `TreeView` and `DraggableTreeView`; without
`checkable` nothing is rendered and nothing changes.

```tsx
import { useState } from "react";
import { TreeView } from "react-virtual-tree-view";

function CheckableTree() {
  const [checked, setChecked] = useState<Array<string | number>>(["cv"]);
  return (
    <TreeView
      data={files}
      aria-label="Files"
      checkable
      checkedIds={checked}
      onCheckedChange={setChecked}
    />
  );
}
```

Use `defaultCheckedIds` instead of `checkedIds` for the uncontrolled mode (read once, like
`defaultExpandedIds`). `onCheckedChange` is called once per user action (checkbox click or Space) with
the checked leaves in tree order (plus checked nodes whose state is not derived, such as a parent
whose children are all disabled). Parents with an enabled child are not listed: their state is
derived from the descendants, so the list stays valid when you move nodes around. It can be fed back
to `checkedIds` as is.

- **Independent from the selection.** Clicking the checkbox does not select the row (`onSelect`,
  `selectedId`), clicking the row does not check it, and the checkbox never starts a drag. Space toggles
  the focused node, Enter selects.
- **Where `aria-checked` lives.** On the `role="treeitem"` row (`true`, `false` or `"mixed"`), and
  `role="tree"` gets `aria-multiselectable="true"`. The native `<input type="checkbox" data-checkbox>`
  is `aria-hidden` and out of the tab order: it is a pointer affordance, the row is what assistive
  technology reads and what the keyboard drives. `renderNode` and `rowClassName` receive
  `state.checkState` (`true`, `false`, `"mixed"`, `undefined` without `checkable`).
- **Parents are derived.** A parent is checked when all its children are, unchecked when none is,
  `"mixed"` otherwise (at any depth). The ids of parents you pass in `checkedIds`/`defaultCheckedIds`
  are ignored when the parent has an enabled child: with `checkedIds={["p", "a"]}` where `p` has
  children `a` and `b`, `p` shows `"mixed"`. A parent whose children are all disabled shows its own
  state, and a leaf is checked when its id is listed. Ids missing from `data` are ignored.
- **Search does not limit the cascade.** The cascade and the aggregate are computed on the whole `data`,
  not on the visible rows: checking a parent while `searchQuery`/`searchTerms` hides some of its
  children checks them too (clear the search and they are checked), and a parent is `"mixed"` also
  because of hidden descendants. `data` is the source of truth, whatever is rendered.
- **Disabled nodes.** A node with `isDisabled` cannot be changed, by the user or by a cascade, and
  neither can anything below it (their checkboxes are `disabled`; `onCheckedChange` is not called).
  Siblings are still checked. Their current state (from `defaultCheckedIds`/`checkedIds`) stays and
  counts for the ancestors: a checked disabled child keeps its parent `"mixed"` or `true`. A parent
  with an unchecked disabled child still toggles its enabled children, and a second click unchecks
  them (it never gets stuck on `"mixed"`). A disabled node whose children are checked through
  `defaultCheckedIds`/`checkedIds` shows its own state (`false` unless its own id is listed) while
  the children show `true`; the disabled node is not derived from them, so ancestors do not count
  those children either.
- **Moving nodes.** Emptying a parent by drag (or by replacing `data`) turns it into a leaf: it is
  checked only if its own id is listed, which `onCheckedChange` never does for a former parent.
  In uncontrolled mode such an id stays in memory but is ignored while the node is a parent; if the
  node becomes a leaf again it is checked again, as in controlled mode (and consistent with the last
  `onCheckedChange`). It is cleared by the next user action, which is notified.
- **Vanished ids.** When `data` is replaced, ids no longer in it are dropped silently from the
  uncontrolled state (no `onCheckedChange`). A controlled `checkedIds` is never touched.
- **Drag & drop.** The state follows the node id: moving a node does not change its checked state and
  the parents involved are recalculated. Dragging stays off while a search is active.
- **Cost.** One O(n) pass with a `Set` per change of `data` or `checkedIds` (memoize the array you pass);
  the pure helpers `getCheckStates`, `getCheckedIds` and `toggleChecked` are exported.

## Props

`TreeView` props (`DraggableTreeView` accepts all of them plus its own):

| Prop | Type | Default | Description |
|---|---|---|---|
| `data` | `TreeNode[]` | required | The tree: `{ id, label, children?, isDisabled?, data? }`. Ids must be unique. |
| `height` | `number` | none | Viewport height in px. Omitted: size the tree with CSS. |
| `rowHeight` | `number` | `32` | Fixed height in px of every row (must be > 0). |
| `overscan` | `number` | `5` | Extra rows rendered above and below the visible area. |
| `indentation` | `number` | `24` | Pixels of indentation per depth level. |
| `defaultExpandedIds` | `Array<string \| number>` | `[]` | Ids expanded on mount (read once). |
| `onExpandedChange` | `(ids) => void` | none | Called on every expand/collapse with the expanded ids. |
| `selectedId` | `string \| number \| null` | none | Controlled selection (`null` = nothing). |
| `defaultSelectedId` | `string \| number` | none | Initial selection, uncontrolled (read once). |
| `onSelect` | `(id, node) => void` | none | User selected an enabled node (click, Enter, Space). |
| `checkable` | `boolean` | `false` | Checkbox on every row, with cascade and indeterminate state. See "Checkbox mode". |
| `checkedIds` / `defaultCheckedIds` | `Array<string \| number>` | none | Controlled / initial (read once) checked ids. |
| `onCheckedChange` | `(ids) => void` | none | User toggled a node; receives the checked ids (leaves; derived parents are not listed). |
| `onStateChange` | `(state: TreeViewPersistableState) => void` | none | Expanded ids, selection or search query changed; see "Persisting the tree state". |
| `initialState` | `TreeViewPersistableState` | none | State to restore on mount (read once); replaces `defaultExpandedIds`/`defaultSelectedId`. |
| `searchQuery` | `string` | none | Case-insensitive substring filter on `label`; shows matches and their ancestors, wraps matches in `<mark>`. |
| `searchTerms` | `ReadonlyArray<string>` | none | Several terms, each highlighted separately (`<mark data-term-index>`); wins over `searchQuery` when it has an active term. See "Several search terms". |
| `onSearchResult` | `(result: SearchResult) => void` | none | Per-term and total match counts, after commit, when the result changes (data for badges). |
| `noResults` | `ReactNode` | none | Rendered next to the tree when a search matches nothing. |
| `emptyState` | `ReactNode` | none | Rendered next to the tree when `data` is empty. |
| `renderNode` | `(node, state) => ReactNode` | label | Custom row content. |
| `renderIcon` | `(state) => ReactNode` | text glyph | Custom expand/collapse indicator. |
| `className` / `rowClassName` | `string` / `string \| (state) => string` | none | Class of the tree container / of every row. |
| `contextMenu` | `TreeContextMenuOptions` | none | Enables the context menu, see above. |
| `aria-label` / `aria-labelledby` | `string` | none | Accessible name of the tree. |
| `ref` | `Ref<TreeViewHandle>` | none | Exposes `scrollToId(id)`. |

Additional `DraggableTreeView` props:

| Prop | Type | Default | Description |
|---|---|---|---|
| `onTreeChange` | `(tree, event) => void` | none | A drop changed the tree. `event`: `nodeId`, `fromParentId`, `toParentId`, `index`. |
| `maxDepth` | `number` | no limit | Maximum depth (roots are 0), counting the dragged subtree. A drop zone that would exceed it is not a valid target (see "Where a dragged node lands: drop zones"). |
| `autoScroll` | `boolean` | `true` | Scroll the tree when dragging near its top/bottom edge. |
| `autoScrollThreshold` | `number` | `40` | Height in px of the auto-scroll band at each edge. |
| `autoScrollMaxSpeed` | `number` | `20` | Maximum auto-scroll speed in px per frame. |
| `renderDropIndicator` | `(projection) => ReactNode` | line / highlighted row | Content of the drop indicator (`projection.zone` tells a line from a "becomes a child" highlight). |

Keyboard: arrows move between rows and expand/collapse, Enter and Space select (with `checkable`, Space toggles the checkbox and Enter selects), Home/End jump to the
first/last row. Roles and attributes: `role="tree"`, `role="treeitem"`, `aria-expanded`,
`aria-selected`, `aria-level`.

## Helpers

Pure functions from `tree-utils`, exported for custom drag logic, tests and tree manipulation:

| Helper | What it does |
|---|---|
| `flattenTree(tree, expandedIds, visible?)` | Pre-order flattening of the visible rows (`FlattenedNode[]`). |
| `getDropZone(fraction)` | `"before"` / `"inside"` / `"after"` for a pointer at `fraction` (0 to 1) of the hovered row's height: 25% / 50% / 25%. |
| `getProjection(flat, activeId, overId, zone, maxDepth?)` | Depth and parent a dragged node would get when dropped on `zone` of row `overId`. |
| `getDropTarget(flat, activeId, overIndex, zone, maxDepth?, subtreeHeight?)` | Full drop target: parent, index, indicator row (`slot`), projection, `isNoop`. |
| `getEndDropTarget(flat, activeId)` | Drop target for a pointer below the last row: the end of the whole tree (last root). |
| `getSiblingDropTarget(flat, activeId, overIndex)` | Drop target for a same-parent reorder. |
| `calculateNewParent(flat, overIndex, zone)` | Parent id of a node dropped on `zone` of row `overIndex`. |
| `moveNode(tree, nodeId, toParentId, index)` | Immutable move; returns a `MoveResult` `{ tree, fromParentId, toParentId, index }`. For an invalid move `tree` is the same array you passed in. |
| `getSubtreeHeight(node)` | Height of a subtree (a leaf is 0). |
| `getAncestorIds(tree, id)` | Ancestor ids from the root down to the parent. |
| `findNodeById(tree, id)` | The node with that id, or `undefined`. |
| `findDuplicateIds(tree)` | Ids that appear more than once. |
| `getCheckStates(tree, checkedIds)` | `{ states, locked, derived }`: the state of every node (`true`, `false`, `"mixed"`), the ids that cannot be changed and the ids whose state is derived from their children, in one O(n) pass. |
| `getCheckedIds(states)` | Ids whose state is `true`, in tree order. |
| `toggleChecked(tree, checkedIds, id)` | The checked ids (non-derived, no parents with enabled children) after toggling `id` with cascade (`null` if nothing can change). |

`getProjection`, `getDropTarget` and `getSiblingDropTarget` return `null` when no valid target exists
(unknown ids, out-of-range index, the dragged node itself, a zone refused by `maxDepth`), so check the result before using it. `moveNode` returns an object,
not the tree:

```tsx
import { moveNode } from "react-virtual-tree-view";

const moved = moveNode(files, "notes", "docs", 0);
const nextTree = moved.tree; // the new tree (same array as `files` if the move was invalid)
```

Type exports: `TreeNode`, `TreeViewProps`, `DraggableTreeViewProps`, `RenderNodeState`, `TreeViewHandle`,
`TreeChangeEvent`, `MenuItem`, `MenuAnchor`, `TreeContextMenuOptions`, `TreeContextMenuProps`,
`FlattenedNode`, `Projection`, `MoveResult`, `TreeId`, `SiblingDropTarget`, `DropTarget`, `CheckState`,
`CheckStates`.

## Constraints worth knowing

- **Stable ids.** Every `TreeNode` needs its own unique `id`. The drag uses it as the draggable id,
  never the row position: a positional id would break the `DragOverlay` drop animation (it animates
  towards an id that, after the re-order, belongs to another node). Duplicate ids are reported in
  development; with duplicate ids `DraggableTreeView` shows no drop indicator and never calls
  `onTreeChange`.
- **Rows are positioned with `top`, not `transform`.** dnd-kit measures the draggable's rect with CSS
  transforms removed to anchor the overlay, so a `translateY` would add a hidden offset. Do not override
  the inline `position`, `top`, `height` and `padding-left` of the rows.
- **Flat DOM.** Nested nodes are sibling `treeitem`s (depth in `aria-level` and `padding-left`), not nested
  markup.
- **`data` is controlled** for `DraggableTreeView`, and should be memoized when searching.
- **Search is O(n)** and clears back to the previous expansion exactly.
- **Replacing `data` at runtime.** The ids kept in the internal state are checked against the whole
  new tree (not only the visible rows; one O(n) pass):
  - uncontrolled selection (`defaultSelectedId`): reset if its id is gone from the new tree, kept if
    the id exists (even with a different label: the id is the node's identity) or is only hidden by a
    closed branch or a search filter;
  - expanded nodes and the keyboard-focused node whose id is gone are dropped silently, without
    calling `onExpandedChange` (an id that comes back later is not expanded);
  - controlled `selectedId` is never touched: update it together with `data`. In development a
    `console.warn` names the missing id (once per id; nothing in production).

  There is no callback for these resets (`onSelect` never receives `null`): whoever swaps `data` must
  also reset its own state tied to the old nodes, for example close a dialog opened on a node.

## Styling

There are no built-in styles. Every hook (ARIA attributes, `data-*` attributes, class props) is listed in
[docs/styling-hooks.md](docs/styling-hooks.md), and [docs/example-theme.css](docs/example-theme.css) is a
ready-made theme (scope it with `className="rvtv-tree"`). For example:

```css
.rvtv-tree [role="treeitem"][aria-selected="true"] { background: #dbeafe; }
.rvtv-tree [data-dragging] { opacity: 0.4; }
```

## Storybook

[Storybook](https://storybook.js.org) is the showcase: one story per significant state (search, drag,
`maxDepth`, auto-scroll, context menu, example theme). The latest build from `main` is published at
<https://utumno1984.github.io/react-virtual-tree-view/>; to run it locally use
`npm run storybook` (sources in [`stories/`](stories)).

## Virtualization and performance

`TreeView` renders only the visible rows plus `overscan` (default 5), positioned with `top`.
Sizing: pass `height` (px), or leave it out and size the tree with CSS (a class such as
`h-96`, or a parent with a bounded height); the library sets no inline `height` then. If the
tree is as tall as all its rows, nothing is virtualized. `rowHeight` must be > 0 (default 32).

Target: **a tree of 10,000 nodes with a fixed `height` mounts in under 2 seconds** (checked
by a unit test) and keeps only about `ceil(height / rowHeight) + 2 * overscan` rows in the DOM.

## Development

```bash
npm install
npm run storybook      # Storybook dev server
npm run check          # lint + typecheck + build + unit tests
npm run test:e2e       # Playwright against the built Storybook
```

## Repository

https://github.com/Utumno1984/react-virtual-tree-view

## License

MIT © Daniele Ingusci
