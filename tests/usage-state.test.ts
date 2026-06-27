import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  readUsageState,
  resolveUsageStatePath,
  usageStateFromError,
  usageStateFromParsed,
  writeUsageState,
} from "../lib/codex-usage-state.js";

test("usage state path uses per-user temp path by default", () => {
  assert.match(resolveUsageStatePath({ USER: "alice@example" }), /opencode-codex-usage-state/);
});

test("usage state path honors explicit environment override", () => {
  assert.equal(
    resolveUsageStatePath({ OPENCODE_CODEX_USAGE_STATE_PATH: "./tmp/state.json" }),
    path.resolve("./tmp/state.json"),
  );
});

test("writes and reads usage state snapshots", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "codex-usage-state-"));
  const filePath = path.join(dir, "state.json");
  try {
    const state = usageStateFromParsed(
      {
        status: "warn",
        used: { primary: 81, secondary: 9 },
        reset: { primary: "1h0m", secondary: "7d0h" },
      },
      123,
    );

    await writeUsageState(state, filePath);
    assert.deepEqual(await readUsageState(filePath), state);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("converts probe and thrown errors into error states", () => {
  assert.deepEqual(usageStateFromParsed({ status: "error", error: "missing token" }, 123), {
    state: "error",
    detail: "missing token",
    updatedAt: 123,
  });
  assert.deepEqual(usageStateFromError(new Error("boom"), 123), {
    state: "error",
    detail: "boom",
    updatedAt: 123,
  });
});
