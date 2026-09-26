import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../shared/api";
import { hotkeyParts, recordKey } from "../shared/hotkey";

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
    const onKeyDown = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) return stop();
      const result = recordKey(e);
      if (result.kind === "pending") return setHeld(result.modifiers.map((m) => hotkeyParts(m)[0]));
      if (result.kind === "invalid") return setError(result.message);
      setRecording(false);
      setHeld([]);
      setError(await onSave(result.accelerator));
      api.pauseHotkey(false);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const mods = [e.ctrlKey && "Control", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean) as string[];
      setHeld(mods.map((m) => hotkeyParts(m)[0]));
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
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
              {held.length ? <Keycaps parts={held} pending /> : <span className="recorder-prompt">Press your shortcut…</span>}
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
