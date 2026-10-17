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
and on disabled nodes.

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

#### Known limit with non-conforming data

If `data` already has nodes deeper than `maxDepth`, a drop can end up beyond the limit. This
happens when the final slot (after it has moved past the rows that are too deep for the dragged
subtree but still within `maxDepth`) is right above a row deeper than `maxDepth`, which forces the
dropped node to at least that depth. It can also happen when dropping above a conforming row (e.g.
`a > b > c > x > y` plus `l > m` with `maxDepth={2}`: dropping `l` above `c` lands between `c` and
`x`, at depth 3), or when the dragged subtree itself is already taller than `maxDepth` (it
overshoots wherever it goes). `projection.clamped` is `true` in these cases, but also for ordinary
cuts that honour the limit, so it is not enough on its own. The overshoot is
`depth + getSubtreeHeight(node) > maxDepth`, with your `maxDepth` and not `projection.maxDepth`
(which is raised to `minDepth`):

- In `renderDropIndicator` you only get the projection, not the dragged node. The indicator is
  rendered inside the `DndContext`, so return a component and read the dragged id there with
  `useDndContext().active?.id` (from `@dnd-kit/core`), then find the node with
  `findNodeById(data, id)` and check `projection.depth + getSubtreeHeight(node) > maxDepth`. If you
  call `getProjection` / `getDropTarget` yourself you already know the active id.
- In `onTreeChange` (the event has no `clamped`): take `const node = findNodeById(tree, event.nodeId)`
  and compute `getAncestorIds(tree, event.nodeId).length + getSubtreeHeight(node) > maxDepth`.
  Ignoring the new tree whenever this is true also blocks moves that do not make things worse (for
  example reordering `d` and `e` under `c` at depth 3). Compare with the same value before the move,
  `getAncestorIds(data, event.nodeId).length + getSubtreeHeight(node)`, and accept the move unless
  it is higher.

### Context menu

The library defines no actions: you return them from `items(node)`. Returning `[]` means no menu for
that node. The menu opens with right click, Shift+F10 or the ContextMenu key.

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
| `searchQuery` | `string` | none | Case-insensitive substring filter on `label`; shows matches and their ancestors, wraps matches in `<mark>`. |
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
| `maxDepth` | `number` | no limit | Maximum depth (roots are 0), counting the dragged subtree. The projection is cut, the drop is not refused (see "Known limit with non-conforming data"). |
| `autoScroll` | `boolean` | `true` | Scroll the tree when dragging near its top/bottom edge. |
| `autoScrollThreshold` | `number` | `40` | Height in px of the auto-scroll band at each edge. |
| `autoScrollMaxSpeed` | `number` | `20` | Maximum auto-scroll speed in px per frame. |
| `renderDropIndicator` | `(projection) => ReactNode` | thin line | Content of the drop indicator. |

Keyboard: arrows move between rows and expand/collapse, Enter and Space select, Home/End jump to the
first/last row. Roles and attributes: `role="tree"`, `role="treeitem"`, `aria-expanded`,
`aria-selected`, `aria-level`.

## Helpers

Pure functions from `tree-utils`, exported for custom drag logic, tests and tree manipulation:

| Helper | What it does |
|---|---|
| `flattenTree(tree, expandedIds, visible?)` | Pre-order flattening of the visible rows (`FlattenedNode[]`). |
| `getProjection(flat, activeId, overId, dragOffset, indentation, maxDepth?)` | Depth and parent a dragged node would get (dnd-kit "tree" algorithm). |
| `getDropTarget(flat, activeId, overIndex, dragOffset, indentation, maxDepth?, subtreeHeight?)` | Full drop target: insertion slot, depth and parent. |
| `getSiblingDropTarget(flat, activeId, overIndex)` | Drop target for a same-parent reorder. |
| `calculateNewParent(flat, overIndex, depth)` | Parent id of a row placed at `overIndex` at a given depth. |
| `moveNode(tree, nodeId, toParentId, index)` | Immutable move; returns a `MoveResult` `{ tree, fromParentId, toParentId, index }`. For an invalid move `tree` is the same array you passed in. |
| `getSubtreeHeight(node)` | Height of a subtree (a leaf is 0). |
| `getAncestorIds(tree, id)` | Ancestor ids from the root down to the parent. |
| `findNodeById(tree, id)` | The node with that id, or `undefined`. |
| `findDuplicateIds(tree)` | Ids that appear more than once. |

`getProjection`, `getDropTarget` and `getSiblingDropTarget` return `null` when no valid target exists
(unknown ids, out-of-range index), so check the result before using it. `moveNode` returns an object,
not the tree:

```tsx
import { moveNode } from "react-virtual-tree-view";

const moved = moveNode(files, "notes", "docs", 0);
const nextTree = moved.tree; // the new tree (same array as `files` if the move was invalid)
```

Type exports: `TreeNode`, `TreeViewProps`, `DraggableTreeViewProps`, `RenderNodeState`, `TreeViewHandle`,
`TreeChangeEvent`, `MenuItem`, `MenuAnchor`, `TreeContextMenuOptions`, `TreeContextMenuProps`,
`FlattenedNode`, `Projection`, `MoveResult`, `TreeId`, `SiblingDropTarget`, `DropTarget`.

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
