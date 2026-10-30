use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use crate::adaptive_thresholds::{ActivityType, AdaptiveThresholdEngine};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AlertType {
    Phone,
    Blink,
    ScreenTime,
    Hydration,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertDecision {
    pub alert_type: AlertType,
    pub severity: Severity,
    pub message: String,
    pub reasoning: String,
}

pub struct DecisionEngine {
    pub adaptive_thresholds: AdaptiveThresholdEngine,
    last_alert_times: HashMap<AlertType, i64>,
    cooldown_warning: i64,  // 5 menit untuk warning
    cooldown_critical: i64, // 10 menit untuk critical
}

impl DecisionEngine {
    pub fn new() -> Self {
        Self {
            adaptive_thresholds: AdaptiveThresholdEngine::new(),
            last_alert_times: HashMap::new(),
            cooldown_warning: 300,   // 5 menit
            cooldown_critical: 600,  // 10 menit
        }
    }

    fn in_cooldown(&self, alert_type: AlertType, severity: &Severity, now: i64) -> bool {
        if let Some(&last_time) = self.last_alert_times.get(&alert_type) {
            let cooldown = match severity {
                Severity::Warning => self.cooldown_warning,
                Severity::Critical => self.cooldown_critical,
                Severity::Info => 0,
            };
            (now - last_time) < cooldown
        } else {
            false
        }
    }

    fn update_alert_time(&mut self, alert_type: AlertType, now: i64) {
        self.last_alert_times.insert(alert_type, now);
    }

    // Evaluasi distraksi HP dengan baseline adaptif
    pub fn evaluate_phone_distraction(
        &mut self,
        phone_duration_sec: f64,
        context: ActivityType,
        now: i64,
    ) -> Option<AlertDecision> {
        let (warn_threshold, crit_threshold) = self.adaptive_thresholds.get_phone_thresholds(context);

        let decision = if phone_duration_sec >= crit_threshold {
            Some(AlertDecision {
                alert_type: AlertType::Phone,
                severity: Severity::Critical,
                message: "HP terlalu lama! Produktivitas menurun.".to_string(),
                reasoning: format!(
                    "Context: {:?} | Baseline: {:.1}s ± {:.1}s | Current: {:.1}s | Threshold critical: {:.1}s",
                    context,
                    self.adaptive_thresholds.phone_baseline.mean,
                    self.adaptive_thresholds.phone_baseline.stddev,
                    phone_duration_sec,
                    crit_threshold
                ),
            })
        } else if phone_duration_sec >= warn_threshold {
            Some(AlertDecision {
                alert_type: AlertType::Phone,
                severity: Severity::Warning,
                message: "HP terdeteksi. Cek notifikasi sebentar lalu fokus.".to_string(),
                reasoning: format!(
                    "Context: {:?} | Baseline: {:.1}s ± {:.1}s | Current: {:.1}s | Threshold warning: {:.1}s",
                    context,
                    self.adaptive_thresholds.phone_baseline.mean,
                    self.adaptive_thresholds.phone_baseline.stddev,
                    phone_duration_sec,
                    warn_threshold
                ),
            })
        } else {
            None
        };

        if let Some(ref d) = decision {
            if self.in_cooldown(AlertType::Phone, &d.severity, now) {
                return None;
            }
            self.update_alert_time(AlertType::Phone, now);
        }

        decision
    }

    // Evaluasi kelelahan mata (blink rate)
    pub fn evaluate_blink_fatigue(
        &mut self,
        blink_rate: f64,
        screen_time_sec: i64,
        context: ActivityType,
        now: i64,
    ) -> Option<AlertDecision> {
        // Skip jika screen time < 2 menit atau sedang break
        if screen_time_sec < 120 || matches!(context, ActivityType::Break) {
            return None;
        }

        let (warn_threshold, crit_threshold) = self.adaptive_thresholds.get_blink_thresholds(context);

        let decision = if warn_threshold > 0.0 && blink_rate < crit_threshold {
            Some(AlertDecision {
                alert_type: AlertType::Blink,
                severity: Severity::Critical,
                message: "Mata sangat lelah! Istirahat 20 detik sekarang.".to_string(),
                reasoning: format!(
                    "Context: {:?} | Baseline: {:.1}/min ± {:.1} | Current: {:.1}/min | Threshold critical: {:.1}/min (drop {:.0}%)",
                    context,
                    self.adaptive_thresholds.blink_baseline.mean,
                    self.adaptive_thresholds.blink_baseline.stddev,
                    blink_rate,
                    crit_threshold,
                    ((self.adaptive_thresholds.blink_baseline.mean - blink_rate) / self.adaptive_thresholds.blink_baseline.mean) * 100.0
                ),
            })
        } else if warn_threshold > 0.0 && blink_rate < warn_threshold {
            Some(AlertDecision {
                alert_type: AlertType::Blink,
                severity: Severity::Warning,
                message: "Mata mulai lelah. Berkedip lebih banyak.".to_string(),
                reasoning: format!(
                    "Context: {:?} | Baseline: {:.1}/min | Current: {:.1}/min | Threshold warning: {:.1}/min (drop {:.0}%)",
                    context,
                    self.adaptive_thresholds.blink_baseline.mean,
                    blink_rate,
                    warn_threshold,
                    ((self.adaptive_thresholds.blink_baseline.mean - blink_rate) / self.adaptive_thresholds.blink_baseline.mean) * 100.0
                ),
            })
        } else {
            None
        };

        if let Some(ref d) = decision {
            if self.in_cooldown(AlertType::Blink, &d.severity, now) {
                return None;
            }
            self.update_alert_time(AlertType::Blink, now);
        }

        decision
    }

    // Evaluasi waktu layar
    pub fn evaluate_screen_time(
        &mut self,
        screen_time_min: f64,
        context: ActivityType,
        now: i64,
    ) -> Option<AlertDecision> {
        let (warn_threshold, crit_threshold) = self.adaptive_thresholds.get_screen_time_thresholds(context);

        let decision = if screen_time_min >= crit_threshold {
            Some(AlertDecision {
                alert_type: AlertType::ScreenTime,
                severity: Severity::Critical,
                message: "1 jam layar! Istirahat 20 detik jauh dari layar.".to_string(),
                reasoning: format!(
                    "Context: {:?} | Baseline: {:.1}min ± {:.1} | Current: {:.1}min | Threshold critical: {:.1}min",
                    context,
                    self.adaptive_thresholds.screen_baseline.mean,
                    self.adaptive_thresholds.screen_baseline.stddev,
                    screen_time_min,
                    crit_threshold
                ),
            })
        } else if screen_time_min >= warn_threshold {
            Some(AlertDecision {
                alert_type: AlertType::ScreenTime,
                severity: Severity::Warning,
                message: "45 menit layar. Rencanakan break 20 detik.".to_string(),
                reasoning: format!(
                    "Context: {:?} | Baseline: {:.1}min | Current: {:.1}min | Threshold warning: {:.1}min",
                    context,
                    self.adaptive_thresholds.screen_baseline.mean,
                    screen_time_min,
                    warn_threshold
                ),
            })
        } else {
            None
        };

        if let Some(ref d) = decision {
            if self.in_cooldown(AlertType::ScreenTime, &d.severity, now) {
                return None;
            }
            self.update_alert_time(AlertType::ScreenTime, now);
        }

        decision
    }

    // Evaluasi hidrasi
    pub fn evaluate_hydration(
        &mut self,
        last_hydration_min: f64,
        now: i64,
    ) -> Option<AlertDecision> {
        let baseline_min = self.adaptive_thresholds.hydration_baseline.mean;
        let warn_threshold = baseline_min + 15.0;
        let crit_threshold = baseline_min + 30.0;

        let decision = if last_hydration_min >= crit_threshold {
            Some(AlertDecision {
                alert_type: AlertType::Hydration,
                severity: Severity::Critical,
                message: "Sudah lama tidak minum! Minum air sekarang.".to_string(),
                reasoning: format!(
                    "Baseline: {:.1}min | Last drink: {:.1}min ago | Threshold critical: {:.1}min",
                    baseline_min,
                    last_hydration_min,
                    crit_threshold
                ),
            })
        } else if last_hydration_min >= warn_threshold {
            Some(AlertDecision {
                alert_type: AlertType::Hydration,
                severity: Severity::Warning,
                message: "Jangan lupa minum air ya!".to_string(),
                reasoning: format!(
                    "Baseline: {:.1}min | Last drink: {:.1}min ago | Threshold warning: {:.1}min",
                    baseline_min,
                    last_hydration_min,
                    warn_threshold
                ),
            })
        } else {
            None
        };

        if let Some(ref d) = decision {
            if self.in_cooldown(AlertType::Hydration, &d.severity, now) {
                return None;
            }
            self.update_alert_time(AlertType::Hydration, now);
        }

        decision
    }

    // Priority & Deduplication: return highest severity dari multiple alerts
    pub fn select_highest_priority(&self, alerts: Vec<AlertDecision>) -> Option<AlertDecision> {
        alerts.into_iter().max_by_key(|a| match a.severity {
            Severity::Critical => 3,
            Severity::Warning => 2,
            Severity::Info => 1,
        })
    }
}

#[cfg(test)]
#[path = "decision_tests.rs"]
mod decision_tests;
