import { appendFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { RGBA } from "@opentui/core";
import { createMemo, createSignal } from "solid-js";
import { probeQuota, type ProbeSnapshot } from "./lib/codex-usage-probe.js";
import {
  messageFromParsed,
  resolveToastDurationMs,
  toastBodyFromParsed,
} from "./lib/codex-usage-toast-plugin.js";

type TuiToast = {
  title?: string;
  message: string;
  variant?: "info" | "success" | "warning" | "error";
  duration?: number;
};

type TuiColor = string | RGBA;

type TuiApi = {
  command: {
    register: (
      callback: () => Array<{
        title: string;
        value: string;
        description: string;
        category: string;
        slash: { name: string };
        onSelect: () => void;
      }>,
    ) => () => void;
  };
  slots?: {
    register: (plugin: {
      order: number;
      slots: {
        sidebar_content: (_ctx: unknown, props: { session_id: string }) => unknown;
      };
    }) => string | (() => void);
  };
  theme?: {
    current: {
      text?: TuiColor;
      textMuted?: TuiColor;
      warning?: TuiColor;
      error?: TuiColor;
      success?: TuiColor;
      info?: TuiColor;
    };
  };
  ui: {
    toast: (input: TuiToast) => void;
  };
  lifecycle: {
    onDispose: (dispose: () => void) => () => void;
  };
  kv?: {
    get: <Value = unknown>(key: string, fallback?: Value) => Value;
    set: (key: string, value: unknown) => void;
  };
};

type SidebarState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; parsed: ProbeSnapshot; updatedAt: number }
  | { state: "error"; detail: string; updatedAt: number };

const TUI_DEBUG_ENV = "OPENCODE_CODEX_USAGE_TUI_DEBUG";
const SIDEBAR_STATE_KEY = "opencode-codex-usage:sidebar-state";
const debugLogPath = path.join(os.tmpdir(), "opencode-codex-usage-tui-debug.log");

const debugEnabled = (): boolean => {
  const value = process.env[TUI_DEBUG_ENV]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
};

const debugLog = (message: string, extra: Record<string, unknown> = {}): void => {
  if (!debugEnabled()) return;
  const line = JSON.stringify({ time: new Date().toISOString(), message, ...extra });
  void appendFile(debugLogPath, `${line}\n`, "utf8").catch(() => undefined);
};

const stripStatusPrefix = (message: string): string => message.replace(/^\S+\s+/, "");

const sidebarRowsFromParsed = (parsed: ProbeSnapshot): string[] => {
  const probeError = parsed.error?.trim();
  if (probeError) return [probeError];

  return stripStatusPrefix(messageFromParsed(parsed)).split(" | ");
};

const formatUpdatedAt = (updatedAt: number): string => {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(updatedAt));
};

function SidebarView(props: { api: TuiApi; state: () => SidebarState }) {
  const sidebarState = createMemo(
    () => props.api.kv?.get<SidebarState>(SIDEBAR_STATE_KEY, props.state()) ?? props.state(),
  );
  const theme = () => props.api.theme?.current;
  const text = () => theme()?.text;
  const muted = () => theme()?.textMuted;
  const statusColor = (status: string | undefined): TuiColor | undefined => {
    if (status === "ok") return theme()?.success ?? text();
    if (status === "warn" || status === "critical") return theme()?.warning ?? text();
    if (status === "error") return theme()?.error ?? text();
    return theme()?.info ?? muted();
  };

  return (
    <box>
      <text fg={text()}>
        <b>Codex usage</b>
      </text>
      {(() => {
        const current = sidebarState();
        if (current.state === "idle") {
          return <text fg={muted()}>Run /codex-usage to refresh.</text>;
        }

        if (current.state === "loading") {
          return <text fg={muted()}>Refreshing quota...</text>;
        }

        if (current.state === "error") {
          return (
            <box>
              <text fg={theme()?.error ?? text()}>Quota error</text>
              <text fg={muted()}>{current.detail}</text>
              <text fg={muted()}>Updated {formatUpdatedAt(current.updatedAt)}</text>
            </box>
          );
        }

        return (
          <box>
            <text fg={statusColor(current.parsed.status)}>
              {current.parsed.status ?? "unknown"}
            </text>
            {sidebarRowsFromParsed(current.parsed).map((row) => (
              <text fg={muted()}>{row}</text>
            ))}
            <text fg={muted()}>Updated {formatUpdatedAt(current.updatedAt)}</text>
          </box>
        );
      })()}
    </box>
  );
}

export const CodexQuotaTuiPlugin = async (api: TuiApi): Promise<void> => {
  const toastDurationMs = resolveToastDurationMs();
  const [sidebarState, setSidebarState] = createSignal<SidebarState>({ state: "idle" });
  let running = false;

  const updateSidebarState = (next: SidebarState): void => {
    setSidebarState(next);
    api.kv?.set(SIDEBAR_STATE_KEY, next);
  };

  debugLog("tui plugin loaded", {
    hasCommandRegister: typeof api.command?.register,
    hasToast: typeof api.ui?.toast,
  });

  if (debugEnabled()) {
    api.ui.toast({
      title: "Codex usage debug",
      message: `/codex-usage TUI plugin loaded; log: ${debugLogPath}`,
      variant: "info",
      duration: 10_000,
    });
  }

  const runProbe = async (): Promise<void> => {
    debugLog("run probe requested", { running });
    if (running) return;
    running = true;
    updateSidebarState({ state: "loading" });

    try {
      const parsed = await probeQuota();
      const probeError = parsed.error?.trim();
      if (probeError) {
        updateSidebarState({ state: "error", detail: probeError, updatedAt: Date.now() });
        api.ui.toast({
          title: "Codex quota 🚨",
          message: `🚨 Quota error | ${probeError}`,
          variant: "error",
          duration: toastDurationMs,
        });
        return;
      }

      updateSidebarState({ state: "ready", parsed, updatedAt: Date.now() });
      api.ui.toast(toastBodyFromParsed(parsed, toastDurationMs));
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      updateSidebarState({ state: "error", detail, updatedAt: Date.now() });
      api.ui.toast({
        title: "Codex quota 🚨",
        message: `🚨 Quota error | ${detail}`,
        variant: "error",
        duration: toastDurationMs,
      });
    } finally {
      running = false;
    }
  };

  let disposeSidebar: (() => void) | undefined;
  const sidebarRegistration = api.slots?.register({
    order: 350,
    slots: {
      sidebar_content() {
        return <SidebarView api={api} state={sidebarState} />;
      },
    },
  });
  if (typeof sidebarRegistration === "function") {
    disposeSidebar = sidebarRegistration;
  }

  const dispose = api.command.register(() => [
    ...(() => {
      const command = {
        title: "Codex usage",
        value: "codex-usage",
        description: "Show Codex quota",
        category: "Codex",
        slash: { name: "codex-usage" },
        onSelect: () => {
          debugLog("command selected");
          void runProbe();
        },
      };
      debugLog("register callback returned command", {
        value: command.value,
        slashName: command.slash.name,
      });
      return [command];
    })(),
  ]);
  debugLog("command registered");

  api.lifecycle.onDispose(() => {
    debugLog("tui plugin disposed");
    disposeSidebar?.();
    dispose();
  });
};

export default { id: "opencode-codex-usage", tui: CodexQuotaTuiPlugin };
