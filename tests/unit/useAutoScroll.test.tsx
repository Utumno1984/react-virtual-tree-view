// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContainerGeometry } from "../../src/dnd-internal";
import { getScrollSpeed, useAutoScroll } from "../../src/useAutoScroll";

const rect = { top: 100, bottom: 500, left: 0, right: 300 };
const X = 50;

describe("getScrollSpeed", () => {
  it("is 0 outside both bands", () => {
    expect(getScrollSpeed(X, 300, rect, 40, 20)).toBe(0);
    expect(getScrollSpeed(X, 140, rect, 40, 20)).toBe(0); // inner border of the top band
    expect(getScrollSpeed(X, 460, rect, 40, 20)).toBe(0); // inner border of the bottom band
  });

  it("scrolls down in the bottom band, faster closer to the edge", () => {
    const far = getScrollSpeed(X, 470, rect, 40, 20);
    const near = getScrollSpeed(X, 490, rect, 40, 20);
    expect(far).toBeGreaterThan(0);
    expect(near).toBeGreaterThan(far);
    expect(getScrollSpeed(X, 500, rect, 40, 20)).toBe(20);
  });

  it("scrolls up (negative) in the top band, faster closer to the edge", () => {
    const far = getScrollSpeed(X, 130, rect, 40, 20);
    const near = getScrollSpeed(X, 110, rect, 40, 20);
    expect(far).toBeLessThan(0);
    expect(near).toBeLessThan(far);
    expect(getScrollSpeed(X, 100, rect, 40, 20)).toBe(-20);
  });

  it("is proportional and capped at maxSpeed within one threshold past the edge", () => {
    expect(getScrollSpeed(X, 480, rect, 40, 20)).toBeCloseTo(10);
    expect(getScrollSpeed(X, 520, rect, 40, 20)).toBe(20);
    expect(getScrollSpeed(X, 540, rect, 40, 20)).toBe(20); // exactly one threshold past
    expect(getScrollSpeed(X, 60, rect, 40, 20)).toBe(-20);
  });

  // Replaces `getScrollSpeed(900, ...) === 20` / `(-50, ...) === -20`: that encoded the bug
  // of scrolling at full speed for any y beyond the edge, however far away.
  it("is 0 when the pointer is far beyond the top/bottom edge", () => {
    expect(getScrollSpeed(X, 900, rect, 40, 20)).toBe(0);
    expect(getScrollSpeed(X, 541, rect, 40, 20)).toBe(0);
    expect(getScrollSpeed(X, -50, rect, 40, 20)).toBe(0);
    expect(getScrollSpeed(X, 59, rect, 40, 20)).toBe(0);
  });

  it("is 0 when the pointer is horizontally outside the container", () => {
    expect(getScrollSpeed(600, 499, rect, 40, 20)).toBe(0); // 300 px to the right
    expect(getScrollSpeed(-1, 499, rect, 40, 20)).toBe(0);
    expect(getScrollSpeed(-1, 101, rect, 40, 20)).toBe(0);
    expect(getScrollSpeed(300, 499, rect, 40, 20)).toBeGreaterThan(0); // on the border
    expect(getScrollSpeed(0, 499, rect, 40, 20)).toBeGreaterThan(0);
  });

  it("is 0 for invalid threshold, speed or pointer", () => {
    expect(getScrollSpeed(X, 499, rect, 0, 20)).toBe(0);
    expect(getScrollSpeed(X, 499, rect, -5, 20)).toBe(0);
    expect(getScrollSpeed(X, 499, rect, 40, 0)).toBe(0);
    expect(getScrollSpeed(X, 499, rect, Number.NaN, 20)).toBe(0);
    expect(getScrollSpeed(X, Number.NaN, rect, 40, 20)).toBe(0);
    expect(getScrollSpeed(Number.NaN, 499, rect, 40, 20)).toBe(0);
  });

  it("is 0 (never Infinity/NaN) for non-finite threshold or maxSpeed", () => {
    expect(getScrollSpeed(X, 499, rect, 40, Infinity)).toBe(0);
    expect(getScrollSpeed(X, 499, rect, Infinity, 20)).toBe(0);
    expect(getScrollSpeed(X, 499, rect, Infinity, Infinity)).toBe(0);
    expect(getScrollSpeed(X, 499, rect, 40, -Infinity)).toBe(0);
  });

  it("picks the nearest edge when the bands overlap (short container)", () => {
    const short = { top: 0, bottom: 50, left: 0, right: 300 };
    expect(getScrollSpeed(X, 10, short, 40, 20)).toBeLessThan(0);
    expect(getScrollSpeed(X, 40, short, 40, 20)).toBeGreaterThan(0);
  });
});

