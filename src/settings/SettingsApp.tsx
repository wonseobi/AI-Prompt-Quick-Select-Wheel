import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, on } from "../shared/api";
import { hotkeyParts } from "../shared/hotkey";
import { activeProfile, emptySlots, newProfileId, type Config, type Loadout, type Profile, type Slot } from "../shared/types";
import { Keycaps } from "./HotkeyRecorder";
import { LoadoutsTab } from "./LoadoutsTab";
import { SettingsTab } from "./SettingsTab";
import { SlotsTab } from "./SlotsTab";

type Tab = "slots" | "settings" | "loadouts";
const TABS: { id: Tab; label: string }[] = [
  { id: "slots", label: "Slots" },
  { id: "settings", label: "Settings" },
  { id: "loadouts", label: "Loadouts" },
];

/** "Coding" -> "Coding 2" if taken, and so on. */
function uniqueName(base: string, profiles: Profile[]) {
  const taken = new Set(profiles.map((p) => p.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}
const SAVE_DELAY = 400;

type Toast = { id: number; message: string; tone: "ok" | "error" };

export function SettingsApp() {
  const [config, setConfig] = useState<Config | null>(null);
  const [tab, setTab] = useState<Tab>("slots");
  const [saved, setSaved] = useState(false);
  const [permission, setPermission] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const saveTimer = useRef<number>(undefined);

  useEffect(() => {
    api.getConfig().then(setConfig);
  }, []);

  // Keep checking until the user grants Accessibility access in System Settings.
  useEffect(() => {
    let timer: number;
    const check = async () => {
      const ok = await api.inputPermission();
      setPermission(ok);
      if (!ok) timer = window.setTimeout(check, 2000);
    };
    check();
    return () => clearTimeout(timer);
  }, []);

  const notify = useCallback((message: string, tone: "ok" | "error" = "ok") => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const configRef = useRef(config);
  configRef.current = config;

  /** Update locally right away, write to disk shortly after typing stops. */
  const update = useCallback(
    (changes: Partial<Config>) => {
      if (!configRef.current) return;
      const next = { ...configRef.current, ...changes };
      configRef.current = next;
      setConfig(next);
      clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        try {
          await api.saveConfig(next);
          setSaved(true);
          setTimeout(() => setSaved(false), 1400);
        } catch (err) {
          notify(`Couldn't save: ${err}`, "error");
        }
      }, SAVE_DELAY);
    },
    [notify],
  );

  /** Hotkeys save immediately so the backend can reject ones already taken. */
  const saveHotkey = useCallback(
    async (field: "hotkey" | "profileHotkey", accelerator: string) => {
      if (!configRef.current) return null;
      const other = field === "hotkey" ? configRef.current.profileHotkey : configRef.current.hotkey;
      if (accelerator && accelerator === other) {
        return field === "hotkey" ? "That's your switch-profile shortcut. Pick another one." : "That already opens the wheel. Pick another one.";
      }
      clearTimeout(saveTimer.current);
      try {
        const next = await api.saveConfig({ ...configRef.current, [field]: accelerator });
        configRef.current = next;
        setConfig(next);
        notify(accelerator ? "Shortcut updated" : "Shortcut turned off");
        return null;
      } catch (err) {
        return String(err);
      }
    },
    [notify],
  );

  // Profile picked from the menu bar while settings is open.
  useEffect(() => on("config://external", (external) => update({ activeProfile: external.activeProfile })), [update]);

  const profiles = {
    switchTo: (id: string) => update({ activeProfile: id }),
    add: (profile: Profile) => {
      const list = configRef.current?.profiles ?? [];
      update({ profiles: [...list, profile], activeProfile: profile.id });
    },
    setSlots: (slots: Slot[]) => {
      const cfg = configRef.current!;
      update({ profiles: cfg.profiles.map((p) => (p.id === cfg.activeProfile ? { ...p, slots } : p)) });
    },
    rename: (name: string) => {
      const cfg = configRef.current!;
      update({ profiles: cfg.profiles.map((p) => (p.id === cfg.activeProfile ? { ...p, name } : p)) });
    },
    remove: () => {
      const cfg = configRef.current!;
      if (cfg.profiles.length < 2) return;
      const index = cfg.profiles.findIndex((p) => p.id === cfg.activeProfile);
      const rest = cfg.profiles.filter((p) => p.id !== cfg.activeProfile);
      const removed = cfg.profiles[index];
      update({ profiles: rest, activeProfile: rest[Math.max(0, index - 1)].id });
      notify(`Deleted “${removed.name}”`);
    },
  };

  const createProfile = () => {
    const list = configRef.current!.profiles;
    profiles.add({ id: newProfileId(), name: uniqueName("New profile", list), slots: emptySlots() });
  };

  const duplicateProfile = () => {
    const cfg = configRef.current!;
    const source = activeProfile(cfg);
    profiles.add({ id: newProfileId(), name: uniqueName(`${source.name} copy`, cfg.profiles), slots: structuredClone(source.slots) });
  };

  const importLoadout = (loadout: Loadout, mode: "new" | "replace") => {
    if (mode === "replace") return profiles.setSlots(loadout.slots);
    const list = configRef.current!.profiles;
    profiles.add({ id: newProfileId(), name: uniqueName(loadout.name.trim() || "Imported", list), slots: loadout.slots });
  };

  if (!config) return <div className="app loading" />;

  return (
    <div className="app">
      <header className="topbar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <Logo />
          Prompt Wheel
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab${tab === t.id ? " is-on" : ""}`} onClick={() => setTab(t.id)}>
              {tab === t.id && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="topbar-right" data-tauri-drag-region>
          <AnimatePresence>
            {saved && (
              <motion.span className="saved" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                ✓ Saved
              </motion.span>
            )}
          </AnimatePresence>
          <button className="shortcut-pill" onClick={() => setTab("settings")} title="Change shortcut">
            <Keycaps parts={hotkeyParts(config.hotkey)} />
            <span>{config.activation === "hold" ? "hold" : "toggle"}</span>
          </button>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {!permission && (
          <motion.div className="banner" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <div className="banner-inner">
              <span className="banner-icon">!</span>
              <div>
                <strong>One more step to paste into other apps</strong>
                <p>
                  Turn on <b>Prompt Wheel</b> in System Settings → Privacy & Security → Accessibility. This lets it press
                  ⌘V for you. Already on? Select it, remove it with <b>−</b>, then reopen Prompt Wheel and allow it again.
                </p>
              </div>
              <button className="btn primary" onClick={() => api.openPermissionSettings()}>
                Open System Settings
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="content">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            className="tab-page"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {tab === "slots" && (
              <SlotsTab
                profiles={config.profiles}
                activeId={config.activeProfile}
                onSlotsChange={profiles.setSlots}
                onSwitch={profiles.switchTo}
                onCreate={createProfile}
                onDuplicate={duplicateProfile}
                onRename={profiles.rename}
                onDelete={profiles.remove}
                onReorder={(list) => update({ profiles: list })}
              />
            )}
            {tab === "settings" && <SettingsTab config={config} onChange={update} onHotkey={saveHotkey} />}
            {tab === "loadouts" && (
              <LoadoutsTab
                key={config.activeProfile}
                profileName={activeProfile(config).name}
                slots={activeProfile(config).slots}
                onImport={importLoadout}
                notify={notify}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className={`toast ${toast.tone}`}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className="logo" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="10.6" y="1.5" width="2.8" height="6" rx="1.2" transform={`rotate(${i * 45} 12 12)`} className={i === 0 ? "logo-hot" : "logo-seg"} />
      ))}
      <circle cx="12" cy="12" r="2.2" className="logo-hot" />
    </svg>
  );
}
