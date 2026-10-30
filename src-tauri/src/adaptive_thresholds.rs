use std::collections::VecDeque;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActivityType {
    Work,
    Meeting,
    Leisure,
    Break,
    Idle,
}

impl Default for ActivityType {
    fn default() -> Self {
        ActivityType::Idle
    }
}

impl From<&str> for ActivityType {
    fn from(s: &str) -> Self {
        match s {
            "work" => ActivityType::Work,
            "meeting" => ActivityType::Meeting,
            "leisure" => ActivityType::Leisure,
            "break" => ActivityType::Break,
            _ => ActivityType::Idle,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollingStats {
    // Sampel (timestamp_unix, value)
    pub samples: VecDeque<(i64, f64)>,
    pub mean: f64,
    pub stddev: f64,
    pub min_samples_for_adaptive: usize,
}

impl RollingStats {
    pub fn new(default_mean: f64, default_stddev: f64) -> Self {
        Self {
            samples: VecDeque::new(),
            mean: default_mean,
            stddev: default_stddev,
            min_samples_for_adaptive: 10,
        }
    }

    pub fn add_sample(&mut self, now_unix: i64, value: f64) {
        self.samples.push_back((now_unix, value));

        // Buang data lebih dari 7 hari (7 * 86400 detik)
        let cutoff = now_unix - (7 * 86400);
        while let Some((ts, _)) = self.samples.front() {
            if *ts < cutoff {
                self.samples.pop_front();
            } else {
                break;
            }
        }

        self.recompute();
    }

    pub fn recompute(&mut self) {
        if self.samples.len() < self.min_samples_for_adaptive {
            return; // Gunakan baseline bawaan sampai sampel cukup
        }

        let n = self.samples.len() as f64;
        let sum: f64 = self.samples.iter().map(|(_, v)| *v).sum();
        let current_mean = sum / n;

        let variance: f64 = self.samples.iter().map(|(_, v)| (v - current_mean).powi(2)).sum::<f64>() / n;
        self.mean = current_mean;
        self.stddev = variance.sqrt().max(1.0); // Minimal standar deviasi 1.0 agar tidak flat
    }

    pub fn warning_threshold(&self, sigma_factor: f64) -> f64 {
        self.mean + (sigma_factor * self.stddev)
    }

    pub fn critical_threshold(&self, sigma_factor: f64) -> f64 {
        self.mean + (sigma_factor * self.stddev)
    }
}

pub struct AdaptiveThresholdEngine {
    pub phone_baseline: RollingStats,
    pub blink_baseline: RollingStats,
    pub screen_baseline: RollingStats,
    pub hydration_baseline: RollingStats,
}

impl AdaptiveThresholdEngine {
    pub fn new() -> Self {
        Self {
            // Default: HP check rerata 12 detik (stddev 4s)
            phone_baseline: RollingStats::new(12.0, 4.0),
            // Default: Kedipan normal rerata 14 kali/menit (stddev 3)
            blink_baseline: RollingStats::new(14.0, 3.0),
            // Default: Waktu layar kontinu 45 menit (stddev 15m)
            screen_baseline: RollingStats::new(45.0, 15.0),
            // Default: Jarak minum rerata 60 menit (stddev 15m)
            hydration_baseline: RollingStats::new(60.0, 15.0),
        }
    }

    // Ambang batas distraksi HP (detik): (warning_sec, critical_sec)
    pub fn get_phone_thresholds(&self, context: ActivityType) -> (f64, f64) {
        let base_warn = self.phone_baseline.warning_threshold(1.0).max(12.0);
        let base_crit = self.phone_baseline.critical_threshold(2.5).max(25.0);

        match context {
            ActivityType::Work => (base_warn * 1.5, base_crit * 1.5), // Kerja: toleransi 1.5x lebih sabar
            ActivityType::Meeting => (f64::INFINITY, f64::INFINITY),   // Meeting: matikan deteksi HP
            ActivityType::Leisure => (base_warn * 0.8, base_crit * 0.8), // Santai: lebih ketat
            ActivityType::Break => (f64::INFINITY, f64::INFINITY),     // Istirahat: matikan
            ActivityType::Idle => (base_warn, base_crit),
        }
    }

    // Ambang batas kelelahan kedipan mata: (warning_rate, critical_rate)
    pub fn get_blink_thresholds(&self, context: ActivityType) -> (f64, f64) {
        let mean = self.blink_baseline.mean;
        match context {
            ActivityType::Meeting => (mean * 0.5, mean * 0.3),
            ActivityType::Break => (0.0, 0.0),
            _ => (mean * 0.65, mean * 0.45), // Warning di bawah 65% baseline, critical < 45%
        }
    }

    // Ambang batas waktu layar (menit): (warning_min, critical_min)
    pub fn get_screen_time_thresholds(&self, context: ActivityType) -> (f64, f64) {
        let base_warn = self.screen_baseline.warning_threshold(1.0).max(35.0);
        let base_crit = self.screen_baseline.critical_threshold(2.0).max(55.0);

        match context {
            ActivityType::Work => (base_warn * 1.2, base_crit * 1.2),
            ActivityType::Meeting => (f64::INFINITY, f64::INFINITY),
            ActivityType::Break => (f64::INFINITY, f64::INFINITY),
            _ => (base_warn, base_crit),
        }
    }
}

#[cfg(test)]
#[path = "adaptive_tests.rs"]
mod adaptive_tests;
