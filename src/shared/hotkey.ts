// Hotkeys are stored as accelerator strings the Rust side can parse,
// e.g. "Alt+KeyQ" or "Super+Shift+Space" (key names are KeyboardEvent.code).

const isMac = navigator.userAgent.includes("Mac");

const MODIFIER_ORDER = ["Control", "Alt", "Shift", "Super"] as const;
const MODIFIER_LABELS: Record<string, string> = isMac
  ? { Control: "⌃", Alt: "⌥", Shift: "⇧", Super: "⌘" }
  : { Control: "Ctrl", Alt: "Alt", Shift: "Shift", Super: "Win" };

const KEY_LABELS: Record<string, string> = {
  Space: "Space",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Enter: "↩",
  Tab: "⇥",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  return KEY_LABELS[code] ?? code;
}

/** "Alt+KeyQ" -> ["⌥", "Q"] for rendering as keycaps. */
export function hotkeyParts(accelerator: string): string[] {
  return accelerator.split("+").map((token) => MODIFIER_LABELS[token] ?? keyLabel(token));
}

const MODIFIER_CODES = new Set([
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
  "AltLeft", "AltRight", "MetaLeft", "MetaRight", "CapsLock", "Fn",
]);

export function heldModifiers(e: KeyboardEvent): string[] {
  const held = { Control: e.ctrlKey, Alt: e.altKey, Shift: e.shiftKey, Super: e.metaKey };
  return MODIFIER_ORDER.filter((m) => held[m]);
}

export type RecordResult =
  | { kind: "pending"; modifiers: string[] }
  | { kind: "done"; accelerator: string }
  | { kind: "invalid"; message: string };

/** Turns a keydown into a hotkey, or explains why it can't be one. */
export function recordKey(e: KeyboardEvent): RecordResult {
  const modifiers = heldModifiers(e);
  if (MODIFIER_CODES.has(e.code)) return { kind: "pending", modifiers };
  const isFunctionKey = /^F\d{1,2}$/.test(e.code);
  if (!modifiers.length && !isFunctionKey) {
    return { kind: "invalid", message: "Add a modifier like ⌥, ⌃ or ⌘ so normal typing isn't blocked." };
  }
  return { kind: "done", accelerator: [...modifiers, e.code].join("+") };
}
