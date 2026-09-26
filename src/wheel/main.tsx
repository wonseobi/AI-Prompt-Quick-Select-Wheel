import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "../shared/api";
import { mock } from "../shared/mock";
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
    slots: mock.config.slots,
  });
  addEventListener("mousemove", (e) => (mouse = { x: e.clientX, y: e.clientY }));
  addEventListener("keydown", (e) => {
    if (e.code !== "Space" || open) return;
    open = true;
    const p = payload();
    if (p.placement === "fullscreen") Object.assign(p, { x: innerWidth / 2, y: innerHeight / 2 });
    mock.emit("wheel://open", p);
  });
  addEventListener("keyup", (e) => {
    if (e.code !== "Space") return;
    open = false;
    mock.emit("wheel://release");
  });
  if (params.has("open")) setTimeout(() => mock.emit("wheel://open", payload()), 300);
}
