mod config;
mod mouse;
mod paste;
mod wheel;

use config::{Activation, Config, Loadout, Slot};
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WindowEvent, Wry,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub const SETTINGS_LABEL: &str = "settings";
const TRAY_ID: &str = "main";

pub struct AppState {
    pub config: Mutex<Config>,
    pub wheel: Mutex<wheel::WheelState>,
}

// ---------- hotkey ----------

/// The hotkey (key combo or mouse button) went down or up.
pub fn on_trigger(app: &AppHandle, pressed: bool) {
    let activation = app.state::<AppState>().config.lock().unwrap().activation;
    let (open, picker) = wheel::mode(app);
    if open && picker {
        return; // the profile picker is up; finish with it first
    }
    match (pressed, open) {
        (true, false) => wheel::open(app),
        // Second press in toggle mode closes; key repeat in hold mode is ignored.
        (true, true) if activation == Activation::Toggle => {
            let _ = app.emit_to(wheel::WHEEL_LABEL, "wheel://dismiss", ());
        }
        (false, true) if activation == Activation::Hold => {
            let _ = app.emit_to(wheel::WHEEL_LABEL, "wheel://release", ());
        }
        _ => {}
    }
}

const MOUSE_NEEDS_ACCESS: &str = "Mouse buttons need Accessibility access. Turn it on first, then try again.";

/// Registers the wheel hotkey and the optional "next profile" hotkey. Each can
/// be a key combo or a mouse button.
fn register_hotkeys(app: &AppHandle, wheel: &str, profile: &str) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    let _ = shortcuts.unregister_all();
    mouse::set_bindings(None, None);
    let (wheel_button, profile_button) = (mouse::parse(wheel), mouse::parse(profile));
    if (wheel_button.is_some() || profile_button.is_some()) && !mouse::ensure_tap(app) {
        return Err(MOUSE_NEEDS_ACCESS.into());
    }
    if wheel_button.is_none() {
        shortcuts
            .on_shortcut(wheel, |app, _, event| on_trigger(app, event.state == ShortcutState::Pressed))
            .map_err(|e| format!("That shortcut can't be used ({e}). Try another combination."))?;
    }
    if profile_button.is_none() && !profile.trim().is_empty() {
        shortcuts
            .on_shortcut(profile, |app, _, event| on_profile_trigger(app, event.state == ShortcutState::Pressed))
            .map_err(|e| format!("That profile shortcut can't be used ({e}). Try another combination."))?;
    }
    mouse::set_bindings(wheel_button, profile_button);
    Ok(())
}

fn register_from_config(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let (wheel, profile) = {
        let cfg = state.config.lock().unwrap();
        (cfg.hotkey.clone(), cfg.profile_hotkey.clone())
    };
    register_hotkeys(app, &wheel, &profile)
}

/// The profile hotkey went down or up. With the wheel closed it opens the
/// profile picker (hold, point, release; or tap and click). With the wheel
/// open it flips straight to the next profile so aiming isn't interrupted.
pub fn on_profile_trigger(app: &AppHandle, pressed: bool) {
    let (open, picker) = wheel::mode(app);
    match (pressed, open, picker) {
        (true, false, _) => wheel::open_picker(app),
        (true, true, false) => next_profile(app),
        (true, true, true) => {
            let _ = app.emit_to(wheel::WHEEL_LABEL, "picker://dismiss", ());
        }
        (false, true, true) => {
            let _ = app.emit_to(wheel::WHEEL_LABEL, "picker://release", ());
        }
        _ => {}
    }
}

