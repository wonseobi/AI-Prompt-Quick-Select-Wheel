import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { Wheel } from "../components/Wheel";
import { SLOT_COUNT, type Profile, type Slot } from "../shared/types";
import { EmojiPicker } from "./EmojiPicker";
import { ProfileBar } from "./ProfileBar";

interface Props {
  profiles: Profile[];
  activeId: string;
  onSlotsChange: (slots: Slot[]) => void;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onDuplicate: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onReorder: (profiles: Profile[]) => void;
}

export function SlotsTab({ profiles, activeId, onSlotsChange, ...profileActions }: Props) {
  const [selected, setSelected] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [direction, setDirection] = useState(1);
  const [picking, setPicking] = useState(false);
  const profile = profiles.find((p) => p.id === activeId) ?? profiles[0];
  const slots = profile.slots;
  const slot = slots[selected];
  const closePicker = useCallback(() => setPicking(false), []);

  const select = (i: number) => {
    setDirection(i > selected ? 1 : -1);
    setSelected(i);
    setPicking(false);
  };

  const patch = (changes: Partial<Slot>) =>
    onSlotsChange(slots.map((s, i) => (i === selected ? { ...s, ...changes } : s)));

  const move = (step: number) => {
    const target = (selected + step + SLOT_COUNT) % SLOT_COUNT;
    const next = [...slots];
    [next[selected], next[target]] = [next[target], next[selected]];
    onSlotsChange(next);
    select(target);
  };

  return (
    <div className="slots-page">
      <ProfileBar profiles={profiles} activeId={profile.id} {...profileActions} />

      <div className="slots-layout">
        <section className="preview-pane">
          <div className="preview-stage">
            {/* Keyed by profile so switching replays the fold-out animation. */}
            <Wheel
              key={profile.id}
              slots={slots}
              radius={180}
              hot={hover ?? selected}
              selected={selected}
              onHover={setHover}
              onPick={select}
            />
          </div>
          <p className="caption">Click a slot to edit it. The numbers are the keys you press while the wheel is open.</p>
        </section>

        <section className="card editor">
          <header className="editor-head">
            <div className="editor-title">
              <div className="icon-anchor">
                <motion.button
                  key={slot.icon + selected}
                  className={`editor-icon${picking ? " is-open" : ""}`}
                  onClick={() => setPicking((v) => !v)}
                  title="Change icon"
                  initial={{ scale: 0.6, rotate: -12 }}
                  animate={{ scale: 1, rotate: 0 }}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  transition={{ type: "spring", stiffness: 500, damping: 18 }}
                >
                  {slot.icon || "💬"}
                  <span className="editor-icon-badge">✎</span>
                </motion.button>
                <AnimatePresence>
                  {picking && (
                    <EmojiPicker
                      value={slot.icon}
                      onPick={(icon) => {
                        patch({ icon });
                        setPicking(false);
                      }}
                      onClose={closePicker}
                    />
                  )}
                </AnimatePresence>
              </div>
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
              key={`${profile.id}-${selected}`}
              className="editor-body"
              initial={{ opacity: 0, x: 14 * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 * direction }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <label className="field">
                <span className="field-label">Name</span>
                <input className="input" value={slot.label} maxLength={24} onChange={(e) => patch({ label: e.target.value })} placeholder="e.g. Code review" />
              </label>

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
    </div>
  );
}
