// Mirrors src-tauri/src/config.rs. Keep the two in sync.

export type Activation = "hold" | "toggle";
export type Placement = "cursor" | "fullscreen";

export interface Slot {
  label: string;
  icon: string;
  prompt: string;
}

/** A named set of 8 slots; switching profiles swaps the whole wheel. */
export interface Profile {
  id: string;
  name: string;
  slots: Slot[];
}

export interface Config {
  version: number;
  /** "Alt+KeyF"-style key combo, or a mouse button like "Mouse4". */
  hotkey: string;
  /** Switches to the next profile; same formats as `hotkey`, "" = off. */
  profileHotkey: string;
  activation: Activation;
  placement: Placement;
  /** Wheel size multiplier, 0.7–1.4. */
  wheelScale: number;
  profiles: Profile[];
  activeProfile: string;
}

export interface Loadout {
  type: "prompt-wheel-loadout";
  version: number;
  name: string;
  description: string;
  slots: Slot[];
}

/** Sent by the backend each time the wheel opens. Coordinates are logical px. */
export interface OpenPayload {
  x: number;
  y: number;
  width: number;
  height: number;
  placement: Placement;
  activation: Activation;
  scale: number;
  profileName: string;
  slots: Slot[];
}

/** Sent when the "next profile" shortcut switches profiles. */
export interface ProfileSwitch {
  profileName: string;
  index: number;
  total: number;
  slots: Slot[];
}

/** Profile switched while the wheel was closed: a popup near the cursor. */
export interface HudPayload extends ProfileSwitch {
  x: number;
  y: number;
}

export const SLOT_COUNT = 8;
export const MIN_SCALE = 0.7;
export const MAX_SCALE = 1.4;
/** Outer wheel radius at 100% size. Keep in sync with wheel.rs. */
export const BASE_RADIUS = { cursor: 200, fullscreen: 250 } as const;

export const activeProfile = (config: Config) =>
  config.profiles.find((p) => p.id === config.activeProfile) ?? config.profiles[0];

export const emptySlots = (): Slot[] => Array.from({ length: SLOT_COUNT }, () => ({ label: "", icon: "", prompt: "" }));

export const newProfileId = () => `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const isEmpty = (slot?: Slot) => !slot || !slot.prompt.trim();
