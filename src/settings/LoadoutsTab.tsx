import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { api } from "../shared/api";
import { isEmpty, type Loadout, type Slot } from "../shared/types";

interface Props {
  profileName: string;
  slots: Slot[];
  /** "new" adds the loadout as its own profile; "replace" overwrites the current one. */
  onImport: (loadout: Loadout, mode: "new" | "replace") => void;
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

export function LoadoutsTab({ profileName, slots, onImport, notify }: Props) {
  const [name, setName] = useState(profileName);
  const [description, setDescription] = useState("");
  const [incoming, setIncoming] = useState<Loadout | null>(null);

  const exportIt = async () => {
    try {
      if (await api.exportLoadout(name.trim() || profileName, description, slots)) notify("Loadout exported");
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

  const apply = (mode: "new" | "replace") => {
    if (!incoming) return;
    onImport(incoming, mode);
    notify(mode === "new" ? `Added “${incoming.name || "Loadout"}” as a new profile` : `“${profileName}” now uses this loadout`);
    setIncoming(null);
  };

  return (
    <div className="loadouts">
      <p className="lede">
        A loadout is a small JSON file with one profile's 8 slots. Share yours, or import someone else's as a new
        profile. Loadouts never include your shortcut or other settings.
      </p>

      <div className="loadout-grid">
        <section className="card">
          <div className="card-head">
            <h2>Export “{profileName}”</h2>
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
                <div className="btn-row">
                  <button className="btn ghost" onClick={() => setIncoming(null)}>
                    Cancel
                  </button>
                  <button className="btn ghost" onClick={() => apply("replace")} title={`Overwrites the slots in “${profileName}”`}>
                    Replace “{profileName}”
                  </button>
                  <button className="btn primary" onClick={() => apply("new")}>
                    Add as new profile
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
