mod config;
mod paste;
mod wheel;

use config::{Activation, Config, Loadout, Slot};
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutEvent, ShortcutState};

pub const SETTINGS_LABEL: &str = "settings";

pub struct AppState {
    pub config: Mutex<Config>,
    pub wheel: Mutex<wheel::WheelState>,
}

// ---------- hotkey ----------

fn on_hotkey(app: &AppHandle, event: ShortcutEvent) {
    let activation = app.state::<AppState>().config.lock().unwrap().activation;
    let open = wheel::is_open(app);
    match event.state {
        ShortcutState::Pressed if !open => wheel::open(app),
        // Second press in toggle mode closes; key repeat in hold mode is ignored.
        ShortcutState::Pressed if activation == Activation::Toggle => {
            let _ = app.emit_to(wheel::WHEEL_LABEL, "wheel://dismiss", ());
        }
        ShortcutState::Released if open && activation == Activation::Hold => {
            let _ = app.emit_to(wheel::WHEEL_LABEL, "wheel://release", ());
        }
        _ => {}
    }
}

fn register_hotkey(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    let _ = shortcuts.unregister_all();
    shortcuts
        .on_shortcut(accelerator, |app, _, event| on_hotkey(app, event))
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
            return Err(format!("That shortcut can't be used ({err}). Try another combination."));
        }
    }
    config::save(&app, &config)?;
    *state.config.lock().unwrap() = config.clone();
    let _ = app.emit("config://changed", &config);
    Ok(config)
}

/// Unregisters the hotkey while settings records a new one, so the OS
/// doesn't swallow the combination before the recorder sees it.
#[tauri::command]
fn pause_hotkey(app: AppHandle, state: tauri::State<AppState>, paused: bool) -> Result<(), String> {
    if paused {
        app.global_shortcut().unregister_all().map_err(|e| e.to_string())
    } else {
        let hotkey = state.config.lock().unwrap().hotkey.clone();
        register_hotkey(&app, &hotkey)
    }
}

#[tauri::command]
fn wheel_select(app: AppHandle, state: tauri::State<AppState>, index: usize) {
    let prompt = state.config.lock().unwrap().slots.get(index).map(|s| s.prompt.clone());
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
fn input_permission() -> bool {
    paste::has_input_permission()
}

#[tauri::command]
fn open_permission_settings() {
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
}

// ---------- app ----------

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "settings", "Open Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Prompt Wheel", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;
    TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .icon_as_template(true)
        .tooltip("Prompt Wheel")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "settings" => show_settings(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
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
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let (config, first_launch) = config::load(&handle);
            if first_launch {
                let _ = config::save(&handle, &config);
            }
            if let Err(err) = register_hotkey(&handle, &config.hotkey) {
                eprintln!("couldn't register hotkey {}: {err}", config.hotkey);
            }
            app.manage(AppState {
                config: Mutex::new(config),
                wheel: Mutex::new(Default::default()),
            });

            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            build_tray(&handle)?;

            if let Some(wheel) = app.get_webview_window(wheel::WHEEL_LABEL) {
                let _ = wheel.set_visible_on_all_workspaces(true);
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
