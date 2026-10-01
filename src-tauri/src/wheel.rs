//! Showing and hiding the wheel overlay window.
//!
//! The overlay always covers the whole monitor under the cursor (transparent in
//! cursor mode, dimmed in fullscreen mode), so every mouse move lands in our
//! webview and the wheel can be drawn anywhere on it.

use crate::{
    config::{Activation, Placement, Slot},
    AppState,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, LogicalPosition, Manager, Monitor, PhysicalPosition, WebviewWindow};

pub const WHEEL_LABEL: &str = "wheel";
/// Outer wheel radius (logical px) at 100% size. Keep in sync with WheelOverlay.tsx.
const CURSOR_RADIUS: f64 = 200.0;

#[derive(Default)]
pub struct WheelState {
    /// The overlay is up and has focus (wheel or profile picker).
    pub open: bool,
    /// The overlay is showing the profile picker rather than the wheel.
    pub picker: bool,
    /// Cursor position to restore on close, if we had to move it.
    restore_cursor: Option<LogicalPosition<f64>>,
    /// The settings window had focus when the wheel opened, so return there.
    return_to_settings: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenPayload {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    placement: Placement,
    activation: Activation,
    scale: f64,
    profile_name: String,
    slots: Vec<Slot>,
}

fn monitor_under(app: &AppHandle, point: PhysicalPosition<f64>) -> Option<Monitor> {
    let contains = |m: &Monitor| {
        let (p, s) = (m.position(), m.size());
        point.x >= p.x as f64
            && point.y >= p.y as f64
            && point.x < (p.x + s.width as i32) as f64
            && point.y < (p.y + s.height as i32) as f64
    };
    app.available_monitors()
        .ok()
        .and_then(|ms| ms.into_iter().find(contains))
        .or_else(|| app.primary_monitor().ok().flatten())
}

/// The overlay stretched over the monitor under the cursor, in logical px.
struct Cover {
    width: f64,
    height: f64,
    cursor_x: f64,
    cursor_y: f64,
}

fn cover_monitor(app: &AppHandle, win: &WebviewWindow) -> Option<Cover> {
    let cursor = app.cursor_position().unwrap_or_default();
    let monitor = monitor_under(app, cursor)?;
    let scale = monitor.scale_factor();
    let _ = win.set_position(*monitor.position());
    let _ = win.set_size(*monitor.size());
    let origin = win.outer_position().unwrap_or(*monitor.position());
    Some(Cover {
        width: monitor.size().width as f64 / scale,
        height: monitor.size().height as f64 / scale,
        cursor_x: (cursor.x - origin.x as f64) / scale,
        cursor_y: (cursor.y - origin.y as f64) / scale,
    })
}

fn settings_focused(app: &AppHandle) -> bool {
    app.get_webview_window(crate::SETTINGS_LABEL)
        .is_some_and(|w| w.is_focused().unwrap_or(false))
}

pub fn open(app: &AppHandle) {
    let state = app.state::<AppState>();
    let cfg = state.config.lock().unwrap().clone();
    let Some(win) = app.get_webview_window(WHEEL_LABEL) else { return };
    let Some(Cover { width, height, cursor_x, cursor_y }) = cover_monitor(app, &win) else { return };

    // Keep the whole wheel on screen in cursor mode.
    let margin = CURSOR_RADIUS * cfg.wheel_scale + 30.0;
    let (x, y) = match cfg.placement {
        Placement::Fullscreen => (width / 2.0, height / 2.0),
        Placement::Cursor => (
            cursor_x.clamp(margin.min(width / 2.0), (width - margin).max(width / 2.0)),
            cursor_y.clamp(margin.min(height / 2.0), (height - margin).max(height / 2.0)),
        ),
    };
    // Aim is measured from the wheel center, so the cursor must start there.
    let moved = (x - cursor_x).abs() > 1.0 || (y - cursor_y).abs() > 1.0;

    *state.wheel.lock().unwrap() = WheelState {
        open: true,
        picker: false,
        restore_cursor: moved.then(|| LogicalPosition::new(cursor_x, cursor_y)),
        return_to_settings: settings_focused(app),
    };

    let profile = cfg.active();
    let _ = app.emit_to(
        WHEEL_LABEL,
        "wheel://open",
        OpenPayload {
            x,
            y,
            width,
            height,
            placement: cfg.placement,
            activation: cfg.activation,
            scale: cfg.wheel_scale,
            profile_name: profile.name.clone(),
            slots: profile.slots.clone(),
        },
    );
    let _ = win.show();
    let _ = win.set_focus();
    if moved {
        let _ = win.set_cursor_position(LogicalPosition::new(x, y));
    }
}

pub fn close(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut wheel = state.wheel.lock().unwrap();
    if !wheel.open {
        return;
    }
    wheel.open = false;
    let Some(win) = app.get_webview_window(WHEEL_LABEL) else { return };
    if let Some(pos) = wheel.restore_cursor.take() {
        let _ = win.set_cursor_position(pos);
    }
    let _ = win.hide();

    if wheel.return_to_settings {
        if let Some(settings) = app.get_webview_window(crate::SETTINGS_LABEL) {
            let _ = settings.set_focus();
        }
    } else {
        // Hiding the app hands focus back to whatever app was in front before.
        #[cfg(target_os = "macos")]
        let _ = app.hide();
    }
}

/// (overlay open, showing the profile picker)
pub fn mode(app: &AppHandle) -> (bool, bool) {
    let state = app.state::<AppState>();
    let wheel = state.wheel.lock().unwrap();
    (wheel.open, wheel.picker)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfilePayload {
    profile_name: String,
    index: usize,
    total: usize,
    slots: Vec<Slot>,
}

/// "Next profile" while the wheel is open: swap its slots in place.
pub fn profile_switched(app: &AppHandle, name: String, index: usize, total: usize, slots: Vec<Slot>) {
    let _ = app.emit_to(WHEEL_LABEL, "wheel://profile", ProfilePayload { profile_name: name, index, total, slots });
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PickerProfile {
    id: String,
    name: String,
    /// One icon per slot, "" for empty slots: a tiny preview of the wheel.
    icons: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PickerPayload {
    x: f64,
    y: f64,
    active_profile: String,
    profiles: Vec<PickerProfile>,
}

/// Opens the profile picker next to the cursor.
pub fn open_picker(app: &AppHandle) {
    let state = app.state::<AppState>();
    let cfg = state.config.lock().unwrap().clone();
    let Some(win) = app.get_webview_window(WHEEL_LABEL) else { return };
    let Some(cover) = cover_monitor(app, &win) else { return };

    *state.wheel.lock().unwrap() = WheelState {
        open: true,
        picker: true,
        restore_cursor: None,
        return_to_settings: settings_focused(app),
    };

    let profiles = cfg
        .profiles
        .iter()
        .map(|p| PickerProfile {
            id: p.id.clone(),
            name: p.name.clone(),
            icons: p
                .slots
                .iter()
                .map(|s| if s.prompt.trim().is_empty() { String::new() } else if s.icon.is_empty() { "💬".into() } else { s.icon.clone() })
                .collect(),
        })
        .collect();
    let _ = app.emit_to(
        WHEEL_LABEL,
        "picker://open",
        PickerPayload { x: cover.cursor_x, y: cover.cursor_y, active_profile: cfg.active_profile.clone(), profiles },
    );
    let _ = win.show();
    let _ = win.set_focus();
}

/// Lets the overlay appear on every Space, including over full-screen apps,
/// and float above normal windows. Must run on the main thread.
#[cfg(target_os = "macos")]
pub fn float_over_fullscreen(win: &tauri::WebviewWindow) {
    use objc2::{msg_send, runtime::AnyObject};
    // NSWindowCollectionBehavior: CanJoinAllSpaces | Stationary | IgnoresCycle | FullScreenAuxiliary
    const BEHAVIOR: usize = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 8);
    // Same level as pop-up menus: above full-screen app windows.
    const LEVEL: isize = 101;
    let Ok(ptr) = win.ns_window() else { return };
    let ns_window = unsafe { &*(ptr as *const AnyObject) };
    unsafe {
        let _: () = msg_send![ns_window, setCollectionBehavior: BEHAVIOR];
        let _: () = msg_send![ns_window, setLevel: LEVEL];
    }
}
