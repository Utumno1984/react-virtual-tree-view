# react-virtual-tree-view

`TreeView` and `DraggableTreeView` for React: headless, stand-alone components built for
large, performant trees, with drag & drop (re-ordering, re-parenting and a maximum depth
limit) powered by [`@dnd-kit`](https://dndkit.com). The design is virtualization-friendly,
and [Storybook](https://storybook.js.org) is the showcase and documentation.

## Status

**Early development — not yet published to npm.** The repository currently contains only the
project tooling (build, tests, Storybook, CI) and the base `TreeNode` type. The components
themselves are still to be implemented.

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
