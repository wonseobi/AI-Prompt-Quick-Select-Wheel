import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "../shared/api";
import { mock } from "../shared/mock";
import { activeProfile } from "../shared/types";
import "../styles/tokens.css";
import "./overlay.css";
import { WheelOverlay } from "./WheelOverlay";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WheelOverlay />
  </React.StrictMode>,
);

// Browser preview (`npm run dev`, open /wheel.html): hold Space to open the
// wheel where the mouse is, release to pick. Mirrors the app's hold mode.
// Press D for the profile picker (or an in-place swap while the wheel is open).
if (!isTauri) {
  document.body.style.background = "#5b6472 linear-gradient(160deg, #7d8898, #3c434f)";
  let mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  let open = false;
  const params = new URLSearchParams(location.search);
  const payload = () => ({
    ...mouse,
    width: innerWidth,
    height: innerHeight,
    placement: (params.get("placement") ?? "cursor") as "cursor" | "fullscreen",
    activation: "hold" as const,
    scale: mock.config.wheelScale,
    profileName: activeProfile(mock.config).name,
    slots: activeProfile(mock.config).slots,
  });
  addEventListener("mousemove", (e) => (mouse = { x: e.clientX, y: e.clientY }));
  addEventListener("keydown", (e) => {
    if (e.code !== "Space" || open) return;
    open = true;
    const p = payload();
    if (p.placement === "fullscreen") Object.assign(p, { x: innerWidth / 2, y: innerHeight / 2 });
    mock.emit("wheel://open", p);
  });
  addEventListener("keydown", (e) => {
    if (e.code !== "KeyD") return;
    const cfg = mock.config;
    const index = (cfg.profiles.findIndex((p) => p.id === cfg.activeProfile) + 1) % cfg.profiles.length;
    cfg.activeProfile = cfg.profiles[index].id;
    const profile = { profileName: cfg.profiles[index].name, index, total: cfg.profiles.length, slots: cfg.profiles[index].slots };
    if (open) return mock.emit("wheel://profile", profile);
    cfg.activeProfile = cfg.profiles[(index - 1 + cfg.profiles.length) % cfg.profiles.length].id;
    mock.emit("picker://open", {
      ...mouse,
      activeProfile: cfg.activeProfile,
      profiles: cfg.profiles.map((p) => ({ id: p.id, name: p.name, icons: p.slots.map((s) => (s.prompt.trim() ? s.icon || "💬" : "")) })),
    });
  });
  addEventListener("keyup", (e) => {
    if (e.code !== "Space") return;
    open = false;
    mock.emit("wheel://release");
  });
  if (params.has("open")) setTimeout(() => mock.emit("wheel://open", payload()), 300);
}
