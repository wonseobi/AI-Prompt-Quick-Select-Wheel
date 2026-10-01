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
// Press D to switch profile (popup when closed, in-place swap when open).
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
    if (open) mock.emit("wheel://profile", profile);
    else mock.emit("wheel://hud", { ...profile, ...mouse });
  });
  addEventListener("keyup", (e) => {
    if (e.code !== "Space") return;
    open = false;
    mock.emit("wheel://release");
  });
  if (params.has("open")) setTimeout(() => mock.emit("wheel://open", payload()), 300);
}
