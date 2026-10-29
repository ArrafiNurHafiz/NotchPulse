use super::*;

#[test]
fn test_ear_calculation_open_vs_closed() {
    let open_eye: [(f32, f32); 6] = [
        (0.0, 0.0),
        (5.0, 4.0),
        (10.0, 4.0),
        (15.0, 0.0),
        (10.0, -4.0),
        (5.0, -4.0),
    ];
    let ear_open = calculate_ear(&open_eye);
    assert!(ear_open > 0.40, "EAR terbuka harus di atas 0.40");

    let closed_eye: [(f32, f32); 6] = [
        (0.0, 0.0),
        (5.0, 0.5),
        (10.0, 0.5),
        (15.0, 0.0),
        (10.0, -0.5),
        (5.0, -0.5),
    ];
    let ear_closed = calculate_ear(&closed_eye);
    assert!(ear_closed < 0.15, "EAR terpejam harus di bawah 0.15");
}

#[test]
fn test_bounding_box_intersection() {
    let mouth_box = BoundingBox { x: 50.0, y: 50.0, width: 30.0, height: 20.0 };
    let bottle_box = BoundingBox { x: 60.0, y: 55.0, width: 25.0, height: 40.0 };
    let distant_box = BoundingBox { x: 200.0, y: 200.0, width: 20.0, height: 20.0 };

    assert!(mouth_box.intersects(&bottle_box), "Botol dan bibir harus overlap");
    assert!(!mouth_box.intersects(&distant_box), "Objek jauh tidak boleh overlap");
}

#[test]
fn test_phone_distraction_detection_after_threshold() {
    let mut engine = VisionPipelineEngine::new();
    for i in 1..=4 {
        let res = engine.process_tick(i, true, true, false, 0.30);
        assert!(res.is_none());
    }
    let res = engine.process_tick(5, true, true, false, 0.30);
    assert!(res.is_some());
    let event = res.unwrap();
    assert_eq!(event.alert_type, AlertType::Phone);
}

#[test]
fn test_drinking_gesture_trigger() {
    let mut engine = VisionPipelineEngine::new();
    let res = engine.process_tick(1, true, false, true, 0.30);
    assert!(res.is_some());
    let event = res.unwrap();
    assert_eq!(event.alert_type, AlertType::Hydration);
    assert_eq!(engine.hydration_counter, 1);
}
