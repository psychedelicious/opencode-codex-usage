import type { RGBA } from "@opentui/core";
import { createMemo, createSignal, type Accessor } from "solid-js";
import { type ProbeSnapshot } from "./codex-usage-probe.js";
import { messageFromParsed } from "./codex-usage-toast-plugin.js";

type TuiColor = string | RGBA;

export type CodexUsageSidebarApi = {
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
      error?: TuiColor;
    };
  };
  kv?: {
    get: <Value = unknown>(key: string, fallback?: Value) => Value;
    set: (key: string, value: unknown) => void;
  };
};

export type CodexUsageSidebarState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; parsed: ProbeSnapshot; updatedAt: number }
  | { state: "error"; detail: string; updatedAt: number };

const SIDEBAR_STATE_KEY = "opencode-codex-usage:sidebar-state";

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

function SidebarView(props: {
  api: CodexUsageSidebarApi;
  state: Accessor<CodexUsageSidebarState>;
}) {
  const sidebarState = createMemo(
    () =>
      props.api.kv?.get<CodexUsageSidebarState>(SIDEBAR_STATE_KEY, props.state()) ?? props.state(),
  );
  const theme = () => props.api.theme?.current;
  const text = () => theme()?.text;
  const muted = () => theme()?.textMuted;

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

export const createCodexUsageSidebar = (api: CodexUsageSidebarApi) => {
  const [state, setState] = createSignal<CodexUsageSidebarState>({ state: "idle" });

  return {
    set(next: CodexUsageSidebarState): void {
      setState(next);
      api.kv?.set(SIDEBAR_STATE_KEY, next);
    },
    register(): (() => void) | undefined {
      const registration = api.slots?.register({
        order: 350,
        slots: {
          sidebar_content() {
            return <SidebarView api={api} state={state} />;
          },
        },
      });

      return typeof registration === "function" ? registration : undefined;
    },
  };
};
