import { motion } from "motion/react";
import { segmentPath } from "../shared/geometry";
import { hotkeyParts } from "../shared/hotkey";
import type { Activation, Config, Placement } from "../shared/types";
import { HotkeyRecorder, Keycaps } from "./HotkeyRecorder";

interface Props {
  config: Config;
  onChange: (changes: Partial<Config>) => void;
  onHotkey: (accelerator: string) => Promise<string | null>;
}

export function BehaviorTab({ config, onChange, onHotkey }: Props) {
  const keys = hotkeyParts(config.hotkey);
  return (
    <div className="behavior">
      <div className="col">
        <section className="card">
          <div className="card-head">
            <h2>Shortcut</h2>
            <p className="muted">The key combination that brings up the wheel, from any app.</p>
          </div>
          <HotkeyRecorder value={config.hotkey} onSave={onHotkey} />
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Try it</h2>
            <p className="muted">
              Click in the box, then use <Keycaps parts={keys} /> and pick a slot.
            </p>
          </div>
          <textarea className="input try-input" placeholder="Your prompt will be pasted here…" />
        </section>
      </div>
      <div className="col">
        <section className="card">
          <div className="card-head">
            <h2>How it opens</h2>
          </div>
          <div className="options">
            <Option<Activation>
              group="activation"
              value="hold"
              current={config.activation}
              onPick={(activation) => onChange({ activation })}
              title="Hold & release"
              badge="Default"
              scene={<Scene kind="hold" />}
            >
              Hold <Keycaps parts={keys} />, aim with the mouse, let go to paste. Fastest once it's muscle memory.
            </Option>
            <Option<Activation>
              group="activation"
              value="toggle"
              current={config.activation}
              onPick={(activation) => onChange({ activation })}
              title="Press to toggle"
              scene={<Scene kind="toggle" />}
            >
              Press once to open, then click a slot or press 1–8. Press the shortcut again or Esc to close.
            </Option>
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Where it opens</h2>
          </div>
          <div className="options">
            <Option<Placement>
              group="placement"
              value="cursor"
              current={config.placement}
              onPick={(placement) => onChange({ placement })}
              title="At the cursor"
              badge="Default"
              scene={<Scene kind="cursor" />}
            >
              The wheel appears right under your mouse, so every slot is a short flick away.
            </Option>
            <Option<Placement>
              group="placement"
              value="fullscreen"
              current={config.placement}
              onPick={(placement) => onChange({ placement })}
              title="Full screen"
              scene={<Scene kind="fullscreen" />}
            >
              A bigger wheel in the middle of the screen with the background dimmed.
            </Option>
          </div>
        </section>
      </div>
    </div>
  );
}

interface OptionProps<T> {
  /** Options sharing a group animate their radio dot between each other. */
  group: string;
  value: T;
  current: T;
  onPick: (value: T) => void;
  title: string;
  badge?: string;
  scene: React.ReactNode;
  children: React.ReactNode;
}

function Option<T extends string>({ group, value, current, onPick, title, badge, scene, children }: OptionProps<T>) {
  const on = value === current;
  return (
    <motion.button type="button" className={`option${on ? " is-on" : ""}`} onClick={() => onPick(value)} whileTap={{ scale: 0.985 }}>
      <div className="option-scene">{scene}</div>
      <div className="option-text">
        <div className="option-title">
          <span className={`radio${on ? " is-on" : ""}`}>
            {on && <motion.span layoutId={`radio-${group}`} className="radio-dot" />}
          </span>
          {title}
          {badge && <span className="badge">{badge}</span>}
        </div>
        <p>{children}</p>
      </div>
    </motion.button>
  );
}

/** Tiny illustrations so each option explains itself at a glance. */
function MiniWheel({ cx, cy, r, hot }: { cx: number; cy: number; r: number; hot: number }) {
  return (
    <g>
      {Array.from({ length: 8 }, (_, i) => (
        <path key={i} d={segmentPath(cx, cy, r * 0.5, r, i, 2)} className={i === hot ? "mini-hot" : "mini-seg"} />
      ))}
    </g>
  );
}

function Scene({ kind }: { kind: "hold" | "toggle" | "cursor" | "fullscreen" }) {
  const cursor = (x: number, y: number) => (
    <path d={`M${x} ${y} l0 13 l3.5 -3.5 l2.5 5.5 l2.2 -1 l-2.5 -5.3 l5 0 Z`} className="mini-cursor" />
  );
  if (kind === "hold" || kind === "toggle") {
    return (
      <svg viewBox="0 0 160 90" className="scene">
        <g className={kind === "hold" ? "scene-key hold" : "scene-key tap"}>
          <rect x="16" y="30" width="34" height="30" rx="6" className="mini-key" />
          <text x="33" y="50" textAnchor="middle" className="mini-key-text">⌥</text>
        </g>
        <text x="33" y="78" textAnchor="middle" className="mini-caption">{kind === "hold" ? "hold" : "tap · tap"}</text>
        <MiniWheel cx={112} cy={45} r={32} hot={2} />
        {kind === "hold" ? cursor(132, 38) : <circle cx="138" cy="42" r="5" className="mini-click" />}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 160 90" className="scene">
      <rect x="8" y="6" width="144" height="78" rx="6" className={kind === "fullscreen" ? "mini-screen dim" : "mini-screen"} />
      {kind === "cursor" ? (
        <>
          <MiniWheel cx={108} cy={52} r={22} hot={1} />
          {cursor(108, 52)}
        </>
      ) : (
        <MiniWheel cx={80} cy={45} r={32} hot={0} />
      )}
    </svg>
  );
}
