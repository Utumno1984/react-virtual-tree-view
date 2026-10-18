/**
 * Type-checked copies of the TypeScript snippets in README.md (included by tsconfig.json, so
 * `npm run typecheck` fails when a public prop is renamed or removed). In the README the
 * imports read `from "react-virtual-tree-view"`; here they point at `src`.
 * tests/unit/readme-snippets.test.ts checks that every README snippet line is present here.
 */
import { useMemo, useRef, useState } from "react";
import {
  DraggableTreeView,
  TreeContextMenu,
  TreeView,
  calculateNewParent,
  findDuplicateIds,
  flattenTree,
  getAncestorIds,
  getDropTarget,
  getDropZone,
  getProjection,
  getSiblingDropTarget,
  getSubtreeHeight,
  moveNode,
} from "../../src";
import type {
  MenuItem,
  SearchResult,
  TreeChangeEvent,
  TreeNode,
  TreeViewHandle,
  TreeViewPersistableState,
} from "../../src";

// --- Minimal TreeView -------------------------------------------------------------------

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

export function MinimalTree() {
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

// --- Minimal DraggableTreeView ----------------------------------------------------------

export function MinimalDraggableTree() {
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

// --- Selection, search, scroll ----------------------------------------------------------

export function SearchableTree({ query }: { query: string }) {
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

export function UncontrolledSelection() {
  return <TreeView data={files} defaultSelectedId="cv" aria-label="Files" />;
}

// --- Several search terms ---------------------------------------------------------------

export function TermBadges({ terms }: { terms: string[] }) {
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

// --- Persisting the tree state ----------------------------------------------------------

export function PersistedTree({ data, isLoading }: { data: TreeNode[]; isLoading: boolean }) {
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

// --- Edge cases: empty tree, disabled node, maxDepth ------------------------------------

export function EmptyTree() {
  return <TreeView data={[]} emptyState={<p>Nothing here yet</p>} aria-label="Empty tree" />;
}

const withDisabled: TreeNode[] = [
  { id: "a", label: "Editable" },
  { id: "b", label: "Read only", isDisabled: true },
];

export function DisabledNodeTree() {
  return <TreeView data={withDisabled} aria-label="With a disabled node" />;
}

export function DepthLimitedTree() {
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

// --- Context menu -----------------------------------------------------------------------

export function TreeWithContextMenu() {
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

export function StandaloneContextMenu() {
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

export function CheckableTree() {
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

// --- Helpers ----------------------------------------------------------------------------

export function moveExample() {
  const moved = moveNode(files, "notes", "docs", 0);
  const nextTree = moved.tree; // the new tree (same array as `files` if the move was invalid)
  return nextTree;
}

export function helperExamples() {
  const flat = flattenTree(files, ["docs"]);
  const projection = getProjection(flat, "cv", "reports", "inside", 3);
  const parentId = calculateNewParent(flat, 2, "inside");
  const moved = moveNode(files, "notes", "docs", 0);
  const height = getSubtreeHeight(files[0]!);
  const duplicates = findDuplicateIds(files);
  const ancestors = getAncestorIds(files, "q2");
  const sibling = getSiblingDropTarget(flat, "cv", 2);
  const target = getDropTarget(flat, "cv", 2, getDropZone(0.5), 3);
  return { projection, parentId, moved, height, duplicates, ancestors, sibling, target };
}