describe("useAutoScroll", () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextId: number;
  let cancelSpy: ReturnType<typeof vi.spyOn>;

  const runFrame = () => {
    const pending = [...frames.entries()];
    frames.clear();
    for (const [, cb] of pending) cb(0);
  };

  function makeContainer(scrollHeight = 5000, clientHeight = 400) {
    const el = document.createElement("div");
    document.body.appendChild(el); // attached, so its scroll events reach window (capture)
    let top = 0;
    const box = { top: 100, bottom: 500, left: 0, right: 300 };
    const rectSpy = vi.fn(() => ({ ...box }) as DOMRect);
    el.getBoundingClientRect = rectSpy;
    const moveBy = (dy: number) => {
      box.top += dy;
      box.bottom += dy;
    };
    Object.defineProperty(el, "scrollTop", {
      get: () => top,
      set: (v: number) => {
        top = Math.max(0, Math.min(scrollHeight - clientHeight, v));
      },
    });
    return { el, rectSpy, moveBy };
  }

  beforeEach(() => {
    frames = new Map();
    nextId = 1;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = nextId++;
      frames.set(id, cb);
      return id;
    });
    cancelSpy = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(((id: number) => {
      frames.delete(id);
    }) as typeof cancelAnimationFrame);
  });

  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function setup(y: number, opts: { active?: boolean; enabled?: boolean; el?: HTMLElement } = {}) {
    const { el, rectSpy, moveBy } = makeContainer();
    const container = { current: opts.el ?? el };
    const pointer = { current: { x: 50, y } };
    const geometryRef: { current: (() => ContainerGeometry) | null } = { current: null };
    const onScrolled = vi.fn();
    const view = renderHook(
      (props: { active: boolean; enabled: boolean }) =>
        useAutoScroll({
          ...props,
          containerRef: container,
          pointerRef: pointer,
          geometryRef,
          threshold: 40,
          maxSpeed: 20,
          onScrolled,
        }),
      { initialProps: { active: opts.active ?? true, enabled: opts.enabled ?? true } },
    );
    return { el, rectSpy, moveBy, pointer, geometryRef, onScrolled, view };
  }

  it("scrolls down while the pointer stays in the bottom band", () => {
    const { el, pointer, onScrolled } = setup(500);
    runFrame();
    runFrame();
    runFrame();
    expect(el.scrollTop).toBe(60);
    expect(onScrolled).toHaveBeenCalledTimes(3);
    pointer.current.y = 490; // closer to the middle of the band: slower
    runFrame();
    expect(el.scrollTop).toBe(75);
  });

  it("scrolls up to 0 and then stops without calling onScrolled", () => {
    const { el, pointer, onScrolled } = setup(100);
    el.scrollTop = 30;
    runFrame();
    expect(el.scrollTop).toBe(10);
    runFrame();
    expect(el.scrollTop).toBe(0);
    onScrolled.mockClear();
    runFrame();
    runFrame();
    expect(el.scrollTop).toBe(0);
    expect(onScrolled).not.toHaveBeenCalled();
    expect(pointer.current.y).toBe(100);
  });

  it("stops at the bottom without oscillating", () => {
    const { el, onScrolled } = setup(500);
    el.scrollTop = 4590;
    runFrame();
    expect(el.scrollTop).toBe(4600);
    onScrolled.mockClear();
    for (let i = 0; i < 5; i++) runFrame();
    expect(el.scrollTop).toBe(4600);
    expect(onScrolled).not.toHaveBeenCalled();
  });

  it("does not scroll when the pointer is outside the bands", () => {
    const { el, onScrolled } = setup(300);
    for (let i = 0; i < 5; i++) runFrame();
    expect(el.scrollTop).toBe(0);
    expect(onScrolled).not.toHaveBeenCalled();
  });

  it("does nothing when not dragging or disabled", () => {
    const idle = setup(500, { active: false });
    expect(frames.size).toBe(0);
    expect(idle.rectSpy).not.toHaveBeenCalled();
    cleanup();
    const off = setup(500, { enabled: false });
    expect(frames.size).toBe(0);
    expect(off.rectSpy).not.toHaveBeenCalled();
  });

  it("does not scroll a container that is not scrollable (short list)", () => {
    const { el, rectSpy } = makeContainer(300, 400);
    const { onScrolled } = setup(500, { el });
    for (let i = 0; i < 4; i++) runFrame();
    expect(el.scrollTop).toBe(0);
    expect(onScrolled).not.toHaveBeenCalled();
    expect(rectSpy).toHaveBeenCalledTimes(1);
  });

  it("reads the container rect once at drag start, not once per frame", () => {
    const { rectSpy } = setup(500);
    for (let i = 0; i < 30; i++) runFrame();
    expect(rectSpy).toHaveBeenCalledTimes(1);
  });

  it("re-reads the rect once on window resize", () => {
    const { rectSpy } = setup(500);
    window.dispatchEvent(new Event("resize"));
    runFrame();
    expect(rectSpy).toHaveBeenCalledTimes(2);
  });

  it("re-reads the rect (once) after the window or an ancestor scrolled, and the bands follow", () => {
    const { el, rectSpy, moveBy } = setup(260);
    runFrame();
    expect(el.scrollTop).toBe(0); // y=260 is mid-container: no scroll
    moveBy(-250); // the page scrolled: the container is now at -150 .. 250
    document.dispatchEvent(new Event("scroll"));
    expect(rectSpy).toHaveBeenCalledTimes(1); // lazy: nothing read until the next use
    runFrame();
    expect(rectSpy).toHaveBeenCalledTimes(2);
    expect(el.scrollTop).toBe(20); // y=260 is now just past the bottom edge: full speed
    runFrame();
    runFrame();
    expect(rectSpy).toHaveBeenCalledTimes(2); // not re-read without a new invalidation
  });

  it("does not invalidate the rect for a scroll of the container itself or of its content", () => {
    const { el, rectSpy } = setup(500);
    runFrame();
    el.dispatchEvent(new Event("scroll"));
    const inner = document.createElement("div");
    el.appendChild(inner);
    inner.dispatchEvent(new Event("scroll"));
    runFrame();
    runFrame();
    expect(rectSpy).toHaveBeenCalledTimes(1);
  });

  it("follows an external scroll of the container (wheel) through the scroll event", () => {
    const { el } = setup(500);
    runFrame();
    expect(el.scrollTop).toBe(20);
    el.scrollTop = 1000; // e.g. the user wheels while dragging
    el.dispatchEvent(new Event("scroll"));
    runFrame();
    expect(el.scrollTop).toBe(1020);
  });

  it("shares the cached geometry through geometryRef while running", () => {
    const { rectSpy, geometryRef, moveBy, view } = setup(300);
    runFrame();
    const first = geometryRef.current?.();
    expect(first?.rect.top).toBe(100);
    expect(geometryRef.current?.().rect).toBe(first?.rect); // same object: no new read
    expect(rectSpy).toHaveBeenCalledTimes(1);
    moveBy(10);
    document.dispatchEvent(new Event("scroll"));
    expect(geometryRef.current?.().rect.top).toBe(110);
    expect(rectSpy).toHaveBeenCalledTimes(2);
    view.rerender({ active: false, enabled: true });
    expect(geometryRef.current).toBeNull();
  });

  it("geometryRef reads scrollTop live outside the tick (external scroll before its event)", () => {
    const { el, geometryRef } = setup(300);
    runFrame();
    el.scrollTop = 160; // programmatic scroll: the `scroll` event has not fired yet
    expect(geometryRef.current?.().scrollTop).toBe(160);
  });

  it("does not scroll when the pointer is far outside horizontally", () => {
    const { el, pointer, onScrolled } = setup(499);
    pointer.current.x = 600; // 300 px to the right of the container
    for (let i = 0; i < 4; i++) runFrame();
    expect(el.scrollTop).toBe(0);
    expect(onScrolled).not.toHaveBeenCalled();
  });

  it("observes the container size and re-reads the rect after a resize entry", () => {
    const callbacks: Array<() => void> = [];
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          callbacks.push(cb);
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const { el, rectSpy, view } = setup(300);
    expect(observe).toHaveBeenCalledWith(el);
    callbacks[0]?.(); // initial callback on observe: ignored
    runFrame();
    expect(rectSpy).toHaveBeenCalledTimes(1);
    callbacks[0]?.(); // real size change
    runFrame();
    runFrame();
    expect(rectSpy).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("does not scroll to Infinity/NaN with non-finite options", () => {
    const { el, onScrolled } = setup(500);
    cleanup();
    const container = { current: el };
    renderHook(() =>
      useAutoScroll({
        active: true,
        enabled: true,
        containerRef: container,
        pointerRef: { current: { x: 50, y: 500 } },
        threshold: Infinity,
        maxSpeed: Infinity,
        onScrolled,
      }),
    );
    runFrame();
    runFrame();
    expect(el.scrollTop).toBe(0);
    expect(onScrolled).not.toHaveBeenCalled();
  });

  it("cancels the pending frame and removes the listeners when the drag ends", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { el, view } = setup(500);
    runFrame();
    expect(frames.size).toBe(1);
    view.rerender({ active: false, enabled: true });
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function), { capture: true });
    expect(frames.size).toBe(0);
    const at = el.scrollTop;
    runFrame();
    expect(el.scrollTop).toBe(at);
  });

  it("cancels the pending frame and removes the listener on unmount mid-drag", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { el, view } = setup(500);
    runFrame();
    view.unmount();
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function), { capture: true });
    expect(frames.size).toBe(0);
    const at = el.scrollTop;
    runFrame();
    expect(el.scrollTop).toBe(at);
    expect(errors).not.toHaveBeenCalled();
  });
});
