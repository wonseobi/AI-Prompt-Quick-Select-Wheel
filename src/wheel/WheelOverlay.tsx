import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Wheel } from "../components/Wheel";
import { api, on } from "../shared/api";
import { angleOf, slotFromVector, unwrapAngle } from "../shared/geometry";
import { isEmpty, type OpenPayload } from "../shared/types";

/** Mouse must travel this far (px) from the center before a slot is aimed at. */
const DEAD_ZONE = 26;
const FLASH_MS = 110;
const CANCEL_MS = 90;

type Phase = "hidden" | "open" | "selecting" | "cancelling";

export function WheelOverlay() {
  const [session, setSession] = useState<OpenPayload | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [phase, setPhase] = useState<Phase>("hidden");
  const [hot, setHot] = useState<number | null>(null);
  const [aim, setAim] = useState<number | null>(null);

  // Event listeners are registered once, so they read live values from refs.
  const live = useRef({ session, phase, hot, openedAt: 0 });
  live.current.session = session;
  live.current.phase = phase;
  live.current.hot = hot;

  const cancel = useCallback(() => {
    if (live.current.phase !== "open") return;
    live.current.phase = "cancelling";
    setPhase("cancelling");
    setTimeout(() => {
      setPhase("hidden");
      api.cancelWheel();
    }, CANCEL_MS);
  }, []);

  const pick = useCallback(
    (index: number) => {
      const slots = live.current.session?.slots ?? [];
      if (live.current.phase !== "open") return;
      if (isEmpty(slots[index])) return cancel();
      live.current.phase = "selecting";
      setHot(index);
      setPhase("selecting");
      setTimeout(() => {
        setPhase("hidden");
        api.selectSlot(index);
      }, FLASH_MS);
    },
    [cancel],
  );

  useEffect(() => {
    const offs = [
      on("wheel://open", (payload) => {
        live.current.openedAt = performance.now();
        live.current.phase = "open";
        setSession(payload);
        setOpenCount((n) => n + 1);
        setHot(null);
        setAim(null);
        setPhase("open");
      }),
      // Hold mode: letting go of the hotkey picks whatever is aimed at.
      on("wheel://release", () => {
        const { hot } = live.current;
        if (hot === null) cancel();
        else pick(hot);
      }),
      on("wheel://dismiss", cancel),
    ];

    const onKey = (e: KeyboardEvent) => {
      if (live.current.phase !== "open") return;
      const digit = /^(?:Digit|Numpad)([1-8])$/.exec(e.code);
      if (digit) {
        e.preventDefault();
        pick(Number(digit[1]) - 1);
      } else if (e.code === "Escape") {
        cancel();
      } else if (e.code === "Enter" && live.current.hot !== null) {
        pick(live.current.hot);
      }
    };
    // Switching apps while the wheel is up (Cmd+Tab, clicking the Dock) closes it.
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
  }, [cancel, pick]);

  const onMouseMove = (e: React.MouseEvent) => {
    if (!session || phase !== "open") return;
    const dx = e.clientX - session.x;
    const dy = e.clientY - session.y;
    const next = slotFromVector(dx, dy, DEAD_ZONE);
    setHot(next);
    setAim((prev) => (next === null ? null : unwrapAngle(prev ?? angleOf(dx, dy), angleOf(dx, dy))));
  };

  const onMouseDown = () => {
    if (phase !== "open") return;
    if (hot === null) cancel();
    else pick(hot);
  };

  const visible = phase !== "hidden" && session;
  const fullscreen = session?.placement === "fullscreen";
  const hint =
    session?.activation === "toggle" ? "Click a slot or press 1–8\nEsc to close" : "Aim, then let go\nor press 1–8";

  return (
    <div
      className={`overlay${session?.activation === "hold" ? " hide-cursor" : ""}`}
      onMouseMove={onMouseMove}
      onMouseDown={onMouseDown}
    >
      <AnimatePresence>
        {visible && fullscreen && (
          <motion.div
            key="backdrop"
            className="overlay-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === "open" ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
          />
        )}
      </AnimatePresence>

      {visible && (
        <motion.div
          key={openCount}
          className="overlay-wheel"
          style={{ left: session.x, top: session.y }}
          initial={{ scale: 0.72, opacity: 0, rotate: -10 }}
          animate={
            phase === "open"
              ? { scale: 1, opacity: 1, rotate: 0 }
              : phase === "selecting"
                ? { scale: 1.05, opacity: 0, transition: { duration: FLASH_MS / 1000, ease: "easeIn" } }
                : { scale: 0.88, opacity: 0, transition: { duration: CANCEL_MS / 1000, ease: "easeIn" } }
          }
          transition={{ type: "spring", stiffness: 480, damping: 30, mass: 0.8 }}
        >
          <Wheel
            slots={session.slots}
            radius={fullscreen ? 250 : 200}
            hot={hot}
            flash={phase === "selecting" ? hot : null}
            aim={aim}
            hint={hint}
          />
        </motion.div>
      )}
    </div>
  );
}
