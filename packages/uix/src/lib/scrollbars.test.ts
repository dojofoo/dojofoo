import { afterEach, expect, it, vi } from "vitest";
import { revealScrollbars } from "./scrollbars";

afterEach(() => vi.unstubAllGlobals());

it("can initialize and clean up during server rendering", () => {
  expect(revealScrollbars()).toBeTypeOf("function");
});

it("shares document listeners and releases them after the last provider unmounts", () => {
  const owner = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("document", owner);
  const first = revealScrollbars();
  const second = revealScrollbars();
  expect(owner.addEventListener).toHaveBeenCalledTimes(3);
  first();
  first();
  expect(owner.removeEventListener).not.toHaveBeenCalled();
  second();
  expect(owner.removeEventListener).toHaveBeenCalledTimes(3);
  const remount = revealScrollbars();
  expect(owner.addEventListener).toHaveBeenCalledTimes(6);
  remount();
  expect(owner.removeEventListener).toHaveBeenCalledTimes(6);
});
