mod vision_engine;
mod db;

use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use vision_engine::{AlertType, HabitEventPayload, TelemetrySnapshot, VisionPipelineEngine};
use db::DatabaseManager;

pub struct AppState {
    pub engine: Mutex<VisionPipelineEngine>,
    pub telemetry: Mutex<TelemetrySnapshot>,
    pub db: Mutex<DatabaseManager>,
}

#[tauri::command]
fn get_current_telemetry(state: State<'_, Arc<AppState>>) -> TelemetrySnapshot {
    state.telemetry.lock().unwrap().clone()
}

#[tauri::command]
fn simulate_vision_trigger(
    trigger_type: String,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<String, String> {
    let mut tel = state.telemetry.lock().unwrap();
    let alert = match trigger_type.as_str() {
        "blink" => {
            tel.blink_rate = 8;
            tel.current_alert = AlertType::Blink;
            HabitEventPayload {
                alert_type: AlertType::Blink,
                title: "Mata Kering".into(),
                message: "Kedipkan mata sejenak".into(),
                timestamp_ms: 1000,
            }
        }
        "phone" => {
            tel.phone_distraction_seconds += 10;
            tel.current_alert = AlertType::Phone;
            HabitEventPayload {
                alert_type: AlertType::Phone,
                title: "Distraksi HP".into(),
                message: "Ponsel terdeteksi di depan wajah".into(),
                timestamp_ms: 1000,
            }
        }
        "hydration" => {
            tel.hydration_count += 1;
            tel.current_alert = AlertType::Hydration;
            HabitEventPayload {
                alert_type: AlertType::Hydration,
                title: "Hidrasi Tercatat".into(),
                message: "1 gelas air diminum".into(),
                timestamp_ms: 1000,
            }
        }
        "screentime" => {
            tel.screen_time_minutes = 20;
            tel.current_alert = AlertType::ScreenTime;
            HabitEventPayload {
                alert_type: AlertType::ScreenTime,
                title: "Aturan 20-20-20".into(),
                message: "Istirahatkan mata ke titik jauh".into(),
                timestamp_ms: 1000,
            }
        }
        _ => {
            tel.current_alert = AlertType::Idle;
            HabitEventPayload {
                alert_type: AlertType::Idle,
                title: "Normal".into(),
                message: "Fokus kerja optimal".into(),
                timestamp_ms: 1000,
            }
        }
    };

    let _ = app.emit("optihabit://event", &alert);
    let _ = app.emit("optihabit://telemetry", &*tel);

    if let Ok(db) = state.db.lock() {
        let _ = db.log_event(None, &trigger_type, 0, &alert.message);
        let _ = db.upsert_daily_metrics("2026-10-29", 1, if trigger_type == "phone" { 10 } else { 0 }, if trigger_type == "hydration" { 1 } else { 0 }, if trigger_type == "blink" { 1 } else { 0 });
    }

    Ok(format!("Trigger {} sukses", trigger_type))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_manager = DatabaseManager::new_in_memory().expect("Gagal inisialisasi basis data");

    let shared_state = Arc::new(AppState {
        engine: Mutex::new(VisionPipelineEngine::new()),
        telemetry: Mutex::new(TelemetrySnapshot {
            focus_score: 95,
            blink_rate: 16,
            screen_time_minutes: 25,
            hydration_count: 2,
            phone_distraction_seconds: 10,
            current_alert: AlertType::Idle,
        }),
        db: Mutex::new(db_manager),
    });

    let state_clone = Arc::clone(&shared_state);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(shared_state)
        .invoke_handler(tauri::generate_handler![
            get_current_telemetry,
            simulate_vision_trigger
        ])
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("island") {
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let screen_size = monitor.size();
                    let scale_factor = monitor.scale_factor();
                    let win_w = (430.0 * scale_factor) as i32;
                    let x = ((screen_size.width as i32) - win_w) / 2;
                    let y = 0;
                    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
                }
            }

            let handle = app.handle().clone();
            let bg_state = Arc::clone(&state_clone);

            std::thread::spawn(move || {
                let mut ticker = 0u64;
                loop {
                    std::thread::sleep(Duration::from_secs(1));
                    ticker += 1;

                    let mut engine = bg_state.engine.lock().unwrap();
                    let maybe_event = engine.process_tick(ticker, true, false, false, 0.28);

                    if let Some(event) = maybe_event {
                        let _ = handle.emit("optihabit://event", &event);
                        if let Ok(db) = bg_state.db.lock() {
                            let _ = db.log_event(None, &format!("{:?}", event.alert_type), 0, &event.message);
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
