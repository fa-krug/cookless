import { configDefaults, defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
const supportsLocalStorageFile = nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 4);

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
    // Node 22.4+ ships a built-in global `localStorage`/`sessionStorage`
    // (on by default in the Node versions we run tests with) that is left
    // broken (missing methods like `.clear()`) unless `--localstorage-file`
    // points at a real path. Vitest's jsdom environment only installs
    // jsdom's own `window.localStorage` for globals not already present on
    // `globalThis`, so Node's stub silently shadows jsdom's working
    // implementation in every `@vitest-environment jsdom` test. Pointing it
    // at a real file keeps Node's global functional so jsdom can take over
    // normally. See https://github.com/vitest-dev/vitest/issues/8757.
    // The flag is unrecognized before Node 22.4, so gate it on the running
    // Node version — older Node doesn't have the broken global to begin
    // with, so jsdom's localStorage works fine without the flag.
    execArgv: supportsLocalStorageFile
      ? ["--localstorage-file", resolve(tmpdir(), `vitest-${process.pid}.localstorage`)]
      : [],
    // `next build` emits a traced copy of the source (incl. *.test.* files) under
    // .next/standalone; without this exclude vitest discovers every test twice and
    // the copies fail resolving deps from the standalone node_modules.
    exclude: [...configDefaults.exclude, "**/.next/**"],
  },
});
