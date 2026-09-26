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
    let open = wheel::is_open(app);
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

fn register_hotkey(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    let _ = shortcuts.unregister_all();
    if let Some(button) = mouse::parse(accelerator) {
        if !mouse::ensure_tap(app) {
            mouse::set_binding(None);
            return Err("Mouse buttons need Accessibility access. Turn it on first, then try again.".into());
        }
        mouse::set_binding(Some(button));
        return Ok(());
    }
    mouse::set_binding(None);
    shortcuts
        .on_shortcut(accelerator, |app, _, event| on_trigger(app, event.state == ShortcutState::Pressed))
        .map_err(|e| e.to_string())
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
    let old_hotkey = state.config.lock().unwrap().hotkey.clone();
    if config.hotkey != old_hotkey {
        if let Err(err) = register_hotkey(&app, &config.hotkey) {
            let _ = register_hotkey(&app, &old_hotkey);
            return Err(if mouse::parse(&config.hotkey).is_some() {
                err
            } else {
                format!("That shortcut can't be used ({err}). Try another combination.")
            });
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
fn pause_hotkey(app: AppHandle, state: tauri::State<AppState>, paused: bool) -> Result<(), String> {
    if paused {
        let _ = app.global_shortcut().unregister_all();
        mouse::set_binding(None);
        mouse::ensure_tap(&app);
        mouse::set_recording(true);
        Ok(())
    } else {
        mouse::set_recording(false);
        let hotkey = state.config.lock().unwrap().hotkey.clone();
        register_hotkey(&app, &hotkey)
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
        let hotkey = state.config.lock().unwrap().hotkey.clone();
        if mouse::parse(&hotkey).is_some() {
            let _ = register_hotkey(&app, &hotkey);
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
            if let Err(err) = register_hotkey(&handle, &config.hotkey) {
                eprintln!("couldn't register hotkey {}: {err}", config.hotkey);
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
