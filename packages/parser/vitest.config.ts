import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run tests in Node environment (no browser DOM needed).
    environment: "node",
    // Include test files under test/ directory.
    include: ["test/**/*.test.ts"],
    // Vitest resolves TypeScript source directly via its built-in transform,
    // so tests can import from "../src/index.js" (NodeNext .js extension) and
    // have them resolved to "../src/index.ts" at test time.
  },
});
