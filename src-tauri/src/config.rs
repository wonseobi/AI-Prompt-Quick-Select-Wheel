//! User settings and prompt profiles, persisted as JSON in the app config dir.

use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

pub const SLOT_COUNT: usize = 8;
pub const DEFAULT_HOTKEY: &str = "Alt+KeyF";
/// v1 default; too close to Cmd+Q (quit), so it's migrated to DEFAULT_HOTKEY.
const OLD_DEFAULT_HOTKEY: &str = "Alt+KeyQ";
const CONFIG_VERSION: u32 = 2;
const LOADOUT_TYPE: &str = "prompt-wheel-loadout";
pub const MIN_SCALE: f64 = 0.7;
pub const MAX_SCALE: f64 = 1.4;

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

/// A named set of 8 slots. Users switch between profiles to swap whole wheels.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub slots: Vec<Slot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    pub version: u32,
    pub hotkey: String,
    pub activation: Activation,
    pub placement: Placement,
    /// Wheel size multiplier, MIN_SCALE..=MAX_SCALE.
    pub wheel_scale: f64,
    pub profiles: Vec<Profile>,
    pub active_profile: String,
    /// v1 stored a single set of slots here; read once and moved into a profile.
    #[serde(skip_serializing)]
    slots: Option<Vec<Slot>>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            hotkey: DEFAULT_HOTKEY.into(),
            activation: Activation::default(),
            placement: Placement::default(),
            wheel_scale: 1.0,
            profiles: vec![Profile { id: "default".into(), name: "Coding".into(), slots: default_slots() }],
            active_profile: "default".into(),
            slots: None,
        }
    }
}

impl Config {
    /// Upgrades older files and repairs anything out of range.
    pub fn normalized(mut self) -> Self {
        // Missing fields are filled from Default, so a v1 file arrives with the
        // default profile in place; replace it with the user's own slots.
        if let Some(slots) = self.slots.take() {
            if self.version < 2 {
                self.profiles = vec![Profile { id: "default".into(), name: "Coding".into(), slots }];
                self.active_profile = "default".into();
            }
        }
        if self.version < 2 && self.hotkey == OLD_DEFAULT_HOTKEY {
            self.hotkey = DEFAULT_HOTKEY.into();
        }
        self.version = CONFIG_VERSION;

        if self.hotkey.trim().is_empty() {
            self.hotkey = DEFAULT_HOTKEY.into();
        }
        if !self.wheel_scale.is_finite() || self.wheel_scale == 0.0 {
            self.wheel_scale = 1.0;
        }
        self.wheel_scale = self.wheel_scale.clamp(MIN_SCALE, MAX_SCALE);

        if self.profiles.is_empty() {
            self.profiles = Config::default().profiles;
        }
        for (i, profile) in self.profiles.iter_mut().enumerate() {
            profile.slots.resize(SLOT_COUNT, Slot::default());
            if profile.id.trim().is_empty() {
                profile.id = format!("profile-{i}");
            }
            if profile.name.trim().is_empty() {
                profile.name = format!("Profile {}", i + 1);
            }
        }
        if !self.profiles.iter().any(|p| p.id == self.active_profile) {
            self.active_profile = self.profiles[0].id.clone();
        }
        self
    }

    pub fn active(&self) -> &Profile {
        self.profiles.iter().find(|p| p.id == self.active_profile).unwrap_or(&self.profiles[0])
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
