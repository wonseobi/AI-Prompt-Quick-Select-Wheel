// Mirrors src-tauri/src/config.rs. Keep the two in sync.

export type Activation = "hold" | "toggle";
export type Placement = "cursor" | "fullscreen";

export interface Slot {
  label: string;
  icon: string;
  prompt: string;
}

export interface Config {
  version: number;
  hotkey: string;
  activation: Activation;
  placement: Placement;
  slots: Slot[];
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
  slots: Slot[];
}

export const SLOT_COUNT = 8;

export const isEmpty = (slot?: Slot) => !slot || !slot.prompt.trim();
