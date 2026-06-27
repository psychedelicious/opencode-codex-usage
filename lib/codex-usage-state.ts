import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { type ProbeSnapshot } from "./codex-usage-probe.js";

export const STATE_FILENAME = ".opencode-codex-usage-state";
const STATE_PATH_ENV = "OPENCODE_CODEX_USAGE_STATE_PATH";

const stateOwnerTag = (env: NodeJS.ProcessEnv = process.env): string => {
  if (typeof process.getuid === "function") return `uid-${process.getuid()}`;

  const rawUser = env.USER ?? env.USERNAME ?? "unknown";
  return `user-${rawUser.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
};

export type UsageStateSnapshot =
  | { state: "ready"; parsed: ProbeSnapshot; updatedAt: number }
  | { state: "error"; detail: string; updatedAt: number };

const UsageStateSnapshotSchema = z.union([
  z.object({
    state: z.literal("ready"),
    parsed: z.record(z.string(), z.unknown()),
    updatedAt: z.number().int().nonnegative(),
  }),
  z.object({
    state: z.literal("error"),
    detail: z.string(),
    updatedAt: z.number().int().nonnegative(),
  }),
]);

export const resolveUsageStatePath = (env: NodeJS.ProcessEnv = process.env): string => {
  const configured = env[STATE_PATH_ENV]?.trim();
  if (configured) return path.resolve(configured);

  return path.join(os.tmpdir(), `${STATE_FILENAME}-${stateOwnerTag(env)}`);
};

export const usageStateFromParsed = (
  parsed: ProbeSnapshot,
  nowMs = Date.now(),
): UsageStateSnapshot => {
  const probeError = parsed.error?.trim();
  if (probeError) return { state: "error", detail: probeError, updatedAt: nowMs };
  return { state: "ready", parsed, updatedAt: nowMs };
};

export const usageStateFromError = (
  error: unknown,
  nowMs = Date.now(),
): Extract<UsageStateSnapshot, { state: "error" }> => {
  const detail = error instanceof Error ? error.message : String(error);
  return { state: "error", detail, updatedAt: nowMs };
};

export const writeUsageState = async (
  state: UsageStateSnapshot,
  filePath = resolveUsageStatePath(),
): Promise<void> => {
  await writeFile(filePath, `${JSON.stringify(state)}\n`, "utf8");
};

export const readUsageState = async (
  filePath = resolveUsageStatePath(),
): Promise<UsageStateSnapshot | undefined> => {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = UsageStateSnapshotSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return undefined;
    return parsed.data as UsageStateSnapshot;
  } catch {
    return undefined;
  }
};
