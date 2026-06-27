import assert from "node:assert/strict";
import test from "node:test";
import TuiPluginModule from "../tui.js";
import { CodexQuotaTuiPlugin } from "../tui.js";

test("tui path plugin exports a stable id", () => {
  assert.equal((TuiPluginModule as Record<string, unknown>).id, "opencode-codex-usage");
});

type RegisteredCommand = {
  title: string;
  value: string;
  description: string;
  category: string;
  slash: { name: string };
  onSelect: () => void;
};

test("tui plugin registers codex usage as a slash command", async () => {
  let commands: RegisteredCommand[] = [];
  let sidebarSlot: ((ctx: unknown, props: { session_id: string }) => unknown) | undefined;
  const disposers: Array<() => void> = [];
  const api = {
    command: {
      register: (callback: () => RegisteredCommand[]) => {
        commands = callback();
        const dispose = () => undefined;
        disposers.push(dispose);
        return dispose;
      },
    },
    slots: {
      register: (plugin: {
        order: number;
        slots: {
          sidebar_content: (ctx: unknown, props: { session_id: string }) => unknown;
        };
      }) => {
        assert.equal(plugin.order, 350);
        sidebarSlot = plugin.slots.sidebar_content;
        return () => undefined;
      },
    },
    lifecycle: {
      onDispose: (dispose: () => void) => {
        disposers.push(dispose);
        return () => undefined;
      },
    },
    ui: {
      toast: () => undefined,
    },
  };

  await CodexQuotaTuiPlugin(api);

  assert.deepEqual(commands, [
    {
      title: "Codex usage",
      value: "codex-usage",
      description: "Show Codex quota",
      category: "Codex",
      slash: { name: "codex-usage" },
      onSelect: commands[0]?.onSelect,
    },
  ]);
  assert.equal(typeof commands[0]?.onSelect, "function");
  assert.equal(typeof sidebarSlot, "function");

  disposers.forEach((dispose) => dispose());
});
