// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeView } from "../../src";
import type { TreeNode } from "../../src";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

class FakeRO {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const flat = (n: number): TreeNode[] =>
  Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `N${i}` }));

describe("TreeView first render is environment independent (SSR hydration)", () => {
  it("renders the same markup with and without ResizeObserver", () => {
    const withoutRO = renderToString(<TreeView data={flat(500)} rowHeight={32} />);
    vi.stubGlobal("ResizeObserver", FakeRO);
    const withRO = renderToString(<TreeView data={flat(500)} rowHeight={32} />);
    expect(withoutRO).toBe(withRO);
    expect((withRO.match(/role="treeitem"/g) ?? []).length).toBeLessThan(20);
  });

  it("hydrates server markup without mismatch errors", async () => {
    const markup = renderToString(<TreeView data={flat(500)} rowHeight={32} />);
    const container = document.createElement("div");
    container.innerHTML = markup;
    document.body.appendChild(container);
    vi.stubGlobal("ResizeObserver", FakeRO);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const onRecoverableError = vi.fn();
    await act(async () => {
      hydrateRoot(container, <TreeView data={flat(500)} rowHeight={32} />, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });
});
