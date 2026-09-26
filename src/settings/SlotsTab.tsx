import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Wheel } from "../components/Wheel";
import { SLOT_COUNT, type Slot } from "../shared/types";

const QUICK_ICONS = ["🔍", "🐛", "🧪", "✂️", "🧭", "📖", "💬", "🎯", "🚀", "🛠️", "📝", "💡", "🔒", "🎨", "📦", "⚡️", "🧹", "📊", "🌐", "🤖"];

interface Props {
  slots: Slot[];
  onChange: (slots: Slot[]) => void;
}

export function SlotsTab({ slots, onChange }: Props) {
  const [selected, setSelected] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [direction, setDirection] = useState(1);
  const slot = slots[selected];

  const select = (i: number) => {
    setDirection(i > selected ? 1 : -1);
    setSelected(i);
  };

  const patch = (changes: Partial<Slot>) =>
    onChange(slots.map((s, i) => (i === selected ? { ...s, ...changes } : s)));

  const move = (step: number) => {
    const target = (selected + step + SLOT_COUNT) % SLOT_COUNT;
    const next = [...slots];
    [next[selected], next[target]] = [next[target], next[selected]];
    onChange(next);
    select(target);
  };

  return (
    <div className="slots-layout">
      <section className="preview-pane">
        <div className="preview-stage">
          <Wheel
            slots={slots}
            radius={190}
            hot={hover ?? selected}
            selected={selected}
            onHover={setHover}
            onPick={select}
            hint=""
          />
        </div>
        <p className="caption">Click a slot to edit it. The numbers are the keys you press while the wheel is open.</p>
      </section>

      <section className="card editor">
        <header className="editor-head">
          <div className="editor-title">
            <motion.span key={slot.icon + selected} className="editor-icon" initial={{ scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
              {slot.icon || "💬"}
            </motion.span>
            <div>
              <h2>Slot {selected + 1}</h2>
              <p className="muted">
                Press <kbd className="keycap sm">{selected + 1}</kbd> while the wheel is open
              </p>
            </div>
          </div>
          <div className="stepper">
            <button className="icon-btn" onClick={() => select((selected + SLOT_COUNT - 1) % SLOT_COUNT)} aria-label="Previous slot">‹</button>
            <button className="icon-btn" onClick={() => select((selected + 1) % SLOT_COUNT)} aria-label="Next slot">›</button>
          </div>
        </header>

        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={selected}
            className="editor-body"
            custom={direction}
            initial={{ opacity: 0, x: 14 * direction }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 * direction }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="field-row">
              <label className="field narrow">
                <span className="field-label">Icon</span>
                <input className="input icon-input" value={slot.icon} maxLength={4} onChange={(e) => patch({ icon: e.target.value })} placeholder="💬" />
              </label>
              <label className="field grow">
                <span className="field-label">Name</span>
                <input className="input" value={slot.label} maxLength={24} onChange={(e) => patch({ label: e.target.value })} placeholder="e.g. Code review" />
              </label>
            </div>

            <div className="icon-picks">
              {QUICK_ICONS.map((icon) => (
                <motion.button key={icon} className={`icon-pick${slot.icon === icon ? " is-on" : ""}`} onClick={() => patch({ icon })} whileHover={{ scale: 1.18 }} whileTap={{ scale: 0.9 }}>
                  {icon}
                </motion.button>
              ))}
            </div>

            <label className="field">
              <span className="field-label">
                Prompt <span className="muted">· pasted exactly as written</span>
              </span>
              <textarea
                className="input prompt-input"
                value={slot.prompt}
                onChange={(e) => patch({ prompt: e.target.value })}
                placeholder="Type the prompt you use over and over…"
                spellCheck
              />
              <span className="counter">{slot.prompt.length.toLocaleString()} characters</span>
            </label>
          </motion.div>
        </AnimatePresence>

        <footer className="editor-foot">
          <div className="btn-group">
            <button className="btn ghost" onClick={() => move(-1)}>← Move</button>
            <button className="btn ghost" onClick={() => move(1)}>Move →</button>
          </div>
          <button className="btn danger-ghost" onClick={() => patch({ label: "", icon: "", prompt: "" })} disabled={!slot.prompt && !slot.label && !slot.icon}>
            Clear slot
          </button>
        </footer>
      </section>
    </div>
  );
}
