# react-virtual-tree-view

`TreeView` and `DraggableTreeView` for React: headless, stand-alone components built for
large, performant trees, with drag & drop (re-ordering, re-parenting and a maximum depth
limit) powered by [`@dnd-kit`](https://dndkit.com). The design is virtualization-friendly,
and [Storybook](https://storybook.js.org) is the showcase and documentation.

## Status

**Early development — not yet published to npm.** The repository currently contains only the
project tooling (build, tests, Storybook, CI) and the base `TreeNode` type. The components
themselves are still to be implemented.

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
