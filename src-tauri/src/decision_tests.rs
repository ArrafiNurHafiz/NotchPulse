use crate::decision_engine::{AlertDecision, AlertType, DecisionEngine, Severity};
use crate::adaptive_thresholds::ActivityType;

#[test]
fn test_phone_threshold_evaluation() {
    let mut engine = DecisionEngine::new();
    let now = 1000000i64;

    // Case 1: phone 10s < warn (12s baseline) → None
    let alert = engine.evaluate_phone_distraction(10.0, ActivityType::Idle, now);
    assert!(alert.is_none(), "10s should not trigger alert");

    // Case 2: phone 16s >= warn (12 + 1σ ≈ 16s) → Warning
    let alert = engine.evaluate_phone_distraction(16.0, ActivityType::Idle, now + 1);
    assert!(alert.is_some(), "16s should trigger alert");
    let decision = alert.unwrap();
    assert_eq!(decision.alert_type, AlertType::Phone);
    assert_eq!(decision.severity, Severity::Warning);

    // Case 3: phone 32s >= critical (12 + 2.5σ ≈ 22s) → Critical
    let alert = engine.evaluate_phone_distraction(32.0, ActivityType::Idle, now + 2);
    assert!(alert.is_some(), "32s should trigger critical");
    let decision = alert.unwrap();
    assert_eq!(decision.severity, Severity::Critical);
}

#[test]
fn test_cooldown_blocking() {
    let mut engine = DecisionEngine::new();
    let now = 1000000i64;

    // First alert at T=0
    let alert1 = engine.evaluate_phone_distraction(25.0, ActivityType::Idle, now);
    assert!(alert1.is_some(), "First alert should trigger");

    // Second alert at T=100s (within 5-min cooldown for warning) → blocked
    let alert2 = engine.evaluate_phone_distraction(25.0, ActivityType::Idle, now + 100);
    assert!(alert2.is_none(), "Second alert within cooldown should be blocked");

    // Third alert at T=320s (after 5-min cooldown) → allowed
    let alert3 = engine.evaluate_phone_distraction(25.0, ActivityType::Idle, now + 320);
    assert!(alert3.is_some(), "Alert after cooldown should be allowed");
}

#[test]
fn test_context_multipliers() {
    let mut engine = DecisionEngine::new();
    let now = 1000000i64;

    // Work context: 1.5x more lenient (threshold higher)
    let alert_work = engine.evaluate_phone_distraction(20.0, ActivityType::Work, now);
    assert!(alert_work.is_none(), "20s in work context should not trigger (threshold ~22.5s)");

    // Leisure context: 0.8x more strict (threshold lower)
    let alert_leisure = engine.evaluate_phone_distraction(10.0, ActivityType::Leisure, now + 1);
    assert!(alert_leisure.is_some(), "10s in leisure context should trigger (threshold ~12s)");

    // Meeting context: disabled (infinity threshold)
    let alert_meeting = engine.evaluate_phone_distraction(1000.0, ActivityType::Meeting, now + 2);
    assert!(alert_meeting.is_none(), "Phone alert should be disabled during meeting");
}

#[test]
fn test_blink_fatigue_evaluation() {
    let mut engine = DecisionEngine::new();
    let now = 1000000i64;

    // Skip if screen_time < 2 min
    let alert_no_screen = engine.evaluate_blink_fatigue(5.0, 60, ActivityType::Idle, now);
    assert!(alert_no_screen.is_none(), "Blink alert should not trigger with <2 min screen time");

    // Screen time 3 min, blink 6/min (below warning threshold) → Warning
    let alert_warn = engine.evaluate_blink_fatigue(6.0, 180, ActivityType::Idle, now + 1);
    assert!(alert_warn.is_some(), "Low blink rate should trigger warning");
    assert_eq!(alert_warn.unwrap().severity, Severity::Warning);

    // Blink 3/min (very low) → Critical
    let alert_crit = engine.evaluate_blink_fatigue(3.0, 180, ActivityType::Idle, now + 2);
    assert!(alert_crit.is_some(), "Very low blink rate should trigger critical");
    assert_eq!(alert_crit.unwrap().severity, Severity::Critical);
}

#[test]
fn test_priority_selection() {
    let engine = DecisionEngine::new();

    let alerts = vec![
        AlertDecision {
            alert_type: AlertType::Phone,
            severity: Severity::Warning,
            message: "Test".to_string(),
            reasoning: "Test".to_string(),
        },
        AlertDecision {
            alert_type: AlertType::Blink,
            severity: Severity::Critical,
            message: "Test".to_string(),
            reasoning: "Test".to_string(),
        },
        AlertDecision {
            alert_type: AlertType::Hydration,
            severity: Severity::Info,
            message: "Test".to_string(),
            reasoning: "Test".to_string(),
        },
    ];

    let highest = engine.select_highest_priority(alerts);
    assert!(highest.is_some());
    let decision = highest.unwrap();
    assert_eq!(decision.alert_type, AlertType::Blink);
    assert_eq!(decision.severity, Severity::Critical);
}

#[test]
fn test_reasoning_generation() {
    let mut engine = DecisionEngine::new();
    let now = 1000000i64;

    let alert = engine.evaluate_phone_distraction(25.0, ActivityType::Idle, now);
    assert!(alert.is_some());

    let decision = alert.unwrap();
    let reasoning = &decision.reasoning;

    // Verify reasoning contains key metrics
    assert!(reasoning.contains("Baseline:"), "Reasoning should include baseline");
    assert!(reasoning.contains("Current:"), "Reasoning should include current value");
    assert!(reasoning.contains("Threshold"), "Reasoning should include threshold");
    assert!(
        reasoning.contains("Context:"),
        "Reasoning should include context"
    );
}

#[test]
fn test_hydration_evaluation() {
    let mut engine = DecisionEngine::new();
    let now = 1000000i64;

    // 60 min without drinking (baseline ~60) → None (no warning yet)
    let alert_ok = engine.evaluate_hydration(50.0, now);
    assert!(alert_ok.is_none(), "50 min hydration should not trigger");

    // 80 min without drinking (baseline + 15) → Warning
    let alert_warn = engine.evaluate_hydration(80.0, now + 1);
    assert!(alert_warn.is_some(), "80 min should trigger warning");
    assert_eq!(alert_warn.unwrap().severity, Severity::Warning);

    // 100 min without drinking (baseline + 30) → Critical
    let alert_crit = engine.evaluate_hydration(100.0, now + 2);
    assert!(alert_crit.is_some(), "100 min should trigger critical");
    assert_eq!(alert_crit.unwrap().severity, Severity::Critical);
}
