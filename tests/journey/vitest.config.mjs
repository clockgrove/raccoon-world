// Run by scripts/qualify.sh through the pinned Clockgrove checkout's Vitest, with CLOCKGROVE_DIR set.
// This repository has no npm project, so the config is a plain object and the test file's `vitest`
// import is aliased to the checkout's copy: one Vitest instance runs and registers the journey.
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.CI !== "true")
  throw new Error(
    "real browser journey requires explicit CI invocation after pinned browser installation",
  );
const clockgrove = process.env.CLOCKGROVE_DIR;
if (!clockgrove) throw new Error("CLOCKGROVE_DIR is not set; run scripts/qualify.sh journey");
const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  root: here,
  resolve: { alias: { vitest: path.join(clockgrove, "node_modules/vitest/dist/index.js") } },
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    expect: { poll: { timeout: 30_000 } },
    environment: "node",
    include: ["s6.journey.test.mjs"],
    fileParallelism: false,
  },
};
