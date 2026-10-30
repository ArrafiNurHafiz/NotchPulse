use crate::adaptive_thresholds::{ActivityType, AdaptiveThresholdEngine, RollingStats};

#[test]
fn test_rolling_stats_default_and_add_samples() {
    let mut stats = RollingStats::new(12.0, 4.0);
    assert_eq!(stats.mean, 12.0);
    assert_eq!(stats.stddev, 4.0);

    let now = 1000000;
    // Tambah 12 sampel nilai 20.0
    for i in 0..12 {
        stats.add_sample(now + i * 10, 20.0);
    }

    // Setelah 12 sampel >= 10, mean harus converge ke 20.0
    assert!((stats.mean - 20.0).abs() < 0.01);
}

#[test]
fn test_adaptive_threshold_context_multipliers() {
    let engine = AdaptiveThresholdEngine::new();

    // Context Work: toleransi HP 1.5x lebih sabar
    let (work_warn, work_crit) = engine.get_phone_thresholds(ActivityType::Work);
    let (idle_warn, idle_crit) = engine.get_phone_thresholds(ActivityType::Idle);

    assert!(work_warn > idle_warn, "Threshold kerja harus lebih tinggi/sabar daripada idle");
    assert!(work_crit > idle_crit);

    // Context Meeting: HP alert dimatikan (infinity)
    let (meet_warn, meet_crit) = engine.get_phone_thresholds(ActivityType::Meeting);
    assert_eq!(meet_warn, f64::INFINITY);
    assert_eq!(meet_crit, f64::INFINITY);

    // Context Leisure: lebih ketat (0.8x)
    let (leisure_warn, leisure_crit) = engine.get_phone_thresholds(ActivityType::Leisure);
    assert!(leisure_warn < idle_warn, "Threshold santai harus lebih ketat daripada idle");
    assert!(leisure_crit < idle_crit);
}

#[test]
fn test_prune_older_than_7_days() {
    let mut stats = RollingStats::new(10.0, 2.0);
    let now = 1000000;
    let eight_days_ago = now - (8 * 86400);

    // Sampel kadaluarsa
    stats.add_sample(eight_days_ago, 50.0);
    // Sampel baru
    stats.add_sample(now, 10.0);

    // Sampel 8 hari lalu harus dibuang
    assert_eq!(stats.samples.len(), 1);
    assert_eq!(stats.samples[0].1, 10.0);
}
