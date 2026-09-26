# Prompt Wheel

**A weapon wheel for your AI prompts.** Press a shortcut anywhere, flick the mouse toward a prompt, let go, and it's pasted into whatever you're typing in: ChatGPT, Claude, Cursor, a terminal, Slack.

Each prompt lives in a fixed direction, so after a few days you pick them by muscle memory without reading.

- **Hold & release** (default): hold the shortcut, aim, let go to paste. Or press `1`–`8`.
- **Press to toggle**: press once to open, click or press `1`–`8`, press again to close.
- **Any key combo or mouse button**: bind middle click or your mouse's thumb buttons (macOS).
- **Profiles**: keep several wheels (Coding, Writing, …) and switch from Settings or the menu bar.
- **Opens at the cursor** (default) or **full screen** with the background dimmed, even over full-screen apps.
- **Adjustable size**, 70–140%.
- **Clipboard-safe**: your clipboard is put back right after pasting.
- **Loadouts**: export a profile as a small JSON file to share; import one as a new profile.
- **Open at login**, optional.
- **Local only**: no account, no network, no telemetry.

## Install (from source)

Requirements: [Node 20+](https://nodejs.org), [Rust](https://rustup.rs), and Xcode Command Line Tools on macOS.

```bash
npm install
npm run tauri dev      # run in development
npm run tauri build    # build the .app / .dmg into src-tauri/target/release/bundle
```

On first launch, macOS asks for **Accessibility** access (System Settings → Privacy & Security → Accessibility). Prompt Wheel needs it to press ⌘V for you. The app lives in the menu bar; click its icon to open Settings.

Default shortcut: **⌥ F** (Option+F). Change it in the Settings tab.

## Loadouts

A loadout is a JSON file with 8 slots:

```json
{
  "type": "prompt-wheel-loadout",
  "version": 1,
  "name": "Starter: coding",
  "description": "Everyday prompts for coding with AI.",
  "slots": [{ "icon": "🔍", "label": "Code review", "prompt": "Review this code…" }]
}
```

Examples live in [`loadouts/`](loadouts). Loadouts only carry one profile's slots, never your shortcut or other settings.

## Project layout

| Path | What |
| --- | --- |
| `src-tauri/src/lib.rs` | App setup, tray, global shortcut, commands |
| `src-tauri/src/wheel.rs` | Showing/hiding the overlay on the monitor under the cursor |
| `src-tauri/src/paste.rs` | Clipboard-safe paste (stash → paste → restore) |
| `src-tauri/src/mouse.rs` | Mouse-button hotkeys via a macOS event tap |
| `src-tauri/src/config.rs` | Settings, profiles, loadout JSON, migrations |
| `src/components/Wheel.tsx` | The wheel itself, shared by the overlay and the settings preview |
| `src/wheel/` | Overlay window: aiming, keys, open/close animations |
| `src/settings/` | Settings window: Slots (with profiles), Settings, Loadouts |

Stack: [Tauri 2](https://tauri.app) (Rust) + React + TypeScript + [Motion](https://motion.dev). Small, fast, and cross-platform when we get there.

UI work without the app: `npm run dev`, then open `http://localhost:1420/settings.html` or `http://localhost:1420/wheel.html?open` (hold Space to open the wheel). A mock backend stands in for Rust.

## Roadmap

- Variables: `{{clipboard}}`, `{{selection}}`, `{{date}}`, fill-in fields
- Variants per slot (`< 2/3 >`): quick / strict / security versions of one prompt
- Wheels per app (a different loadout in Cursor, the terminal, ChatGPT…)
- Prompt preview in the wheel center
- Themes and sounds
- Windows and Linux

Visually inspired by open-world game weapon wheels. Not affiliated with any game or studio.
