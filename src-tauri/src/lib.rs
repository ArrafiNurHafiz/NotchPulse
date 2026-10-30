mod vision_engine;
mod adaptive_thresholds;
mod decision_engine;
mod db;
mod layer_shell;

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

#[derive(serde::Deserialize, Default)]
struct VisionSnapshot {
    #[serde(default)]
    presence: bool,
    #[serde(default)]
    blink_rate: u32,
    #[serde(default)]
    screen_time_seconds: u64,
    #[serde(default)]
    hydration_count: u32,
    #[serde(default)]
    last_hydration_sec_ago: i64,
    #[serde(default)]
    phone_detected: bool,
    #[serde(default)]
    phone_distraction_seconds: u32,
    #[serde(default = "default_100")]
    focus_score: u32,
    #[serde(default = "default_idle")]
    current_alert: String,
    #[serde(default)]
    alert_message: String,
    #[serde(default = "default_info")]
    severity: String,
    #[serde(default = "default_idle")]
    context_activity: String,
}
fn default_100() -> u32 {
    100
}
fn default_idle() -> String {
    "idle".into()
}
fn default_info() -> String {
    "info".into()
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

#[tauri::command]
fn log_water_intake(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<u32, String> {
    let mut tel = state.telemetry.lock().map_err(|e| e.to_string())?;
    tel.hydration_count += 1;
    let new_count = tel.hydration_count;

    if let Ok(db) = state.db.lock() {
        let _ = db.add_hydration_log("2026-10-30");
        let _ = db.log_event(None, "hydration_quick_action", 0, "{\"source\": \"notch_button\"}");
    }

    let alert = HabitEventPayload {
        alert_type: AlertType::Hydration,
        title: "Segar! 💧".into(),
        message: format!("Gelas ke-{} tercatat. Tetap terhidrasi!", new_count),
        timestamp_ms: 1000,
    };

    let _ = app.emit("optihabit://event", &alert);
    let _ = app.emit("optihabit://telemetry", &*tel);

    Ok(new_count)
}

#[tauri::command]
fn log_mascot_poke(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    if let Ok(db) = state.db.lock() {
        let _ = db.log_mascot_interaction();
    }
    Ok(())
}

#[tauri::command]
fn log_break_done(duration_sec: i32, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    if let Ok(db) = state.db.lock() {
        let _ = db.log_break_completed(duration_sec);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_manager = DatabaseManager::new_in_memory().expect("Gagal inisialisasi basis data");
    
    // Inisialisasi baseline default untuk cold start
    if let Err(e) = db_manager.init_default_baselines() {
        eprintln!("Warn: Gagal inisialisasi baselines: {}", e);
    }

    let shared_state = Arc::new(AppState {
        engine: Mutex::new(VisionPipelineEngine::new()),
        telemetry: Mutex::new(TelemetrySnapshot {
            focus_score: 85,
            blink_rate: 12,
            screen_time_minutes: 20,
            hydration_count: 2,
            phone_distraction_seconds: 480,
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
            simulate_vision_trigger,
            log_water_intake,
            log_mascot_poke,
            log_break_done,
            layer_shell::update_notch_bounds
        ])
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("island") {
                layer_shell::setup_layer_shell(&window);
                let _ = window.show();
            }

            let handle = app.handle().clone();
            let bg_state = Arc::clone(&state_clone);

            // Vision daemon sudah running manually di background (PID eksternal)
            // Backend hanya membaca telemetry JSON file yang diupdate oleh daemon
            // Skip auto-spawn untuk hindari camera lock conflict

            std::thread::spawn(move || {
                let mut ticker = 0u64;
                let vision_file = "/home/arrafi/.hermes/cache/scratch/notchpulse_vision.json";

                loop {
                    std::thread::sleep(Duration::from_millis(500));
                    ticker += 1;

                    // AUTO-SIMULATE phone alert every 30 ticks (15 seconds) for testing
                    if ticker % 30 == 0 {
                        let auto_alert = HabitEventPayload {
                            alert_type: AlertType::Phone,
                            title: "NotchPulse Auto-Test".into(),
                            message: "HP terdeteksi (auto-simulated)".into(),
                            timestamp_ms: ticker * 500,
                        };
                        let _ = handle.emit("optihabit://event", &auto_alert);
                        if let Some(win) = handle.get_webview_window("island") {
                            let _ = win.emit("optihabit://event", &auto_alert);
                        }
                    }

                    // Baca snapshot telemetri riil dari vision_daemon
                    if let Ok(content) = std::fs::read_to_string(vision_file) {
                        if let Ok(snap) = serde_json::from_str::<VisionSnapshot>(&content) {
                            {
                                let mut tel = bg_state.telemetry.lock().unwrap();
                                tel.focus_score = snap.focus_score;
                                tel.blink_rate = snap.blink_rate;
                                tel.screen_time_minutes = (snap.screen_time_seconds / 60) as u32;
                                tel.hydration_count = snap.hydration_count;
                                tel.phone_distraction_seconds = snap.phone_distraction_seconds;
                                let _ = handle.emit("optihabit://telemetry", &*tel);
                            }

                            if snap.current_alert != "idle" {
                                let event = HabitEventPayload {
                                    alert_type: match snap.current_alert.as_str() {
                                        "phone" => AlertType::Phone,
                                        "blink" => AlertType::Blink,
                                        "screentime" => AlertType::ScreenTime,
                                        "hydration" => AlertType::Hydration,
                                        _ => AlertType::Idle,
                                    },
                                    title: "NotchPulse Alert".into(),
                                    message: snap.alert_message.clone(),
                                    timestamp_ms: snap.screen_time_seconds * 1000,
                                };
                                let _ = handle.emit("optihabit://event", &event);
                            } else {
                                let event = HabitEventPayload {
                                    alert_type: AlertType::Idle,
                                    title: "Optimal".into(),
                                    message: "Fokus Optimal".into(),
                                    timestamp_ms: snap.screen_time_seconds * 1000,
                                };
                                let _ = handle.emit("optihabit://event", &event);
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                // Menjaga window overlay tetap persisten di background
                api.prevent_exit();
            }
        });
}

#[cfg(test)]
mod e2e_scenarios {
    use super::decision_engine::{DecisionEngine, AlertType, Severity};
    use super::adaptive_thresholds::ActivityType;

    #[test]
    fn test_scenario_normal_work_session() {
        let mut engine = DecisionEngine::new();
        let now = 1000000i64;

        let alert_phone = engine.evaluate_phone_distraction(0.0, ActivityType::Work, now);
        let alert_blink = engine.evaluate_blink_fatigue(15.0, 1800, ActivityType::Work, now);
        let alert_screen = engine.evaluate_screen_time(30.0, ActivityType::Work, now);
        let alert_hydration = engine.evaluate_hydration(30.0, now);

        assert!(alert_phone.is_none(), "Normal session should not trigger phone alert");
        assert!(alert_blink.is_none(), "Normal blink rate should not trigger fatigue alert");
        assert!(alert_screen.is_none(), "30 min screen time is within limits");
        assert!(alert_hydration.is_none(), "30 min hydration is within limits");
    }

    #[test]
    fn test_scenario_fatigue_detection() {
        let mut engine = DecisionEngine::new();
        let now = 1000000i64;

        let alert_blink = engine.evaluate_blink_fatigue(4.0, 2700, ActivityType::Work, now);
        assert!(alert_blink.is_some(), "Fatigue should trigger blink alert");
        let decision = alert_blink.unwrap();
        assert_eq!(decision.severity, Severity::Critical);
        assert_eq!(decision.alert_type, AlertType::Blink);
    }

    #[test]
    fn test_scenario_phone_distraction() {
        let mut engine = DecisionEngine::new();
        let now = 1000000i64;

        let alert = engine.evaluate_phone_distraction(35.0, ActivityType::Work, now);
        assert!(alert.is_some(), "35s phone should trigger alert");
    }

    #[test]
    fn test_scenario_hydration_reminder() {
        let mut engine = DecisionEngine::new();
        let now = 1000000i64;

        let alert = engine.evaluate_hydration(100.0, now);
        assert!(alert.is_some(), "100 mins without water should trigger alert");
        let decision = alert.unwrap();
        assert_eq!(decision.alert_type, AlertType::Hydration);
    }
}
