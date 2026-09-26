import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { api, isTauri } from "../shared/api";

const GROUPS: { title: string; emojis: string[] }[] = [
  { title: "Work", emojis: ["🔍", "🐛", "🧪", "✂️", "🧭", "📖", "💬", "🎯", "🚀", "🛠️", "📝", "💡", "🔒", "🎨", "📦", "⚡️", "🧹", "📊", "🌐", "🤖"] },
  { title: "Handy", emojis: ["✍️", "📌", "📎", "🗂️", "🧠", "🧩", "🔧", "⚙️", "🧾", "📣", "📬", "🗓️", "⏱️", "✅", "❓", "❗️", "🔥", "✨", "💎", "🏷️"] },
  { title: "Fun", emojis: ["😀", "😎", "🤔", "🫡", "🙌", "👀", "💪", "🧙", "🦄", "🐙", "🍕", "☕️", "🎮", "🎧", "🎸", "🏆", "🌈", "🌙", "⭐️", "❤️"] },
];

interface Props {
  value: string;
  onPick: (emoji: string) => void;
  onClose: () => void;
}

/** Last user-perceived character, so pasting "hi 🎸" still yields "🎸". */
function lastGrapheme(text: string): string {
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text.trim())];
  return segments.at(-1)?.segment ?? "";
}

export function EmojiPicker({ value, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // Defer so the click that opened the picker doesn't immediately close it.
    const t = setTimeout(() => window.addEventListener("mousedown", onDown));
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const openSystemPicker = () => {
    inputRef.current?.focus();
    api.openEmojiPalette();
  };

  return (
    <motion.div
      ref={ref}
      className="emoji-picker"
      initial={{ opacity: 0, y: -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 600, damping: 34 }}
    >
      {GROUPS.map((group) => (
        <div key={group.title} className="emoji-group">
          <span className="emoji-group-title">{group.title}</span>
          <div className="emoji-grid">
            {group.emojis.map((emoji) => (
              <button key={emoji} className={`emoji${value === emoji ? " is-on" : ""}`} onClick={() => onPick(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="emoji-custom">
        <input
          ref={inputRef}
          className="input"
          placeholder="Or type / paste any emoji"
          onChange={(e) => {
            const emoji = lastGrapheme(e.target.value);
            if (emoji) onPick(emoji);
          }}
        />
        {isTauri && (
          <button className="btn ghost" onClick={openSystemPicker}>
            All emoji…
          </button>
        )}
      </div>
    </motion.div>
  );
}
