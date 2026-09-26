import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../shared/api";
import { hotkeyParts } from "../shared/hotkey";
import type { Config, Slot } from "../shared/types";
import { BehaviorTab } from "./BehaviorTab";
import { Keycaps } from "./HotkeyRecorder";
import { LoadoutsTab } from "./LoadoutsTab";
import { SlotsTab } from "./SlotsTab";

type Tab = "slots" | "behavior" | "loadouts";
const TABS: { id: Tab; label: string }[] = [
  { id: "slots", label: "Slots" },
  { id: "behavior", label: "Behavior" },
  { id: "loadouts", label: "Loadouts" },
];
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
    async (hotkey: string) => {
      if (!configRef.current) return null;
      clearTimeout(saveTimer.current);
      try {
        const next = await api.saveConfig({ ...configRef.current, hotkey });
        configRef.current = next;
        setConfig(next);
        notify("Shortcut updated");
        return null;
      } catch (err) {
        return String(err);
      }
    },
    [notify],
  );

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
          <button className="shortcut-pill" onClick={() => setTab("behavior")} title="Change shortcut">
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
                  ⌘V for you.
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
            {tab === "slots" && <SlotsTab slots={config.slots} onChange={(slots: Slot[]) => update({ slots })} />}
            {tab === "behavior" && <BehaviorTab config={config} onChange={update} onHotkey={saveHotkey} />}
            {tab === "loadouts" && <LoadoutsTab slots={config.slots} onImport={(slots) => update({ slots })} notify={notify} />}
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
