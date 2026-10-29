// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Nonaktifkan compositing mode WebKitGTK di Linux agar transparansi kanal alpha bekerja sempurna di Wayland/Hyprland
    #[cfg(target_os = "linux")]
    unsafe {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

    optihabit_lib::run()
}
