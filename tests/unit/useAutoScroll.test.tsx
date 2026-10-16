// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getScrollSpeed, useAutoScroll } from "../../src/useAutoScroll";

const rect = { top: 100, bottom: 500 };

describe("getScrollSpeed", () => {
  it("is 0 outside both bands", () => {
    expect(getScrollSpeed(300, rect, 40, 20)).toBe(0);
    expect(getScrollSpeed(140, rect, 40, 20)).toBe(0); // inner border of the top band
    expect(getScrollSpeed(460, rect, 40, 20)).toBe(0); // inner border of the bottom band
  });

  it("scrolls down in the bottom band, faster closer to the edge", () => {
    const far = getScrollSpeed(470, rect, 40, 20);
    const near = getScrollSpeed(490, rect, 40, 20);
    expect(far).toBeGreaterThan(0);
    expect(near).toBeGreaterThan(far);
    expect(getScrollSpeed(500, rect, 40, 20)).toBe(20);
  });

  it("scrolls up (negative) in the top band, faster closer to the edge", () => {
    const far = getScrollSpeed(130, rect, 40, 20);
    const near = getScrollSpeed(110, rect, 40, 20);
    expect(far).toBeLessThan(0);
    expect(near).toBeLessThan(far);
    expect(getScrollSpeed(100, rect, 40, 20)).toBe(-20);
  });

  it("is proportional and capped at maxSpeed past the edge", () => {
    expect(getScrollSpeed(480, rect, 40, 20)).toBeCloseTo(10);
    expect(getScrollSpeed(900, rect, 40, 20)).toBe(20);
    expect(getScrollSpeed(-50, rect, 40, 20)).toBe(-20);
  });

  it("is 0 for invalid threshold, speed or pointer", () => {
    expect(getScrollSpeed(499, rect, 0, 20)).toBe(0);
    expect(getScrollSpeed(499, rect, -5, 20)).toBe(0);
    expect(getScrollSpeed(499, rect, 40, 0)).toBe(0);
    expect(getScrollSpeed(499, rect, Number.NaN, 20)).toBe(0);
    expect(getScrollSpeed(Number.NaN, rect, 40, 20)).toBe(0);
  });

  it("picks the nearest edge when the bands overlap (short container)", () => {
    const short = { top: 0, bottom: 50 };
    expect(getScrollSpeed(10, short, 40, 20)).toBeLessThan(0);
    expect(getScrollSpeed(40, short, 40, 20)).toBeGreaterThan(0);
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
    let top = 0;
    const rectSpy = vi.fn(() => ({ top: 100, bottom: 500, left: 0, right: 300 }) as DOMRect);
    el.getBoundingClientRect = rectSpy;
    Object.defineProperty(el, "scrollTop", {
      get: () => top,
      set: (v: number) => {
        top = Math.max(0, Math.min(scrollHeight - clientHeight, v));
      },
    });
    return { el, rectSpy };
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function setup(y: number, opts: { active?: boolean; enabled?: boolean; el?: HTMLElement } = {}) {
    const { el, rectSpy } = makeContainer();
    const container = { current: opts.el ?? el };
    const pointer = { current: { x: 50, y } };
    const onScrolled = vi.fn();
    const view = renderHook(
      (props: { active: boolean; enabled: boolean }) =>
        useAutoScroll({
          ...props,
          containerRef: container,
          pointerRef: pointer,
          threshold: 40,
          maxSpeed: 20,
          onScrolled,
        }),
      { initialProps: { active: opts.active ?? true, enabled: opts.enabled ?? true } },
    );
    return { el, rectSpy, pointer, onScrolled, view };
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

  it("cancels the pending frame and removes the listener when the drag ends", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { el, view } = setup(500);
    runFrame();
    expect(frames.size).toBe(1);
    view.rerender({ active: false, enabled: true });
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
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
    expect(frames.size).toBe(0);
    const at = el.scrollTop;
    runFrame();
    expect(el.scrollTop).toBe(at);
    expect(errors).not.toHaveBeenCalled();
  });
});
