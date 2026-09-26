import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Profile } from "../shared/types";

interface Props {
  profiles: Profile[];
  activeId: string;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onDuplicate: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

export function ProfileBar({ profiles, activeId, onSwitch, onCreate, onDuplicate, onRename, onDelete }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const active = profiles.find((p) => p.id === activeId) ?? profiles[0];

  // A pending delete confirmation quietly expires.
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  useEffect(() => {
    setRenaming(false);
    setConfirmDelete(false);
  }, [activeId]);

  const commitRename = (value: string) => {
    const name = value.trim();
    if (name && name !== active.name) onRename(name);
    setRenaming(false);
  };

  return (
    <div className="profile-bar">
      <span className="profile-bar-label">Profile</span>
      <div className="profile-pills">
        {profiles.map((p) => {
          const on = p.id === activeId;
          return (
            <button
              key={p.id}
              className={`profile-pill${on ? " is-on" : ""}`}
              onClick={() => !on && onSwitch(p.id)}
              onDoubleClick={() => on && setRenaming(true)}
              title={on ? "Double-click to rename" : `Switch to ${p.name}`}
            >
              {on && <motion.span layoutId="profile-pill-bg" className="profile-pill-bg" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
              {on && renaming ? (
                <input
                  className="profile-rename"
                  defaultValue={p.name}
                  autoFocus
                  maxLength={32}
                  size={Math.max(6, p.name.length)}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => commitRename(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(e.currentTarget.value);
                    if (e.key === "Escape") setRenaming(false);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="profile-pill-name">{p.name}</span>
              )}
            </button>
          );
        })}
        <motion.button className="profile-pill add" onClick={onCreate} whileTap={{ scale: 0.95 }} title="New empty profile">
          ＋ New
        </motion.button>
      </div>

      <div className="profile-actions">
        <button className="btn ghost sm" onClick={() => setRenaming(true)}>
          Rename
        </button>
        <button className="btn ghost sm" onClick={onDuplicate}>
          Duplicate
        </button>
        <AnimatePresence mode="popLayout" initial={false}>
          {confirmDelete ? (
            <motion.button
              key="confirm"
              className="btn danger sm"
              onClick={() => {
                setConfirmDelete(false);
                onDelete();
              }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              Delete “{active.name}”?
            </motion.button>
          ) : (
            <motion.button
              key="delete"
              className="btn danger-ghost sm"
              onClick={() => setConfirmDelete(true)}
              disabled={profiles.length < 2}
              title={profiles.length < 2 ? "You need at least one profile" : undefined}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Delete
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
