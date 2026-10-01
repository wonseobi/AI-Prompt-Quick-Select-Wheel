// Thin wrapper over the Tauri backend. In a plain browser (`npm run dev`) it
// falls back to an in-memory mock so the UI can be designed without the app.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import type { Config, HudPayload, Loadout, OpenPayload, ProfileSwitch, Slot } from "./types";
import { mock } from "./mock";

export const isTauri = "__TAURI_INTERNALS__" in window;

type Events = {
  "wheel://open": OpenPayload;
  "wheel://release": null;
  "wheel://dismiss": null;
  /** Profile switched while the wheel is open: swap its slots in place. */
  "wheel://profile": ProfileSwitch;
  /** Profile switched while the wheel is closed: show a small popup. */
  "wheel://hud": HudPayload;
  /** Config changed outside the settings window (e.g. profile picked from the menu bar). */
  "config://external": Config;
  /** A mouse button was pressed while recording a new hotkey, e.g. "Mouse4". */
  "hotkey://mouse": string;
};

export function on<E extends keyof Events>(event: E, handler: (payload: Events[E]) => void): () => void {
  if (!isTauri) return mock.on(event, handler as (p: unknown) => void);
  let unlisten: UnlistenFn | undefined;
  let cancelled = false;
  listen<Events[E]>(event, (e) => handler(e.payload)).then((fn) => {
    if (cancelled) fn();
    else unlisten = fn;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return isTauri ? invoke<T>(cmd, args) : (mock.invoke(cmd, args) as Promise<T>);
}

export const api = {
  getConfig: () => call<Config>("get_config"),
  saveConfig: (config: Config) => call<Config>("save_config", { config }),
  pauseHotkey: (paused: boolean) => call<void>("pause_hotkey", { paused }),
  selectSlot: (index: number) => call<void>("wheel_select", { index }),
  cancelWheel: () => call<void>("wheel_cancel"),
  inputPermission: () => call<boolean>("input_permission"),
  openPermissionSettings: () => call<void>("open_permission_settings"),
  getAutostart: () => call<boolean>("get_autostart"),
  setAutostart: (enabled: boolean) => call<boolean>("set_autostart", { enabled }),
  openEmojiPalette: () => call<void>("open_emoji_palette"),

  async exportLoadout(name: string, description: string, slots: Slot[]): Promise<boolean> {
    const fileName = `${slugify(name) || "loadout"}.json`;
    if (!isTauri) return mock.download(fileName, { type: "prompt-wheel-loadout", version: 1, name, description, slots });
    const path = await saveDialog({ defaultPath: fileName, filters: [{ name: "Prompt Wheel loadout", extensions: ["json"] }] });
    if (!path) return false;
    await call("export_loadout", { path, name, description, slots });
    return true;
  },

  async importLoadout(): Promise<Loadout | null> {
    if (!isTauri) return mock.pickLoadout();
    const path = await openDialog({ multiple: false, filters: [{ name: "Prompt Wheel loadout", extensions: ["json"] }] });
    if (!path) return null;
    return call<Loadout>("import_loadout", { path });
  },
};

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
