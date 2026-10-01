import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, on } from "../shared/api";
import type { PickerPayload } from "../shared/types";

const WIDTH = 320;
const HEAD_H = 38;
const ROW_H = 48;
const CHOOSE_MS = 120;
const CANCEL_MS = 90;

type Phase = "hidden" | "open" | "choosing" | "cancelling";

/**
 * Profile picker opened by the profile shortcut while the wheel is closed.
 * Tap the shortcut and click a profile, or hold it, point and let go. Number
 * keys and arrows work too. Opens with the current profile under the cursor.
 */
export function ProfilePicker() {
  const [data, setData] = useState<PickerPayload | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [phase, setPhase] = useState<Phase>("hidden");
  const [hover, setHover] = useState<number | null>(null);

  // Event listeners are registered once, so they read live values from refs.
  const live = useRef({ data, phase, hover, openedAt: 0 });
  live.current.data = data;
  live.current.phase = phase;
  live.current.hover = hover;

  const cancel = useCallback(() => {
    if (live.current.phase !== "open") return;
    live.current.phase = "cancelling";
    setPhase("cancelling");
    setTimeout(() => {
      setPhase("hidden");
      api.cancelWheel();
    }, CANCEL_MS);
  }, []);

  const choose = useCallback((index: number) => {
    const profile = live.current.data?.profiles[index];
    if (!profile || live.current.phase !== "open") return;
    live.current.phase = "choosing";
    setHover(index);
    setPhase("choosing");
    setTimeout(() => {
      setPhase("hidden");
      api.chooseProfile(profile.id);
    }, CHOOSE_MS);
  }, []);

  useEffect(() => {
    const offs = [
      on("picker://open", (payload) => {
        live.current.openedAt = performance.now();
        live.current.phase = "open";
        setData(payload);
        setOpenCount((n) => n + 1);
        setHover(null);
        setPhase("open");
      }),
      // Hold, point, let go. Letting go over nothing keeps it open for a click.
      on("picker://release", () => {
        const { hover } = live.current;
        if (hover !== null) choose(hover);
      }),
      on("picker://dismiss", cancel),
    ];

    const onKey = (e: KeyboardEvent) => {
      const { phase, data, hover } = live.current;
      if (phase !== "open" || !data) return;
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      const last = data.profiles.length - 1;
      if (digit) {
        e.preventDefault();
        choose(Number(digit[1]) - 1);
      } else if (e.code === "Escape") {
        cancel();
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        setHover(hover === null || hover >= last ? 0 : hover + 1);
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        setHover(hover === null || hover <= 0 ? last : hover - 1);
      } else if (e.code === "Enter" && hover !== null) {
        choose(hover);
      }
    };
    const onBlur = () => {
      if (performance.now() - live.current.openedAt > 250) cancel();
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [cancel, choose]);

  if (phase === "hidden" || !data) return null;

  // Line the current profile's row up under the cursor, like a macOS pop-up menu.
  const activeIndex = Math.max(0, data.profiles.findIndex((p) => p.id === data.activeProfile));
  const height = HEAD_H + data.profiles.length * ROW_H + 12;
  const left = Math.min(Math.max(data.x - 70, 12), window.innerWidth - WIDTH - 12);
  const top = Math.min(Math.max(data.y - (HEAD_H + activeIndex * ROW_H + ROW_H / 2), 12), window.innerHeight - height - 12);
  const closing = phase !== "open";

  return (
    <div className="picker-layer" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <motion.div
        key={openCount}
        className="picker"
        style={{ left, top, width: WIDTH, transformOrigin: `${data.x - left}px ${data.y - top}px` }}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={closing ? { opacity: 0, scale: phase === "choosing" ? 1 : 0.96 } : { opacity: 1, scale: 1 }}
        transition={closing ? { duration: (phase === "choosing" ? CHOOSE_MS : CANCEL_MS) / 1000, ease: "easeIn" } : { type: "spring", stiffness: 640, damping: 34 }}
        onMouseLeave={() => phase === "open" && setHover(null)}
      >
        <div className="picker-head" style={{ height: HEAD_H }}>
          <span>Profiles</span>
          <span className="picker-keys">1–{Math.min(9, data.profiles.length)} · Esc</span>
        </div>
        {data.profiles.map((profile, i) => {
          const active = profile.id === data.activeProfile;
          const cls = ["picker-row", active && "is-active", hover === i && "is-hover", phase === "choosing" && hover === i && "is-chosen"]
            .filter(Boolean)
            .join(" ");
          return (
            <motion.button
              key={profile.id}
              className={cls}
              style={{ height: ROW_H }}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.02 + i * 0.02, duration: 0.16 }}
              onMouseEnter={() => phase === "open" && setHover(i)}
              onClick={() => choose(i)}
            >
              <span className="picker-num">{i < 9 ? i + 1 : ""}</span>
              <span className="picker-name">{profile.name}</span>
              <span className="picker-icons">
                {profile.icons.map((icon, j) => (
                  <span key={j} className={icon ? undefined : "is-empty"}>
                    {icon || "·"}
                  </span>
                ))}
              </span>
              <span className="picker-check">{active ? "✓" : ""}</span>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}
