use gtk::glib::translate::ToGlibPtr;
use gtk::prelude::*;
use std::sync::Mutex;
use tauri::WebviewWindow;

pub mod ffi {
    use gtk::ffi::GtkWindow;
    use std::os::raw::{c_char, c_int};

    pub const LAYER_OVERLAY: c_int = 3;
    pub const EDGE_TOP: c_int = 2;
    pub const KEYBOARD_NONE: c_int = 0;

    #[link(name = "gtk-layer-shell")]
    unsafe extern "C" {
        pub fn gtk_layer_is_supported() -> c_int;
        pub fn gtk_layer_init_for_window(window: *mut GtkWindow);
        pub fn gtk_layer_set_namespace(window: *mut GtkWindow, name_space: *const c_char);
        pub fn gtk_layer_set_layer(window: *mut GtkWindow, layer: c_int);
        pub fn gtk_layer_set_anchor(window: *mut GtkWindow, edge: c_int, anchor: c_int);
        pub fn gtk_layer_set_margin(window: *mut GtkWindow, edge: c_int, margin: c_int);
        pub fn gtk_layer_set_exclusive_zone(window: *mut GtkWindow, zone: c_int);
        pub fn gtk_layer_set_keyboard_mode(window: *mut GtkWindow, mode: c_int);
    }
}

type Rect = (f64, f64, f64, f64);
static CURRENT_BOUNDS: Mutex<Rect> = Mutex::new((105.0, 0.0, 220.0, 42.0));

pub fn setup_layer_shell(win: &WebviewWindow) -> bool {
    let Ok(gw) = win.gtk_window() else {
        return false;
    };

    let supported = unsafe { ffi::gtk_layer_is_supported() } != 0;
    if !supported {
        eprintln!("[notchpulse] gtk-layer-shell is not supported by compositor");
        return false;
    }
    if gw.is_realized() {
        eprintln!("[notchpulse] GTK window already realized, cannot init layer-shell");
        return false;
    }

    gw.set_accept_focus(false);
    gw.set_focus_on_map(false);
    gw.set_titlebar(None::<&gtk::Widget>);
    let w: &gtk::Window = gw.upcast_ref();
    let ptr = w.to_glib_none().0;

    unsafe {
        ffi::gtk_layer_init_for_window(ptr);
        ffi::gtk_layer_set_namespace(ptr, b"notchpulse\0".as_ptr() as *const _);
        ffi::gtk_layer_set_layer(ptr, ffi::LAYER_OVERLAY);
        ffi::gtk_layer_set_anchor(ptr, ffi::EDGE_TOP, 1);
        ffi::gtk_layer_set_margin(ptr, ffi::EDGE_TOP, 0);
        ffi::gtk_layer_set_exclusive_zone(ptr, -1);
        ffi::gtk_layer_set_keyboard_mode(ptr, ffi::KEYBOARD_NONE);
    }

    let remapped = std::cell::Cell::new(false);
    gw.connect_map_event(move |w, _| {
        let (x, y, width, height) = *CURRENT_BOUNDS.lock().unwrap();
        apply_region(w, x, y, width, height);

        if !remapped.replace(true) {
            let w = w.clone();
            gtk::glib::idle_add_local_once(move || {
                w.hide();
                w.show_all();
                let (x, y, width, height) = *CURRENT_BOUNDS.lock().unwrap();
                apply_region(&w, x, y, width, height);
            });
        }
        gtk::glib::Propagation::Proceed
    });

    println!("[notchpulse] Initialized Wayland layer-shell OVERLAY surface");
    true
}

fn apply_region(gw: &impl IsA<gtk::Widget>, x: f64, y: f64, width: f64, height: f64) {
    if width >= 300.0 {
        gw.input_shape_combine_region(None);
        if let Some(gdk_window) = gw.window() {
            let full_region = gtk::cairo::Region::create_rectangle(&gtk::cairo::RectangleInt::new(
                0,
                0,
                460,
                280,
            ));
            gdk_window.input_shape_combine_region(&full_region, 0, 0);
        }
        return;
    }
    if let Some(gdk_window) = gw.window() {
        let region = gtk::cairo::Region::create_rectangle(&gtk::cairo::RectangleInt::new(
            x.floor() as i32,
            y.floor() as i32,
            width.ceil().max(1.0) as i32,
            height.ceil().max(1.0) as i32,
        ));
        gdk_window.input_shape_combine_region(&region, 0, 0);
    }
}

pub fn update_input_region(win: &WebviewWindow, x: f64, y: f64, width: f64, height: f64) {
    *CURRENT_BOUNDS.lock().unwrap() = (x, y, width, height);
    if let Ok(gw) = win.gtk_window() {
        apply_region(&gw, x, y, width, height);
    }
}

#[tauri::command]
pub fn update_notch_bounds(win: WebviewWindow, x: f64, y: f64, width: f64, height: f64) {
    let win_clone = win.clone();
    let _ = win.run_on_main_thread(move || {
        update_input_region(&win_clone, x, y, width, height);
    });
}
