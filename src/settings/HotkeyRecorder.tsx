import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api, isTauri, on } from "../shared/api";
import { hotkeyParts, mouseButtonHotkey, recordKey } from "../shared/hotkey";

interface Props {
  value: string;
  /** Saves the new hotkey; resolves to an error message if it was rejected. */
  onSave: (accelerator: string) => Promise<string | null>;
}

export function Keycaps({ parts, pending = false }: { parts: string[]; pending?: boolean }) {
  return (
    <span className="keycaps">
      {parts.map((p, i) => (
        <kbd key={`${p}-${i}`} className="keycap">
          {p}
        </kbd>
      ))}
      {pending && <kbd className="keycap is-ghost">…</kbd>}
    </span>
  );
}

export function HotkeyRecorder({ value, onSave }: Props) {
  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const stop = () => {
    setRecording(false);
    setHeld([]);
    api.pauseHotkey(false);
  };

  useEffect(() => {
    if (!recording) return;
    const finish = async (accelerator: string) => {
      setRecording(false);
      setHeld([]);
      setError(await onSave(accelerator));
      api.pauseHotkey(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) return stop();
      const result = recordKey(e);
      if (result.kind === "pending") return setHeld(result.modifiers.map((m) => hotkeyParts(m)[0]));
      if (result.kind === "invalid") return setError(result.message);
      finish(result.accelerator);
    };
    // In the app, extra mouse buttons are caught system-wide by the backend.
    // In a browser preview, fall back to the page's own mouse events.
    const offMouse = on("hotkey://mouse", finish);
    const onMouseDown = (e: MouseEvent) => {
      const accelerator = mouseButtonHotkey(e.button);
      if (isTauri || !accelerator) return;
      e.preventDefault();
      finish(accelerator);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const mods = [e.ctrlKey && "Control", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean) as string[];
      setHeld(mods.map((m) => hotkeyParts(m)[0]));
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("mousedown", onMouseDown, true);
    return () => {
      offMouse();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [recording, onSave]);

  const start = () => {
    setError(null);
    setRecording(true);
    api.pauseHotkey(true);
  };

  return (
    <div className="recorder">
      <motion.button
        ref={buttonRef}
        type="button"
        className={`recorder-field${recording ? " is-recording" : ""}`}
        onClick={recording ? stop : start}
        onBlur={() => recording && stop()}
        whileTap={{ scale: 0.98 }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {recording ? (
            <motion.span key="rec" className="recorder-inner" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              {held.length ? <Keycaps parts={held} pending /> : <span className="recorder-prompt">Press a key combo or mouse button…</span>}
              <span className="recorder-aside">Esc to cancel</span>
            </motion.span>
          ) : (
            <motion.span key="val" className="recorder-inner" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              <Keycaps parts={hotkeyParts(value)} />
              <span className="recorder-aside">Click to change</span>
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
      <AnimatePresence>
        {error && (
          <motion.p className="field-error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
