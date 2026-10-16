# Styling hooks

react-virtual-tree-view is headless: it ships no stylesheet. Layout (`position`, `top`, `height`,
`padding-left`, `overflow`) is set inline because virtualization and drag & drop depend on it; everything
visual is up to you through the hooks below. A ready-made example is in
[`example-theme.css`](./example-theme.css) (shown in Storybook under *Styling / ExampleTheme*).

Every hook listed here was checked against `src/` (file and line in the "Source" column).

## DOM structure

```
<div role="tree" class={className} aria-label|aria-labelledby>        TreeView.tsx
  <div role="none">                                                    (sizing wrapper, no hook)
    <div role="treeitem" class={rowClassName} data-node-id ...>        one per visible row, flat
      <span data-toggle aria-hidden="true">icon</span>
      label | renderNode(...)  (matches wrapped in <mark>)
    </div>
    <div data-drop-indicator ...>renderDropIndicator()</div>          DraggableTreeView only, while dragging
  </div>
</div>
<div role="menu" data-tree-context-menu class={contextMenu.className}> TreeContextMenu, sibling of the tree
  <div role="menuitem" data-menu-item-id class={itemClassName}>
<div data-drag-overlay class={rowClassName} aria-hidden="true">        DragOverlay content, while dragging
```

The tree is **flat**: nested nodes are sibling `treeitem`s positioned by `top`, with their depth expressed
by `aria-level` and inline `padding-left`. There is no `role="group"` and no nested markup, so do not rely on
descendant selectors for hierarchy.

## Roles and ARIA attributes

| Element | Attribute | Values | Source |
|---|---|---|---|
| tree | `role="tree"` | | `TreeView.tsx:506` |
| tree | `aria-label`, `aria-labelledby` | from props | `TreeView.tsx:508-509` |
| sizing wrapper | `role="none"` | | `TreeView.tsx:521` |
| row | `role="treeitem"` | | `TreeView.tsx:527` |
| row | `aria-selected` | `"true"` / `"false"` on **every** row | `TreeView.tsx:580` |
| row | `aria-expanded` | `"true"` / `"false"`, **only on rows with children** (absent on leaves) | `TreeView.tsx:579` |
| row | `aria-disabled` | `"true"` when `node.isDisabled`, otherwise absent | `TreeView.tsx:581` |
| row | `aria-level` | `depth + 1` (1-based) | `TreeView.tsx:575` |
| row | `aria-setsize`, `aria-posinset` | siblings count / position | `TreeView.tsx:576-577` |
| row | `aria-haspopup="menu"` | only when the `contextMenu` prop is set | `TreeView.tsx:578` |
| row | `tabindex` | `0` on the single tabbable row, `-1` on the others (roving) | `TreeView.tsx:531` |
| toggle | `aria-hidden="true"` | | `TreeView.tsx:429` |
| drag overlay | `aria-hidden="true"` | | `TreeView.tsx:485` |
| drop indicator | `aria-hidden="true"` | | `DropIndicator.tsx:24` |
| context menu | `role="menu"`, `aria-label` | label defaults to the node label | `TreeContextMenu.tsx:163-164` |
| menu item | `role="menuitem"` | | `TreeContextMenu.tsx:183` |
| menu item | `aria-disabled` | `"true"` when disabled, otherwise absent | `TreeContextMenu.tsx:185` |

## `data-*` attributes

| Element | Attribute | Value | Meaning | Component | Source |
|---|---|---|---|---|---|
| row | `data-node-id` | `String(node.id)` | stable node id | TreeView, DraggableTreeView | `TreeView.tsx:529` |
| row | `data-row-index` | number | index in the visible (flattened) list | TreeView, DraggableTreeView | `TreeView.tsx:530` |
| row | `data-disabled` | `""` or absent | node is disabled (mirrors `aria-disabled`) | TreeView, DraggableTreeView | `TreeView.tsx:574` |
| row | `data-dragging` | `""` or absent | this row is the one being dragged | DraggableTreeView | `DraggableTreeView.tsx:29` |
| row | `data-drag-disabled` | `""` or absent | drag is off for this row (disabled node or active search) | DraggableTreeView | `DraggableTreeView.tsx:30` |
| toggle | `data-toggle` | `""` | the expand/collapse glyph (present on leaves too, empty) | TreeView, DraggableTreeView | `TreeView.tsx:428` |
| drop indicator | `data-drop-indicator` | `""` | the indicator wrapper | DraggableTreeView | `DropIndicator.tsx:25` |
| drop indicator | `data-projected-depth` | number | depth where the node would land (roots are 0) | DraggableTreeView | `DropIndicator.tsx:26` |
| drop indicator | `data-depth-clamped` | `"true"` / `"false"` | `maxDepth` cut the projection | DraggableTreeView | `DropIndicator.tsx:27` |
| drag overlay | `data-drag-overlay` | `""` | the floating copy of the dragged row | DraggableTreeView | `TreeView.tsx:486` |
| context menu | `data-tree-context-menu` | `""` | the menu container | TreeView (`contextMenu`), TreeContextMenu | `TreeContextMenu.tsx:166` |
| menu item | `data-menu-item-id` | `item.id` | id of the `MenuItem` | TreeContextMenu | `TreeContextMenu.tsx:186` |

