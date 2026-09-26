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
use tauri::{AppHandle, Emitter, LogicalPosition, Manager, Monitor, PhysicalPosition};

pub const WHEEL_LABEL: &str = "wheel";
/// Outer wheel radius (logical px) at 100% size. Keep in sync with WheelOverlay.tsx.
const CURSOR_RADIUS: f64 = 200.0;

#[derive(Default)]
pub struct WheelState {
    pub open: bool,
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

pub fn open(app: &AppHandle) {
    let state = app.state::<AppState>();
    let cfg = state.config.lock().unwrap().clone();
    let Some(win) = app.get_webview_window(WHEEL_LABEL) else { return };
    let cursor = app.cursor_position().unwrap_or_default();
    let Some(monitor) = monitor_under(app, cursor) else { return };

    let scale = monitor.scale_factor();
    let _ = win.set_position(*monitor.position());
    let _ = win.set_size(*monitor.size());
    let origin = win.outer_position().unwrap_or(*monitor.position());

    let width = monitor.size().width as f64 / scale;
    let height = monitor.size().height as f64 / scale;
    let cursor_x = (cursor.x - origin.x as f64) / scale;
    let cursor_y = (cursor.y - origin.y as f64) / scale;

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

    let return_to_settings = app
        .get_webview_window(crate::SETTINGS_LABEL)
        .is_some_and(|w| w.is_focused().unwrap_or(false));

    *state.wheel.lock().unwrap() = WheelState {
        open: true,
        restore_cursor: moved.then(|| LogicalPosition::new(cursor_x, cursor_y)),
        return_to_settings,
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

pub fn is_open(app: &AppHandle) -> bool {
    app.state::<AppState>().wheel.lock().unwrap().open
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
