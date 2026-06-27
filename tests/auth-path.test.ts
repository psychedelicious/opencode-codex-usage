import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { resolveAuthPath, resolveAuthPaths } from "../lib/auth-path.js";

test("uses explicit OPENCODE_AUTH_PATH override", () => {
  const actual = resolveAuthPath({
    platform: "win32",
    env: { OPENCODE_AUTH_PATH: "C:\\custom\\auth.json" },
    homeDir: "C:\\Users\\alice",
  });

  assert.equal(actual, "C:\\custom\\auth.json");
  assert.deepEqual(
    resolveAuthPaths({
      platform: "win32",
      env: { OPENCODE_AUTH_PATH: "C:\\custom\\auth.json" },
      homeDir: "C:\\Users\\alice",
    }),
    ["C:\\custom\\auth.json"],
  );
});

test("resolves Windows default from LOCALAPPDATA", () => {
  const actual = resolveAuthPath({
    platform: "win32",
    env: { LOCALAPPDATA: "C:\\Users\\alice\\AppData\\Local" },
    homeDir: "C:\\Users\\alice",
  });

  assert.equal(actual, path.join("C:\\Users\\alice\\AppData\\Local", "opencode", "auth.json"));
});

test("resolves current macOS OpenCode auth path first", () => {
  const actual = resolveAuthPath({
    platform: "darwin",
    env: {},
    homeDir: "/Users/alice",
  });

  assert.equal(actual, "/Users/alice/.local/share/opencode/auth.json");
});

test("includes legacy macOS auth path as fallback", () => {
  const actual = resolveAuthPaths({
    platform: "darwin",
    env: {},
    homeDir: "/Users/alice",
  });

  assert.deepEqual(actual, [
    "/Users/alice/.local/share/opencode/auth.json",
    "/Users/alice/Library/Application Support/opencode/auth.json",
  ]);
});

test("honors XDG_DATA_HOME on macOS", () => {
  const actual = resolveAuthPath({
    platform: "darwin",
    env: { XDG_DATA_HOME: "/tmp/xdg-data" },
    homeDir: "/Users/alice",
  });

  assert.equal(actual, "/tmp/xdg-data/opencode/auth.json");
});

test("resolves Linux default with XDG_DATA_HOME", () => {
  const actual = resolveAuthPath({
    platform: "linux",
    env: { XDG_DATA_HOME: "/tmp/xdg-data" },
    homeDir: "/home/alice",
  });

  assert.equal(actual, "/tmp/xdg-data/opencode/auth.json");
});
