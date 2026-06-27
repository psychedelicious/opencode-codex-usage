import assert from "node:assert/strict";
import test from "node:test";
import { shouldApplyUsageFileState } from "../lib/codex-usage-sidebar.js";
import { type UsageStateSnapshot } from "../lib/codex-usage-state.js";

const readyState = (updatedAt: number): UsageStateSnapshot => ({
  state: "ready",
  parsed: { status: "ok" },
  updatedAt,
});

test("sidebar applies file state when idle", () => {
  assert.equal(shouldApplyUsageFileState({ state: "idle" }, readyState(100)), true);
});

test("sidebar does not overwrite active refresh loading state from file", () => {
  assert.equal(shouldApplyUsageFileState({ state: "loading" }, readyState(100)), false);
});

test("sidebar applies only newer file states after a local result", () => {
  assert.equal(shouldApplyUsageFileState(readyState(100), readyState(101)), true);
  assert.equal(shouldApplyUsageFileState(readyState(100), readyState(100)), false);
  assert.equal(shouldApplyUsageFileState(readyState(100), readyState(99)), false);
});