Boolean-presence attributes are written as `data-x=""` when true and omitted when false: select them with
`[data-x]`, never with `[data-x="true"]` (the only exception is `data-depth-clamped`, see below).

## Class names

The library never adds a class of its own. You choose them:

| Prop | Applies to |
|---|---|
| `className` | the `role="tree"` container |
| `rowClassName` | every row **and** the drag overlay; a string or `(state: RenderNodeState) => string` |
| `contextMenu.className` / `contextMenu.itemClassName` | menu container / each menu item |

`RenderNodeState` (`types.ts`) exposes `depth`, `isExpanded`, `isDisabled`, `hasChildren`, `isSelected`,
`isFocused`, `isSearching`, `isMatch`, `matchRanges`. Some states exist **only** there and have no attribute
(see below), so with a `rowClassName` function you can style them; with plain CSS you cannot.

## State to selector cheat sheet

| State | CSS selector |
|---|---|
| selected row | `[role="treeitem"][aria-selected="true"]` |
| expanded / collapsed row | `[aria-expanded="true"]` / `[aria-expanded="false"]` |
| leaf row | `[role="treeitem"]:not([aria-expanded])` |
| disabled row | `[role="treeitem"][aria-disabled="true"]` (or `[data-disabled]`) |
| focused row | `[role="treeitem"]:focus` / `:focus-visible` (real DOM focus) |
| depth of a row | inline `padding-left`; `aria-level` for the number |
| row being dragged | `[data-dragging]` |
| drag disabled | `[data-drag-disabled]` |
| drag overlay | `[data-drag-overlay]` |
| drop indicator, clamped | `[data-drop-indicator][data-depth-clamped="true"]` |
| search match | `mark` inside the row (no attribute) |
| menu item disabled | `[role="menuitem"][aria-disabled="true"]` |
| menu item focused | `[role="menuitem"]:focus-visible` |

> **Contrast of disabled text.** The example theme greys disabled rows and menu items with `#9ca3af`
> (about 2.5:1 on white). That is intentional: WCAG 1.4.3 exempts inactive components, and the low contrast
> signals the disabled state. If your design needs more contrast, use a darker grey such as `#6b7280`
> (about 4.8:1) or `#4b5563` (about 7.6:1) for `[aria-disabled="true"]`, and keep the "disabled" cue with
> something other than colour (strikethrough, an icon, `cursor: not-allowed`). Never rely on colour alone.

## Naming conventions (what is consistent)

- `data-*` names are kebab-case and read as a state or a part: `data-dragging`, `data-disabled`, `data-toggle`.
- Presence attributes use `""` / absent.
- State that has an ARIA equivalent uses ARIA (`aria-selected`, `aria-expanded`, `aria-disabled`): there is
  no `data-selected` / `data-expanded`.
- Parts are marked by an attribute named after the part: `data-toggle`, `data-drop-indicator`,
  `data-drag-overlay`, `data-tree-context-menu`.

## Inconsistencies found (reported, not fixed)

Candidates for a future ticket, before the API is frozen:

1. **`data-depth-clamped` is `"true"`/`"false"`, the others are presence-only.** Everything else
   (`data-dragging`, `data-disabled`, ...) is `""` or absent. `[data-depth-clamped]` therefore matches *always*:
   you must write `[data-depth-clamped="true"]`.
2. **Disabled has two names for a row and one for a menu item.** Rows carry `data-disabled` *and*
   `aria-disabled="true"`; menu items carry only `aria-disabled="true"` (no `data-disabled`).
   Likewise `data-drag-disabled` is the drag-specific variant and `data-disabled` the general one.
3. **Id attributes are prefixed per component** (`data-node-id` on rows, `data-menu-item-id` on menu items):
   consistent in shape, but there is no shared `data-id`. Only rows have a position attribute
   (`data-row-index`); menu items have none.
4. **Focus, expanded, selected and search-match have no `data-*`**, while `data-dragging` and `data-disabled`
   do. Selection/expansion go through ARIA, focus through `:focus`, but `isFocused` (tree has focus AND this
   is its focused row) and `isMatch` exist only in `RenderNodeState`. Search matches are only reachable via
   `<mark>` (and not at all when `renderNode` is used) or `rowClassName`.
5. **The drag overlay is half-hooked**: it receives `rowClassName` but none of the row attributes
   (`data-disabled`, `aria-*`, `data-node-id`) and has no state attribute of its own besides `data-drag-overlay`.
   The source row, left in the tree, is the one marked `data-dragging`.
6. **`aria-selected` is present on every row** (`"false"` on the others) while `aria-expanded` is absent on
   leaves: this is correct ARIA but means `[aria-selected]` matches all rows.
7. **Flat structure**: no `role="group"`. Styling nested levels needs `aria-level` or the inline
   `padding-left`, not a nested selector.
8. **Inline styles that cannot be overridden without `!important`**: the default drop indicator line
   (`background: #3b82f6`, `DropIndicator.tsx`) and the menu `position: fixed; z-index: 1000`
   (`TreeContextMenu.tsx:171`). Use `renderDropIndicator` to replace the line instead.
9. **Not hooked at all**: the `emptyState` / `noResults` nodes are rendered as given by the consumer (no
   wrapper, no attribute) next to the tree.