/// Cycles to the next profile (wrapping around) while the wheel is open.
fn next_profile(app: &AppHandle) {
    let state = app.state::<AppState>();
    let cfg = {
        let mut cfg = state.config.lock().unwrap();
        let index = cfg.profiles.iter().position(|p| p.id == cfg.active_profile).unwrap_or(0);
        let next = (index + 1) % cfg.profiles.len();
        cfg.active_profile = cfg.profiles[next].id.clone();
        cfg.clone()
    };
    let _ = config::save(app, &cfg);
    let _ = app.emit("config://external", &cfg);
    refresh_tray(app);
    let index = cfg.profiles.iter().position(|p| p.id == cfg.active_profile).unwrap_or(0);
    let profile = cfg.active();
    wheel::profile_switched(app, profile.name.clone(), index, cfg.profiles.len(), profile.slots.clone());
}

// ---------- settings window ----------

fn show_settings(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    if let Some(win) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn hide_settings(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = win.hide();
    }
    // Back to a menu-bar-only app: no Dock icon, no Cmd+Tab entry.
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
}

// ---------- tray ----------

fn tray_menu(app: &AppHandle, cfg: &Config) -> tauri::Result<Menu<Wry>> {
    let profiles = cfg
        .profiles
        .iter()
        .map(|p| CheckMenuItem::with_id(app, format!("profile:{}", p.id), &p.name, true, p.id == cfg.active_profile, None::<&str>))
        .collect::<tauri::Result<Vec<_>>>()?;
    let profile_refs: Vec<&dyn IsMenuItem<Wry>> = profiles.iter().map(|i| i as &dyn IsMenuItem<Wry>).collect();
    let profile_menu = Submenu::with_items(app, format!("Profile: {}", cfg.active().name), true, &profile_refs)?;
    let open = MenuItem::with_id(app, "settings", "Open Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Prompt Wheel", true, None::<&str>)?;
    Menu::with_items(app, &[&profile_menu, &PredefinedMenuItem::separator(app)?, &open, &quit])
}

fn refresh_tray(app: &AppHandle) {
    let cfg = app.state::<AppState>().config.lock().unwrap().clone();
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY_ID), tray_menu(app, &cfg)) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn switch_profile(app: &AppHandle, id: &str) {
    let state = app.state::<AppState>();
    let cfg = {
        let mut cfg = state.config.lock().unwrap();
        if !cfg.profiles.iter().any(|p| p.id == id) {
            return;
        }
        cfg.active_profile = id.to_string();
        cfg.clone()
    };
    let _ = config::save(app, &cfg);
    // Settings listens for this so an open settings window follows along.
    let _ = app.emit("config://external", &cfg);
    refresh_tray(app);
}

fn build_tray(app: &AppHandle, cfg: &Config) -> tauri::Result<()> {
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .icon_as_template(true)
        .tooltip("Prompt Wheel")
        .menu(&tray_menu(app, cfg)?)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "settings" => show_settings(app),
            "quit" => app.exit(0),
            id => {
                if let Some(profile) = id.strip_prefix("profile:") {
                    switch_profile(app, profile);
                }
            }
        })
        .build(app)?;
    Ok(())
}

// ---------- commands ----------

