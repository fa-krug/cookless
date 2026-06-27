import { configDefaults, defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // `next build` emits a traced copy of the source (incl. *.test.* files) under
    // .next/standalone; without this exclude vitest discovers every test twice and
    // the copies fail resolving deps from the standalone node_modules.
    exclude: [...configDefaults.exclude, "**/.next/**"],
  },
});
