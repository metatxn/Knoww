import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Node's Web Storage globals can shadow jsdom's per-file browser storage.
const browserWindow = (
  globalThis as typeof globalThis & {
    jsdom?: { window: Pick<Window, "localStorage" | "sessionStorage"> };
  }
).jsdom?.window;
if (browserWindow) {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: browserWindow[key],
    });
  }
}

afterEach(() => {
  cleanup();
  if (browserWindow) browserWindow.localStorage.clear();
  // Files that opt into the node environment have no DOM storage, and Node
  // below 25 defines no sessionStorage of its own.
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
});
