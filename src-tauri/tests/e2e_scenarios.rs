// E2E Integration Test Suite for NotchPulse
// Simulates 4 core user scenarios:
// 1. Normal work session (no alerts)
// 2. Fatigue (low blink + long screen time)
// 3. Phone distraction (continuous usage)
// 4. Hydration neglect (long period without water)

use optihabit::decision_engine::{DecisionEngine, AlertType, Severity};
use optihabit::adaptive_thresholds::ActivityType;

#[test]
fn test_scenario_normal_work_session() {
    let mut engine = DecisionEngine::new();
    let mut now = 1000000i64;

    // Simulate 30 mins normal work: 15 blinks/min, screen 30m, phone 0s
    let alert_phone = engine.evaluate_phone_distraction(0.0, ActivityType::DeepWork, now);
    let alert_blink = engine.evaluate_blink_fatigue(15.0, 30.0, ActivityType::DeepWork, now);
    let alert_screen = engine.evaluate_screen_time(30.0, ActivityType::DeepWork, now);
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

    // Simulate 45 mins screen time + blink rate drops to 4/min (< 5/min critical)
    let alert_blink = engine.evaluate_blink_fatigue(4.0, 45.0, ActivityType::DeepWork, now);
    assert!(alert_blink.is_some(), "Fatigue should trigger blink alert");
    let decision = alert_blink.unwrap();
    assert_eq!(decision.severity, Severity::Critical);
    assert_eq!(decision.alert_type, AlertType::Blink);
    assert!(decision.reasoning.contains("Drop"), "Reasoning should explain blink drop");
}

#[test]
fn test_scenario_phone_distraction_escalation() {
    let mut engine = DecisionEngine::new();
    let now = 1000000i64;

    // Step 1: Phone used for 16s (warning range for deep work)
    let alert_warn = engine.evaluate_phone_distraction(25.0, ActivityType::DeepWork, now);
    assert!(alert_warn.is_some(), "25s phone in deep work should trigger warning");
    let decision_warn = alert_warn.unwrap();
    assert_eq!(decision_warn.severity, Severity::Warning);

    // Step 2: Cooldown suppresses alert at T+60s
    let alert_suppressed = engine.evaluate_phone_distraction(28.0, ActivityType::DeepWork, now + 60);
    assert!(alert_suppressed.is_none(), "Alert within 5-min cooldown should be suppressed");

    // Step 3: Critical threshold reached (50s phone) after critical escalation
    // Reset cooldown for test
    let mut engine_crit = DecisionEngine::new();
    let alert_crit = engine_crit.evaluate_phone_distraction(50.0, ActivityType::DeepWork, now);
    assert!(alert_crit.is_some(), "50s phone should trigger critical");
    let decision_crit = alert_crit.unwrap();
    assert_eq!(decision_crit.severity, Severity::Critical);
}

#[test]
fn test_scenario_hydration_reminder() {
    let mut engine = DecisionEngine::new();
    let now = 1000000i64;

    // Simulate 100 mins without water (exceeds 90 min critical baseline)
    let alert_hydration = engine.evaluate_hydration(100.0, now);
    assert!(alert_hydration.is_some(), "100 mins without water should trigger hydration alert");
    let decision = alert_hydration.unwrap();
    assert_eq!(decision.severity, Severity::Critical);
    assert_eq!(decision.alert_type, AlertType::Hydration);
}
