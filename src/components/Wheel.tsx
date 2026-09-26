import { AnimatePresence, motion } from "motion/react";
import { polar, segmentPath, SLOT_ARC } from "../shared/geometry";
import { isEmpty, type Slot } from "../shared/types";
import "./wheel.css";

export interface WheelProps {
  slots: Slot[];
  /** Outer radius in px; everything else scales from it. */
  radius: number;
  /** Slot currently aimed at / hovered. */
  hot: number | null;
  /** Slot that was just picked, flashes before the wheel closes. */
  flash?: number | null;
  /** Continuous aim direction in degrees for the center pointer, or null to hide it. */
  aim?: number | null;
  /** Center text when nothing is aimed at. */
  hint?: string;
  /** Settings preview: slot being edited gets an outline. */
  selected?: number | null;
  /** Settings preview: pointer interaction directly on segments. */
  onHover?: (index: number | null) => void;
  onPick?: (index: number) => void;
}

const PUSH = 9; // how far the hot segment slides outward
const spring = { type: "spring", stiffness: 520, damping: 30, mass: 0.7 } as const;

export function Wheel({ slots, radius, hot, flash = null, aim = null, hint, selected = null, onHover, onPick }: WheelProps) {
  const pad = PUSH + 8;
  const size = (radius + pad) * 2;
  const c = size / 2;
  const r1 = radius;
  const r0 = radius * 0.54;
  const rMid = (r0 + r1) / 2 - 2;
  const itemW = (r1 - r0) * 1.1;
  const itemH = (r1 - r0) * 0.8;
  const interactive = Boolean(onPick);
  const hotSlot = hot === null ? undefined : slots[hot];

  return (
    <div
      className={`wheel${interactive ? " is-interactive" : ""}`}
      style={{ width: size, height: size, "--wheel-r": `${radius}px` } as React.CSSProperties}
      onMouseLeave={interactive ? () => onHover?.(null) : undefined}
    >
      <svg className="wheel-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="seg-hot" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--hot-inner)" />
            <stop offset="100%" stopColor="var(--hot-outer)" />
          </radialGradient>
        </defs>
        <circle className="wheel-halo" cx={c} cy={c} r={r1 + 1} />
        {slots.map((slot, i) => {
          const isHot = hot === i;
          const [dx, dy] = polar(0, 0, isHot ? PUSH : 0, i * SLOT_ARC);
          const [kx, ky] = polar(c, c, r1 - 13, i * SLOT_ARC + SLOT_ARC * 0.36);
          const cls = [
            "wheel-seg",
            isHot && "is-hot",
            flash === i && "is-flash",
            selected === i && "is-selected",
            isEmpty(slot) && "is-empty",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <motion.g
              key={i}
              className={cls}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, x: dx, y: dy }}
              transition={{ ...spring, opacity: { duration: 0.18, delay: i * 0.018 } }}
              onMouseEnter={interactive ? () => onHover?.(i) : undefined}
              onClick={interactive ? () => onPick?.(i) : undefined}
            >
              <path d={segmentPath(c, c, r0, r1, i, 5)} />
              <text className="wheel-key" x={kx} y={ky} textAnchor="middle" dominantBaseline="central">
                {i + 1}
              </text>
            </motion.g>
          );
        })}
      </svg>

      {slots.map((slot, i) => {
        const [x, y] = polar(c, c, rMid, i * SLOT_ARC);
        const isHot = hot === i;
        const [dx, dy] = polar(0, 0, isHot ? PUSH : 0, i * SLOT_ARC);
        return (
          <motion.div
            key={i}
            className={`wheel-item${isHot ? " is-hot" : ""}${isEmpty(slot) ? " is-empty" : ""}`}
            style={{ left: x - itemW / 2, top: y - itemH / 2, width: itemW, height: itemH }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: isHot ? 1.12 : 1, x: dx, y: dy }}
            transition={{ ...spring, opacity: { duration: 0.18, delay: 0.04 + i * 0.018 } }}
          >
            <span className="wheel-icon" style={{ fontSize: radius * 0.14 }}>
              {isEmpty(slot) ? "＋" : slot.icon || "💬"}
            </span>
            <span className="wheel-label">{isEmpty(slot) ? "Empty" : slot.label || `Slot ${i + 1}`}</span>
          </motion.div>
        );
      })}

      <div className="wheel-center" style={{ width: r0 * 2 - 18, height: r0 * 2 - 18 }}>
        {aim !== null && (
          <motion.div className="wheel-pointer" initial={false} animate={{ rotate: aim }} transition={{ type: "spring", stiffness: 700, damping: 40 }}>
            <span />
          </motion.div>
        )}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={hot ?? "hint"}
            className="wheel-center-text"
            initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, filter: "blur(3px)" }}
            transition={{ duration: 0.14 }}
          >
            {hot === null ? (
              <span className="wheel-hint">{hint}</span>
            ) : (
              <>
                <strong>{isEmpty(hotSlot) ? "Empty slot" : hotSlot?.label || `Slot ${hot + 1}`}</strong>
                <span className="wheel-count">
                  <kbd>{hot + 1}</kbd> / {slots.length}
                </span>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
