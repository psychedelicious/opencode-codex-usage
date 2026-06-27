import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { probeQuota } from "../lib/codex-usage-probe.js";

const successResponse = (): Response => {
  return new Response("data: [DONE]\n", {
    status: 200,
    headers: {
      "x-codex-primary-used-percent": "1",
      "x-codex-secondary-used-percent": "2",
      "x-codex-primary-reset-after-seconds": "3600",
      "x-codex-secondary-reset-after-seconds": "7200",
    },
  });
};

const withAuthPath = async <Result>(
  authPath: string,
  run: () => Promise<Result>,
): Promise<Result> => {
  const previous = process.env.OPENCODE_AUTH_PATH;
  process.env.OPENCODE_AUTH_PATH = authPath;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.OPENCODE_AUTH_PATH;
    else process.env.OPENCODE_AUTH_PATH = previous;
  }
};

test("probeQuota uses OPENCODE_AUTH_PATH as the exclusive auth source", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "codex-auth-loading-"));
  const authPath = path.join(dir, "auth.json");
  try {
    await writeFile(authPath, JSON.stringify({ openai: { access: "token" } }), "utf8");
    let calls = 0;

    const snapshot = await withAuthPath(authPath, () =>
      probeQuota({
        model: "gpt-5.5",
        fetchImpl: (async () => {
          calls += 1;
          return successResponse();
        }) as typeof fetch,
      }),
    );

    assert.equal(calls, 1);
    assert.equal(snapshot.statusCode, 200);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("probeQuota fails immediately when configured auth file has invalid contents", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "codex-auth-loading-"));
  const authPath = path.join(dir, "auth.json");
  try {
    await writeFile(authPath, JSON.stringify({ openai: { access: 123 } }), "utf8");
    const snapshot = await withAuthPath(authPath, () =>
      probeQuota({
        model: "gpt-5.5",
        fetchImpl: (async () => {
          throw new Error("fetch should not run");
        }) as typeof fetch,
      }),
    );

    assert.equal(snapshot.status, "error");
    assert.equal(snapshot.statusCode, "auth");
    assert.match(snapshot.error ?? "", /Invalid input|invalid/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("probeQuota fails immediately when configured auth file has no access token", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "codex-auth-loading-"));
  const authPath = path.join(dir, "auth.json");
  try {
    await writeFile(authPath, JSON.stringify({ openai: { accountId: "acct" } }), "utf8");
    const snapshot = await withAuthPath(authPath, () =>
      probeQuota({
        model: "gpt-5.5",
        fetchImpl: (async () => {
          throw new Error("fetch should not run");
        }) as typeof fetch,
      }),
    );

    assert.equal(snapshot.status, "error");
    assert.equal(snapshot.statusCode, "auth");
    assert.match(snapshot.error ?? "", /missing access token/);
    assert.match(snapshot.error ?? "", /auth\.json/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
