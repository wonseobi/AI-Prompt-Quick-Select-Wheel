import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { api } from "../shared/api";
import { isEmpty, type Loadout, type Slot } from "../shared/types";

interface Props {
  slots: Slot[];
  onImport: (slots: Slot[]) => void;
  notify: (message: string, tone?: "ok" | "error") => void;
}

function SlotChips({ slots }: { slots: Slot[] }) {
  return (
    <ol className="chips">
      {slots.map((s, i) => (
        <motion.li
          key={i}
          className={`chip${isEmpty(s) ? " is-empty" : ""}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.025 }}
        >
          <span className="chip-num">{i + 1}</span>
          <span className="chip-icon">{isEmpty(s) ? "·" : s.icon || "💬"}</span>
          <span className="chip-label">{isEmpty(s) ? "Empty" : s.label || `Slot ${i + 1}`}</span>
        </motion.li>
      ))}
    </ol>
  );
}

export function LoadoutsTab({ slots, onImport, notify }: Props) {
  const [name, setName] = useState("My loadout");
  const [description, setDescription] = useState("");
  const [incoming, setIncoming] = useState<Loadout | null>(null);

  const exportIt = async () => {
    try {
      if (await api.exportLoadout(name.trim() || "My loadout", description, slots)) notify("Loadout exported");
    } catch (err) {
      notify(String(err), "error");
    }
  };

  const pick = async () => {
    try {
      const loadout = await api.importLoadout();
      if (loadout) setIncoming(loadout);
    } catch (err) {
      notify(String(err), "error");
    }
  };

  const apply = () => {
    if (!incoming) return;
    onImport(incoming.slots);
    notify(`“${incoming.name || "Loadout"}” is now on your wheel`);
    setIncoming(null);
  };

  return (
    <div className="loadouts">
      <p className="lede">
        A loadout is a small JSON file with your 8 slots. Share yours, or import someone else's. Loadouts never include
        your shortcut or other settings.
      </p>

      <div className="loadout-grid">
        <section className="card">
          <div className="card-head">
            <h2>Export your wheel</h2>
          </div>
          <label className="field">
            <span className="field-label">Name</span>
            <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">
              Description <span className="muted">· optional</span>
            </span>
            <input className="input" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} placeholder="What's this loadout for?" />
          </label>
          <SlotChips slots={slots} />
          <button className="btn primary" onClick={exportIt}>
            Export loadout…
          </button>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Import a loadout</h2>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {incoming ? (
              <motion.div key="preview" className="import-preview" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
                <div>
                  <h3>{incoming.name || "Untitled loadout"}</h3>
                  {incoming.description && <p className="muted">{incoming.description}</p>}
                </div>
                <SlotChips slots={incoming.slots} />
                <p className="warn-note">This replaces all 8 of your current slots.</p>
                <div className="btn-row">
                  <button className="btn ghost" onClick={() => setIncoming(null)}>
                    Cancel
                  </button>
                  <button className="btn primary" onClick={apply}>
                    Replace my slots
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.button key="drop" className="dropzone" onClick={pick} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <span className="dropzone-icon">⤓</span>
                <strong>Choose a loadout file…</strong>
                <span className="muted">You'll see a preview before anything changes.</span>
              </motion.button>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}
