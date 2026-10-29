use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AlertType {
    Idle,
    Blink,
    Phone,
    Hydration,
    ScreenTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HabitEventPayload {
    pub alert_type: AlertType,
    pub title: String,
    pub message: String,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetrySnapshot {
    pub focus_score: u32,
    pub blink_rate: u32,
    pub screen_time_minutes: u32,
    pub hydration_count: u32,
    pub phone_distraction_seconds: u32,
    pub current_alert: AlertType,
}

// Bounding box deteksi objek
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct BoundingBox {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[allow(dead_code)]
impl BoundingBox {
    pub fn intersects(&self, other: &BoundingBox) -> bool {
        let x_overlap = (self.x.max(other.x)) < (self.x + self.width).min(other.x + other.width);
        let y_overlap = (self.y.max(other.y)) < (self.y + self.height).min(other.y + other.height);
        x_overlap && y_overlap
    }
}

// Kalkulasi Eye Aspect Ratio (EAR) dari 6 landmark mata (Soukupová & Čech formula)
// p1: sudut luar mata, p4: sudut dalam mata, p2, p3, p5, p6: kelopak atas/bawah
#[allow(dead_code)]
pub fn calculate_ear(points: &[(f32, f32); 6]) -> f32 {
    let dist = |p1: (f32, f32), p2: (f32, f32)| -> f32 {
        ((p1.0 - p2.0).powi(2) + (p1.1 - p2.1).powi(2)).sqrt()
    };
    let v1 = dist(points[1], points[5]);
    let v2 = dist(points[2], points[4]);
    let h = dist(points[0], points[3]);
    if h == 0.0 {
        return 0.0;
    }
    (v1 + v2) / (2.0 * h)
}

#[path = "vision_tests.rs"]
#[cfg(test)]
mod vision_tests;

// Heuristik State Machine Penglihatan Komputer
pub struct VisionPipelineEngine {
    pub last_blink_check_sec: u64,
    pub current_blinks_window: u32,
    pub phone_detected_consecutive_sec: u32,
    pub screen_time_continuous_sec: u32,
    pub last_hydration_sec: u64,
    pub hydration_counter: u32,
}

impl VisionPipelineEngine {
    pub fn new() -> Self {
        Self {
            last_blink_check_sec: 0,
            current_blinks_window: 16,
            phone_detected_consecutive_sec: 0,
            screen_time_continuous_sec: 0,
            last_hydration_sec: 0,
            hydration_counter: 0,
        }
    }

    // Evaluasi 1 detik frame cycle
    pub fn process_tick(
        &mut self,
        elapsed_sec: u64,
        is_user_present: bool,
        phone_in_frame: bool,
        drinking_gesture: bool,
        ear_avg: f32,
    ) -> Option<HabitEventPayload> {
        if !is_user_present {
            self.screen_time_continuous_sec = 0;
            self.phone_detected_consecutive_sec = 0;
            return None;
        }

        self.screen_time_continuous_sec += 1;

        // 1. Deteksi Gestur Minum (Botol/Gelas overlap landmark mulut)
        if drinking_gesture {
            self.hydration_counter += 1;
            self.last_hydration_sec = elapsed_sec;
            return Some(HabitEventPayload {
                alert_type: AlertType::Hydration,
                title: "Hidrasi Tercatat".into(),
                message: format!("Asupan air ke-{} hari ini", self.hydration_counter),
                timestamp_ms: elapsed_sec * 1000,
            });
        }

        // 2. Deteksi Distraksi Ponsel (>5 detik terus menerus)
        if phone_in_frame {
            self.phone_detected_consecutive_sec += 1;
            if self.phone_detected_consecutive_sec >= 5 {
                return Some(HabitEventPayload {
                    alert_type: AlertType::Phone,
                    title: "Distraksi Ponsel".into(),
                    message: format!("HP terdeteksi ({}s)", self.phone_detected_consecutive_sec),
                    timestamp_ms: elapsed_sec * 1000,
                });
            }
        } else {
            self.phone_detected_consecutive_sec = 0;
        }

        // 3. Deteksi Kelelahan Mata / Kurang Berkedip (EAR < 0.20 menunjukkan mata tertutup/berkedip)
        if ear_avg < 0.20 {
            self.current_blinks_window += 1;
        }

        // Evaluasi frekuensi kedip setiap periode 60s
        if elapsed_sec.saturating_sub(self.last_blink_check_sec) >= 60 {
            self.last_blink_check_sec = elapsed_sec;
            if self.current_blinks_window < 10 {
                self.current_blinks_window = 12; // reset
                return Some(HabitEventPayload {
                    alert_type: AlertType::Blink,
                    title: "Mata Kering".into(),
                    message: "Kedipkan mata sejenak".into(),
                    timestamp_ms: elapsed_sec * 1000,
                });
            }
            self.current_blinks_window = 0;
        }

        // 4. Deteksi Batas Screen Time (Aturan 20-20-20: 20 menit = 1200 detik)
        if self.screen_time_continuous_sec >= 1200 {
            self.screen_time_continuous_sec = 0;
            return Some(HabitEventPayload {
                alert_type: AlertType::ScreenTime,
                title: "Aturan 20-20-20".into(),
                message: "Pandang jarak 6m selama 20 detik".into(),
                timestamp_ms: elapsed_sec * 1000,
            });
        }

        // 5. Pengingat Minum Berkala (>60 menit tanpa hidrasi)
        if self.last_hydration_sec > 0 && elapsed_sec.saturating_sub(self.last_hydration_sec) >= 3600 {
            self.last_hydration_sec = elapsed_sec;
            return Some(HabitEventPayload {
                alert_type: AlertType::Hydration,
                title: "Waktunya Minum".into(),
                message: "Sudah 1 jam tanpa asupan air".into(),
                timestamp_ms: elapsed_sec * 1000,
            });
        }

        None
    }
}