#[tauri::command]
fn get_config(state: tauri::State<AppState>) -> Config {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
fn save_config(app: AppHandle, state: tauri::State<AppState>, config: Config) -> Result<Config, String> {
    let config = config.normalized();
    let (old_wheel, old_profile) = {
        let cfg = state.config.lock().unwrap();
        (cfg.hotkey.clone(), cfg.profile_hotkey.clone())
    };
    if config.hotkey != old_wheel || config.profile_hotkey != old_profile {
        if let Err(err) = register_hotkeys(&app, &config.hotkey, &config.profile_hotkey) {
            let _ = register_hotkeys(&app, &old_wheel, &old_profile);
            return Err(err);
        }
    }
    config::save(&app, &config)?;
    *state.config.lock().unwrap() = config.clone();
    refresh_tray(&app);
    Ok(config)
}

/// While settings records a new hotkey, the current one is switched off so the
/// OS doesn't swallow it, and extra mouse buttons are reported instead of used.
#[tauri::command]
fn pause_hotkey(app: AppHandle, paused: bool) -> Result<(), String> {
    if paused {
        let _ = app.global_shortcut().unregister_all();
        mouse::set_bindings(None, None);
        mouse::ensure_tap(&app);
        mouse::set_recording(true);
        Ok(())
    } else {
        mouse::set_recording(false);
        register_from_config(&app)
    }
}

#[tauri::command]
fn wheel_select(app: AppHandle, state: tauri::State<AppState>, index: usize) {
    let prompt = state.config.lock().unwrap().active().slots.get(index).map(|s| s.prompt.clone());
    wheel::close(&app);
    if let Some(prompt) = prompt.filter(|p| !p.trim().is_empty()) {
        paste::paste_text(app, prompt);
    }
}

/// A profile was picked in the profile picker.
#[tauri::command]
fn choose_profile(app: AppHandle, id: String) {
    switch_profile(&app, &id);
    wheel::close(&app);
}

#[tauri::command]
fn wheel_cancel(app: AppHandle) {
    wheel::close(&app);
}

#[tauri::command]
fn export_loadout(path: String, name: String, description: String, slots: Vec<Slot>) -> Result<(), String> {
    config::export_loadout(&path, &name, &description, &slots)
}

#[tauri::command]
fn import_loadout(path: String) -> Result<Loadout, String> {
    config::import_loadout(&path)
}

#[tauri::command]
fn input_permission(app: AppHandle, state: tauri::State<AppState>) -> bool {
    let trusted = paste::has_input_permission();
    // Access was just granted: a saved mouse-button hotkey can start working now.
    if trusted && !mouse::is_available() && mouse::ensure_tap(&app) {
        let uses_mouse = {
            let cfg = state.config.lock().unwrap();
            mouse::parse(&cfg.hotkey).is_some() || mouse::parse(&cfg.profile_hotkey).is_some()
        };
        if uses_mouse {
            let _ = register_from_config(&app);
        }
    }
    trusted
}

#[tauri::command]
fn open_permission_settings() {
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
}

#[tauri::command]
fn get_autostart(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let launcher = app.autolaunch();
    let result = if enabled { launcher.enable() } else { launcher.disable() };
    result.map_err(|e| e.to_string())?;
    Ok(launcher.is_enabled().unwrap_or(enabled))
}

/// Opens the system emoji picker; it types into whichever input has focus.
#[tauri::command]
fn open_emoji_palette(app: AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.run_on_main_thread(|| {
        use objc2::{class, msg_send, runtime::AnyObject};
        unsafe {
            let ns_app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
            let _: () = msg_send![ns_app, orderFrontCharacterPalette: std::ptr::null::<AnyObject>()];
        }
    });
    let _ = app;
}

// ---------- app ----------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            pause_hotkey,
            wheel_select,
            wheel_cancel,
            choose_profile,
            export_loadout,
            import_loadout,
            input_permission,
            open_permission_settings,
            get_autostart,
            set_autostart,
            open_emoji_palette,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let (config, first_launch) = config::load(&handle);
            // Save right away so migrations from older versions stick.
            let _ = config::save(&handle, &config);
            if let Err(err) = register_hotkeys(&handle, &config.hotkey, &config.profile_hotkey) {
                eprintln!("couldn't register hotkeys: {err}");
            }
            build_tray(&handle, &config)?;
            app.manage(AppState { config: Mutex::new(config), wheel: Mutex::new(Default::default()) });

            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                if let Some(win) = app.get_webview_window(wheel::WHEEL_LABEL) {
                    wheel::float_over_fullscreen(&win);
                }
            }
            if first_launch || !paste::has_input_permission() {
                show_settings(&handle);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == SETTINGS_LABEL {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    hide_settings(window.app_handle());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Prompt Wheel")
        .run(|app, event| {
            // Clicking the Dock icon while settings is hidden brings it back.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                show_settings(app);
            }
            let _ = (app, event);
        });
}
