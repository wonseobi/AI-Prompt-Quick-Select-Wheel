// Browser-only stand-in for the Tauri backend, used by `npm run dev` so the UI
// can be built and previewed in any browser. Never used inside the app.

import type { Config, Loadout, Slot } from "./types";

const defaultSlots: Slot[] = [
  { icon: "🔍", label: "Code review", prompt: "Review this code for bugs, edge cases and readability." },
  { icon: "🐛", label: "Debug", prompt: "Here is an error. Explain the root cause, then give the smallest fix." },
  { icon: "🧪", label: "Write tests", prompt: "Write focused tests for this code." },
  { icon: "✂️", label: "Simplify", prompt: "Simplify this code without changing its behavior." },
  { icon: "🧭", label: "Plan first", prompt: "Before writing any code, outline your plan." },
  { icon: "📖", label: "Explain", prompt: "Explain what this code does as if I'm new to the codebase." },
  { icon: "💬", label: "Commit msg", prompt: "Write a concise git commit message for these changes." },
  { icon: "🎯", label: "Be concise", prompt: "Keep your answer short and direct." },
];

let config: Config = {
  version: 1,
  hotkey: "Alt+KeyQ",
  activation: "hold",
  placement: "cursor",
  slots: defaultSlots,
};

const bus = new EventTarget();

export const mock = {
  on(event: string, handler: (payload: unknown) => void) {
    const listener = (e: Event) => handler((e as CustomEvent).detail);
    bus.addEventListener(event, listener);
    return () => bus.removeEventListener(event, listener);
  },

  emit(event: string, payload: unknown = null) {
    bus.dispatchEvent(new CustomEvent(event, { detail: payload }));
  },

  get config() {
    return config;
  },

  async invoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
    switch (cmd) {
      case "get_config":
        return structuredClone(config);
      case "save_config":
        config = structuredClone(args.config as Config);
        return structuredClone(config);
      case "wheel_select":
        console.info("[mock] paste slot", args.index, config.slots[args.index as number]?.prompt);
        return;
      case "input_permission":
        return true;
      default:
        return;
    }
  },

  download(fileName: string, loadout: Loadout) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(loadout, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
    a.click();
    URL.revokeObjectURL(url);
    return true;
  },

  pickLoadout(): Promise<Loadout | null> {
    return new Promise((resolve) => {
      const input = Object.assign(document.createElement("input"), { type: "file", accept: ".json" });
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        try {
          const parsed = JSON.parse(await file.text()) as Loadout;
          if (parsed.type !== "prompt-wheel-loadout") throw new Error();
          resolve(parsed);
        } catch {
          alert("This file isn't a Prompt Wheel loadout.");
          resolve(null);
        }
      };
      input.click();
    });
  },
};
