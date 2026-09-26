//! User settings and prompt slots, persisted as JSON in the app config dir.

use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

pub const SLOT_COUNT: usize = 8;
pub const DEFAULT_HOTKEY: &str = "Alt+KeyQ";
const LOADOUT_TYPE: &str = "prompt-wheel-loadout";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Activation {
    /// Hold the hotkey, aim, release to paste.
    #[default]
    Hold,
    /// Press to open, press again to close.
    Toggle,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Placement {
    /// Wheel opens centered on the mouse cursor.
    #[default]
    Cursor,
    /// Wheel opens in the middle of the screen over a dimmed backdrop.
    Fullscreen,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct Slot {
    pub label: String,
    pub icon: String,
    pub prompt: String,
}

impl Slot {
    fn new(icon: &str, label: &str, prompt: &str) -> Self {
        Self { icon: icon.into(), label: label.into(), prompt: prompt.into() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    pub version: u32,
    pub hotkey: String,
    pub activation: Activation,
    pub placement: Placement,
    pub slots: Vec<Slot>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: 1,
            hotkey: DEFAULT_HOTKEY.into(),
            activation: Activation::default(),
            placement: Placement::default(),
            slots: default_slots(),
        }
    }
}

impl Config {
    /// Always exactly SLOT_COUNT slots, whatever the file contained.
    pub fn normalized(mut self) -> Self {
        self.slots.resize(SLOT_COUNT, Slot::default());
        if self.hotkey.trim().is_empty() {
            self.hotkey = DEFAULT_HOTKEY.into();
        }
        self
    }
}

/// A shareable prompt pack: just the slots plus a little metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Loadout {
    #[serde(rename = "type")]
    pub kind: String,
    pub version: u32,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub slots: Vec<Slot>,
}

fn default_slots() -> Vec<Slot> {
    vec![
        Slot::new("🔍", "Code review", "Review this code for bugs, edge cases and readability. List issues from most to least severe, each with a suggested fix."),
        Slot::new("🐛", "Debug", "Here is an error. Explain the root cause in plain terms, then give the smallest change that fixes it."),
        Slot::new("🧪", "Write tests", "Write focused tests for this code. Cover the happy path, edge cases and one failure case. Match the existing test style."),
        Slot::new("✂️", "Simplify", "Simplify this code without changing its behavior. Remove duplication and dead code, and keep names clear."),
        Slot::new("🧭", "Plan first", "Before writing any code, outline your plan: the files you will touch, the approach, and any open questions for me."),
        Slot::new("📖", "Explain", "Explain what this code does as if I'm new to the codebase. Start with the big picture, then walk through the key parts."),
        Slot::new("💬", "Commit msg", "Write a concise git commit message for these changes: a short summary line, then a few bullet points."),
        Slot::new("🎯", "Be concise", "Keep your answer short and direct. Lead with the result, skip the preamble."),
    ]
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

/// Returns the config and whether this is the first launch (no file yet).
pub fn load(app: &AppHandle) -> (Config, bool) {
    let Ok(path) = config_path(app) else { return (Config::default(), true) };
    match fs::read_to_string(&path) {
        Ok(raw) => match serde_json::from_str::<Config>(&raw) {
            Ok(cfg) => (cfg.normalized(), false),
            Err(err) => {
                // Keep the broken file around instead of silently overwriting it.
                eprintln!("config.json is invalid ({err}); using defaults");
                let _ = fs::rename(&path, path.with_extension("json.bak"));
                (Config::default(), false)
            }
        },
        Err(_) => (Config::default(), true),
    }
}

pub fn save(app: &AppHandle, cfg: &Config) -> Result<(), String> {
    let path = config_path(app)?;
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    // Write then rename so a crash never leaves a half-written file.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

pub fn export_loadout(path: &str, name: &str, description: &str, slots: &[Slot]) -> Result<(), String> {
    let loadout = Loadout {
        kind: LOADOUT_TYPE.into(),
        version: 1,
        name: name.trim().to_string(),
        description: description.trim().to_string(),
        slots: slots.iter().take(SLOT_COUNT).cloned().collect(),
    };
    let json = serde_json::to_string_pretty(&loadout).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| format!("Couldn't write the file: {e}"))
}

pub fn import_loadout(path: &str) -> Result<Loadout, String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("Couldn't read the file: {e}"))?;
    let mut loadout: Loadout =
        serde_json::from_str(&raw).map_err(|_| "This file isn't a Prompt Wheel loadout.".to_string())?;
    if loadout.kind != LOADOUT_TYPE {
        return Err("This file isn't a Prompt Wheel loadout.".into());
    }
    loadout.slots.resize(SLOT_COUNT, Slot::default());
    Ok(loadout)
}
