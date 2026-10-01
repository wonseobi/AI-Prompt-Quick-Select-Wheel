//! Mouse-button hotkeys (middle click, thumb buttons, extra gaming-mouse
//! buttons). Keyboard shortcuts go through the global-shortcut plugin; mouse
//! buttons need a system event tap, which only exists on macOS for now.
//!
//! Bindings are stored as "Mouse3" (middle), "Mouse4" (back), "Mouse5"
//! (forward) and so on: 1-based, the way gamers name them.

/// "Mouse4" -> Some(4). Left and right click (1 and 2) can't be bound.
pub fn parse(accelerator: &str) -> Option<i64> {
    let n: i64 = accelerator.strip_prefix("Mouse")?.parse().ok()?;
    (n >= 3).then_some(n)
}

#[cfg(target_os = "macos")]
pub use mac::{ensure_tap, is_available, set_bindings, set_recording};

#[cfg(not(target_os = "macos"))]
mod fallback {
    pub fn ensure_tap(_: &tauri::AppHandle) -> bool {
        false
    }
    pub fn is_available() -> bool {
        false
    }
    pub fn set_bindings(_: Option<i64>, _: Option<i64>) {}
    pub fn set_recording(_: bool) {}
}
#[cfg(not(target_os = "macos"))]
pub use fallback::*;

#[cfg(target_os = "macos")]
mod mac {
    use core_foundation::{
        base::TCFType,
        mach_port::{CFMachPortRef, CFMachPort},
        runloop::{kCFRunLoopCommonModes, CFRunLoop},
    };
    use core_graphics::event::{
        CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
        CallbackResult, EventField,
    };
    use std::{
        ffi::c_void,
        sync::{
            atomic::{AtomicBool, AtomicI64, AtomicPtr, Ordering},
            mpsc,
        },
        thread,
    };
    use tauri::{AppHandle, Emitter};

    /// Bound buttons, 1-based ("Mouse4" = 4); -1 when that hotkey is a key combo.
    static WHEEL_BUTTON: AtomicI64 = AtomicI64::new(-1);
    static PROFILE_BUTTON: AtomicI64 = AtomicI64::new(-1);
    /// Settings is recording a new hotkey: the next extra button press is it.
    static RECORDING: AtomicBool = AtomicBool::new(false);
    static RUNNING: AtomicBool = AtomicBool::new(false);
    static PORT: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());

    extern "C" {
        fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
    }

    /// Mouse buttons for opening the wheel and for switching profiles.
    pub fn set_bindings(wheel: Option<i64>, profile: Option<i64>) {
        WHEEL_BUTTON.store(wheel.unwrap_or(-1), Ordering::Relaxed);
        PROFILE_BUTTON.store(profile.unwrap_or(-1), Ordering::Relaxed);
    }

    pub fn set_recording(recording: bool) {
        RECORDING.store(recording, Ordering::Relaxed);
    }

    pub fn is_available() -> bool {
        RUNNING.load(Ordering::Relaxed)
    }

    /// Starts the event tap once Accessibility access is granted. Returns
    /// whether it's running. Safe to call repeatedly.
    pub fn ensure_tap(app: &AppHandle) -> bool {
        if RUNNING.load(Ordering::Relaxed) {
            return true;
        }
        if !crate::paste::has_input_permission() {
            return false;
        }
        let (tx, rx) = mpsc::channel();
        let app = app.clone();
        thread::spawn(move || {
            let tap = CGEventTap::new(
                CGEventTapLocation::Session,
                CGEventTapPlacement::HeadInsertEventTap,
                CGEventTapOptions::Default,
                vec![CGEventType::OtherMouseDown, CGEventType::OtherMouseUp],
                move |_, kind, event| on_event(&app, kind, event.get_integer_value_field(EventField::MOUSE_EVENT_BUTTON_NUMBER)),
            );
            let Ok(tap) = tap else {
                let _ = tx.send(false);
                return;
            };
            let port: &CFMachPort = tap.mach_port();
            PORT.store(port.as_concrete_TypeRef() as *mut c_void, Ordering::Relaxed);
            let Ok(source) = port.create_runloop_source(0) else {
                let _ = tx.send(false);
                return;
            };
            CFRunLoop::get_current().add_source(&source, unsafe { kCFRunLoopCommonModes });
            tap.enable();
            let _ = tx.send(true);
            CFRunLoop::run_current();
        });
        let running = rx.recv().unwrap_or(false);
        RUNNING.store(running, Ordering::Relaxed);
        running
    }

    fn on_event(app: &AppHandle, kind: CGEventType, button_field: i64) -> CallbackResult {
        // macOS switches a tap off if it ever stalls; switch it straight back on.
        if matches!(kind, CGEventType::TapDisabledByTimeout | CGEventType::TapDisabledByUserInput) {
            let port = PORT.load(Ordering::Relaxed);
            if !port.is_null() {
                unsafe { CGEventTapEnable(port as CFMachPortRef, true) };
            }
            return CallbackResult::Keep;
        }
        let pressed = matches!(kind, CGEventType::OtherMouseDown);
        let button = button_field + 1; // CoreGraphics counts from 0
        if button < 3 {
            return CallbackResult::Keep;
        }
        if RECORDING.load(Ordering::Relaxed) {
            if pressed {
                RECORDING.store(false, Ordering::Relaxed);
                let _ = app.emit("hotkey://mouse", format!("Mouse{button}"));
            }
            return CallbackResult::Drop;
        }
        let handle = app.clone();
        if button == WHEEL_BUTTON.load(Ordering::Relaxed) {
            let _ = app.run_on_main_thread(move || crate::on_trigger(&handle, pressed));
        } else if button == PROFILE_BUTTON.load(Ordering::Relaxed) {
            let _ = app.run_on_main_thread(move || crate::on_profile_trigger(&handle, pressed));
        } else {
            return CallbackResult::Keep;
        }
        // Swallow it so the button doesn't also do "Back" in the browser.
        CallbackResult::Drop
    }
}
