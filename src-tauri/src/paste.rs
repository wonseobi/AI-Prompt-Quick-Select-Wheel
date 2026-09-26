//! Clipboard-safe pasting: stash the user's clipboard, paste the prompt with a
//! simulated Cmd/Ctrl+V into whatever app has focus, then put the clipboard back.

use arboard::{Clipboard, ImageData};
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::{sync::mpsc, thread, time::Duration};
use tauri::AppHandle;

/// Time for focus to return to the previous app after the wheel hides.
const FOCUS_DELAY: Duration = Duration::from_millis(120);
/// Time for the target app to read the clipboard before we restore it.
const RESTORE_DELAY: Duration = Duration::from_millis(400);

enum Saved {
    Text(String),
    Image(ImageData<'static>),
    Nothing,
}

fn snapshot(cb: &mut Clipboard) -> Saved {
    if let Ok(text) = cb.get_text() {
        return Saved::Text(text);
    }
    if let Ok(img) = cb.get_image() {
        return Saved::Image(img);
    }
    Saved::Nothing
}

fn restore(cb: &mut Clipboard, saved: Saved) {
    let _ = match saved {
        Saved::Text(text) => cb.set_text(text),
        Saved::Image(img) => cb.set_image(img),
        Saved::Nothing => cb.clear(),
    };
}

fn send_paste_keys() -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    let modifier = if cfg!(target_os = "macos") { Key::Meta } else { Key::Control };
    enigo.key(modifier, Direction::Press).map_err(|e| e.to_string())?;
    let result = enigo.key(Key::Unicode('v'), Direction::Click);
    enigo.key(modifier, Direction::Release).map_err(|e| e.to_string())?;
    result.map_err(|e| e.to_string())
}

pub fn paste_text(app: AppHandle, text: String) {
    thread::spawn(move || {
        let mut cb = match Clipboard::new() {
            Ok(cb) => cb,
            Err(err) => return eprintln!("clipboard unavailable: {err}"),
        };
        let saved = snapshot(&mut cb);
        if let Err(err) = cb.set_text(text.clone()) {
            return eprintln!("couldn't set clipboard: {err}");
        }

        thread::sleep(FOCUS_DELAY);

        // macOS keyboard-layout lookups must run on the main thread.
        let (tx, rx) = mpsc::channel();
        let _ = app.run_on_main_thread(move || {
            let _ = tx.send(send_paste_keys());
        });
        if let Ok(Err(err)) = rx.recv() {
            eprintln!("paste failed: {err}");
        }

        thread::sleep(RESTORE_DELAY);
        // Only restore if nothing else replaced our prompt in the meantime.
        if cb.get_text().ok().as_deref() == Some(text.as_str()) {
            restore(&mut cb, saved);
        }
    });
}

/// Whether the OS lets us simulate the paste keystroke.
#[cfg(target_os = "macos")]
pub fn has_input_permission() -> bool {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }
    unsafe { AXIsProcessTrusted() }
}

#[cfg(not(target_os = "macos"))]
pub fn has_input_permission() -> bool {
    true
}
