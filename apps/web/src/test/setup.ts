import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  // Files that opt into the node environment have no DOM storage, and Node
  // below 25 defines no sessionStorage of its own.
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
});
