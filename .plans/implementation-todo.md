# Implementation TODO: Comprehensive Vision Engine Refactor

**Status:** DRAFT  
**Created:** 2026-10-30  
**Total Estimated Effort:** 5 weeks (1 developer)

---

## PHASE 1: Foundation (Week 1) — Multi-threaded Daemon + Severity Enum

### P1-1: Refactor `vision_daemon.cpp` Architecture
- [ ] **P1-1.1** Create 3 worker threads structure (face, yolo, context)
  - File: `src-tauri/src/vision_daemon.cpp` (lines 50–120)
  - Add: `std::thread face_thread, yolo_thread, context_thread`
  - Add: `std::atomic<FaceState> current_face_state`
  - Add: `LockFreeQueue<TelemetryFrame> telemetry_queue` (use `boost::lockfree::queue`)
  - Est: 2 hours
  - Test: Thread startup, queue non-blocking operations

- [ ] **P1-1.2** Extract face detection loop to separate thread
  - File: `src-tauri/src/vision_daemon.cpp`
  - Func: `void face_detection_worker(cv::VideoCapture& cap, std::atomic<FaceState>& state)`
  - Loop interval: 150ms (6.7 FPS)
  - Detects: Face presence, eye landmarks, blink state
  - Output: Push FaceState to queue
  - Est: 1.5 hours
  - Test: Face detection latency <160ms, no frame drops

- [ ] **P1-1.3** Extract YOLO detection loop to separate thread
  - File: `src-tauri/src/vision_daemon.cpp`
  - Func: `void yolo_worker(const cv::Mat& frame, std::atomic<ObjectDetections>& state)`
  - Loop interval: 450ms (2.2 FPS)
  - Non-blocking: YOLO runs async, doesn't block face thread
  - Detects: Phone (67), Bottle/Cup (39,41,40,45)
  - Output: Push ObjectDetections to queue
  - Est: 1 hour
  - Test: YOLO latency <500ms, parallel execution verified

- [ ] **P1-1.4** Extract context inference loop to separate thread
  - File: `src-tauri/src/vision_daemon.cpp`
  - Func: `void context_worker(const std::deque<TelemetryFrame>& history, ContextVector& state)`
  - Loop interval: 5s
  - Input: Aggregate last 10 telemetry frames (5s window)
  - Logic: TBD in P1-2
  - Est: 1 hour
  - Test: Context update 5s ± 0.5s latency

### P1-2: Add Context Inference Basic (Work vs Leisure)
- [ ] **P1-2.1** Define ContextVector struct
  - File: `src-tauri/src/vision_engine.rs` (new section or new file `context.rs`)
  - Add enum: `ActivityType { Work, Meeting, Leisure, Break }`
  - Add struct: `ContextVector { activity: ActivityType, focus_level: f32, attention_score: f32 }`
  - Est: 30 min

- [ ] **P1-2.2** Implement basic activity classifier heuristics
  - File: `src-tauri/src/vision_daemon.cpp`
  - Logic rules:
    - WORK: screen_time > 5min + keyboard motion detected
    - LEISURE: screen_time > 2min + no typing
    - MEETING: video_call_app detected OR stationary + long screen time
    - BREAK: face absent > 2min
  - Output: Set `current_activity` in context_worker
  - Est: 1.5 hours
  - Test: Classify 3 scenarios: work session, break, leisure browsing

- [ ] **P1-2.3** Update telemetry JSON output with context field
  - File: `src-tauri/src/vision_engine.rs`
  - Add: `context: ContextVector` to `TelemetrySnapshot`
  - Serialize: Activity type as string enum
  - Est: 30 min

### P1-3: Add Severity Enum
- [ ] **P1-3.1** Create Severity enum in Rust
  - File: `src-tauri/src/vision_engine.rs`
  - Add: `pub enum Severity { Info, Warning, Critical }`
  - Add: `pub struct AlertDecision { alert_type: AlertType, severity: Severity, title, message, reasoning }`
  - Est: 30 min

- [ ] **P1-3.2** Update HabitEventPayload to include severity
  - File: `src-tauri/src/vision_engine.rs`
  - Modify struct: `pub struct HabitEventPayload { ..., severity: Severity }`
  - Maintain backward compat if possible (default to Warning)
  - Est: 30 min

- [ ] **P1-3.3** Update Tauri command handlers to pass severity
  - File: `src-tauri/src/lib.rs`
  - Modify: `#[tauri::command] fn emit_habit_event()` add severity param
  - Update: Frontend event emitter to accept severity
  - Est: 1 hour
  - Test: Event received with severity field

### P1-4: Update Frontend Telemetry Reception
- [ ] **P1-4.1** Add Severity type to TypeScript
  - File: `src/types/index.ts` (create if not exists)
  - Add: `type Severity = 'info' | 'warning' | 'critical'`
  - Est: 15 min

- [ ] **P1-4.2** Update TelemetrySnapshot interface
  - File: `src/App.tsx` or `src/types/telemetry.ts`
  - Add: `context: { activity: ActivityType, focus_level: number, attention_score: number }`
  - Add: `severity?: Severity`
  - Est: 30 min

- [ ] **P1-4.3** Parse context + severity in telemetry listener
  - File: `src/App.tsx`
  - Update: `appWindow.listen('optihabit://telemetry', ...)` handler
  - Log: `console.log('Context:', telemetry.context, 'Severity:', telemetry.severity)`
  - Est: 30 min
  - Test: Browser console shows context & severity

### P1-5: Build & Integration Test
- [ ] **P1-5.1** Compile daemon with pthread
  - Terminal: `g++ -O3 -std=c++17 -pthread vision_daemon.cpp -o vision_daemon ...`
  - Fix: Any linking errors (pthreads, boost lockfree)
  - Est: 30 min
  - Verify: Binary compiles, no undefined references

- [ ] **P1-5.2** Test multi-threaded startup
  - Run: `./vision_daemon` in debug mode
  - Verify: 3 worker threads spawn successfully
  - Check: /proc/$(pidof vision_daemon)/task/ shows 4 threads
  - Est: 30 min

- [ ] **P1-5.3** Integration build + run NotchPulse
  - Terminal: `cargo build --manifest-path src-tauri/Cargo.toml && npm run build`
  - Run: `notchpulse` (Tauri app)
  - Verify: No crashes, telemetry flowing with context + severity
  - Est: 1 hour
  - Test: Check stdout logs for `[CONTEXT] activity=work`, severity values

### P1-6: Acceptance Criteria P1
- [ ] 3 worker threads stable (no race conditions, no deadlocks) ✓
- [ ] Face detection 6–7 FPS (150ms ± 10ms) ✓
- [ ] YOLO 2 FPS (450ms ± 50ms) without blocking face thread ✓
- [ ] Context inferred (work/leisure/meeting/break) ✓
- [ ] Severity enum serialized in telemetry ✓
- [ ] UI receives context + severity fields ✓
- [ ] No frame drops, CPU <20% ✓

---

## PHASE 2: Adaptive Threshold Engine (Week 2)

### P2-1: Create Adaptive Threshold Module
- [ ] **P2-1.1** Create `src-tauri/src/adaptive_thresholds.rs`
  - Define: `RollingStats { samples: VecDeque, mean: f64, stddev: f64 }`
  - Define: `AdaptiveThresholdEngine { phone_baseline, blink_baseline, screen_baseline, hydration_baseline }`
  - Implement: `add_sample()`, `recompute_stats()`, `warning_threshold()`, `critical_threshold()`
  - Est: 2 hours

- [ ] **P2-1.2** Implement rolling window pruning (7-day learning)
  - Method: `add_sample()` prunes entries older than 7 days
  - Use: `chrono::Duration::days(7)`
  - Test: Verify pruning works correctly with mock timestamps
  - Est: 1 hour

- [ ] **P2-1.3** Implement threshold getters with context multipliers
  - Method: `get_phone_thresholds(context: ActivityType) -> (f64, f64)`
  - Logic:
    - Work: `(μ + 1σ) * 1.5`, `(μ + 2σ) * 1.5` (more tolerant)
    - Meeting: `(∞, ∞)` (disabled)
    - Leisure: `(μ + 1σ) * 0.7`, `(μ + 2σ) * 0.7` (stricter)
    - Break: `(∞, ∞)` (disabled)
  - Apply to: phone, blink, screen, hydration
  - Est: 2 hours

### P2-2: Database Schema Migration
- [ ] **P2-2.1** Add baseline tracking table
  - File: `src-tauri/src/db.rs`
  - SQL: 
    ```sql
    CREATE TABLE IF NOT EXISTS user_baselines (
        id INTEGER PRIMARY KEY,
        metric_type TEXT NOT NULL,
        rolling_mean REAL NOT NULL,
        rolling_stddev REAL NOT NULL,
        sample_count INTEGER NOT NULL,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    ```
  - Est: 30 min

- [ ] **P2-2.2** Add migration function
  - Func: `fn init_user_baselines(db: &Connection) -> Result<()>`
  - Insert default rows for 4 metrics (phone, blink, screen, hydration)
  - Set defaults: phone µ=10s, blink µ=14/min, screen µ=45min, hydration µ=60min
  - Est: 1 hour

- [ ] **P2-2.3** Add baseline CRUD functions
  - Func: `fn get_baseline(db: &Connection, metric: &str) -> Result<RollingStats>`
  - Func: `fn update_baseline(db: &Connection, metric: &str, stats: RollingStats) -> Result<()>`
  - Est: 1 hour
  - Test: Read/write baseline values

### P2-3: Connect Engine to DB
- [ ] **P2-3.1** Load baselines on daemon startup
  - File: `src-tauri/src/lib.rs` (Tauri init)
  - Call: `db::get_baseline()` for each metric
  - Pass to: `AdaptiveThresholdEngine::new()` with initial stats
  - Est: 1 hour

- [ ] **P2-3.2** Add background task to persist sample data
  - Task: Every 60s, log current metric values to DB
  - Sample: `{ metric_type: 'phone', value: 25.3, timestamp: now }`
  - Use: Tauri async command or background worker
  - Est: 1.5 hours

- [ ] **P2-3.3** Recompute baselines every 24h or on startup
  - Task: Load all samples from DB, recompute µ & σ
  - Update: `user_baselines` table with new rolling stats
  - Est: 1 hour

### P2-4: Unit Tests for Adaptive Engine
- [ ] **P2-4.1** Test RollingStats calculations
  - File: `src-tauri/tests/adaptive_thresholds_test.rs`
  - Test: `add_sample()` → verify mean, stddev correct
  - Test: Pruning samples >7 days old
  - Test: Edge cases (empty, single sample)
  - Est: 1.5 hours

- [ ] **P2-4.2** Test context-aware multipliers
  - Scenario: phone µ=15s, σ=3s, context=work
  - Expected: warning=(15+3)*1.5=27s, critical=(15+6)*1.5=31.5s
  - Scenario: context=leisure
  - Expected: warning=(15+3)*0.7=12.6s, critical=(15+6)*0.7=14.7s
  - Est: 1 hour

- [ ] **P2-4.3** Test cold start (no prior data)
  - Scenario: First 3 days of usage
  - Expected: Default conservative thresholds active, no personalization
  - After 7 days: Switch to adaptive thresholds
  - Est: 1 hour

### P2-5: Integration Test with Vision Daemon
- [ ] **P2-5.1** Mock sample data generation
  - Generate: 7 days of fake telemetry (phone duration, blink rate, etc.)
  - Scenario: Work pattern (8h/day, typical breaks)
  - Insert to: SQLite DB
  - Est: 1 hour

- [ ] **P2-5.2** Test baseline convergence
  - Run: Recompute baseline from 7-day mock data
  - Verify: µ_phone ≈ 12s, σ_phone ≈ 5s (realistic)
  - Verify: µ_blink ≈ 14/min, σ_blink ≈ 2/min
  - Est: 1 hour

- [ ] **P2-5.3** Live test with real vision daemon
  - Run: `notchpulse` for 1 hour
  - Collect: Telemetry with samples
  - Verify: Baselines update every 24h without crash
  - Est: 1.5 hours

### P2-6: Acceptance Criteria P2
- [ ] Baseline µ & σ computed correctly from samples ✓
- [ ] Cold start uses conservative defaults ✓
- [ ] After 7 days, thresholds adapt per user profile ✓
- [ ] Context multipliers applied correctly (work 1.5x, leisure 0.7x) ✓
- [ ] DB persist & restore baselines on restart ✓
- [ ] Unit tests >85% coverage ✓

---

## PHASE 3: Decision Engine + Explainability (Week 3)

### P3-1: Refactor Decision Engine
- [ ] **P3-1.1** Create `src-tauri/src/decision_engine.rs`
  - Struct: `DecisionEngine { adaptive_thresholds, last_alert_times, cooldown_seconds }`
  - HashMap: `last_alert_times: HashMap<AlertType, i64>` track last alert per type
  - Est: 1 hour

- [ ] **P3-1.2** Implement cooldown logic
  - Method: `fn in_cooldown(alert_type: AlertType) -> bool`
  - Check: `(now - last_alert_times[alert_type]) < 900s` (15 min)
  - Est: 30 min

- [ ] **P3-1.3** Implement phone distraction evaluation
  - File: `src-tauri/src/decision_engine.rs`
  - Logic:
    ```rust
    let (warn, crit) = engine.get_phone_thresholds(context);
    if phone_duration >= crit {
      return AlertDecision {
        severity: Critical,
        reasoning: format!("baseline: {:.1}s ± {:.1}s, current: {:.1}s (>2σ)", µ, σ, current)
      }
    } else if phone_duration >= warn {
      return AlertDecision {
        severity: Warning,
        reasoning: ...
      }
    }
    ```
  - Est: 1.5 hours

- [ ] **P3-1.4** Implement blink fatigue evaluation
  - Logic:
    - Critical: blink_rate < µ * 0.5 → "Kelelahan mata berat"
    - Warning: blink_rate < µ * 0.7 → "Mata mulai lelah"
  - Require: Screen time >2 min (not during break)
  - Est: 1.5 hours

- [ ] **P3-1.5** Implement screen time evaluation
  - Logic:
    - Warning: screen_sec > threshold_warn
    - Critical: screen_sec > threshold_critical
  - Context-aware: Work threshold > Leisure threshold
  - Est: 1 hour

- [ ] **P3-1.6** Implement hydration evaluation
  - Logic:
    - Warning: last_hydration > µ_hydration + 15min
    - Critical: last_hydration > µ_hydration + 30min
  - Cooldown: 15 min between reminders
  - Est: 1 hour

### P3-2: Priority & Deduplication
- [ ] **P3-2.1** Implement alert priority scoring
  - Priority: Critical > Warning > Info
  - If multiple alerts triggered, return highest severity only
  - Store: Previous alert type to avoid duplicate
  - Est: 1 hour

- [ ] **P3-2.2** Implement cooldown check before returning alert
  - Check: `in_cooldown()` before each alert type
  - Skip if in cooldown, return None
  - Update: `last_alert_times[alert_type] = now` when alert emitted
  - Est: 30 min

### P3-3: Explainability & Reasoning
- [ ] **P3-3.1** Add reasoning field to AlertDecision
  - Field: `reasoning: String`
  - Format: "Context: work | Baseline: 12.5s ± 2.3s | Current: 35.2s | Threshold: 21.8s (critical)"
  - Est: 30 min

- [ ] **P3-3.2** Generate reasoning strings for each alert type
  - Phone: Include µ, σ, context multiplier, actual vs threshold
  - Blink: Include baseline rate, current rate, % drop
  - Screen: Include context, elapsed time, break history
  - Hydration: Include last drink time, reminder frequency
  - Est: 1.5 hours

- [ ] **P3-3.3** Log all alert decisions to DB
  - Table: `alert_decisions (alert_type, severity, context, reasoning, threshold_used, actual_value, timestamp)`
  - File: `src-tauri/src/db.rs`
  - Func: `fn log_alert_decision(db: &Connection, decision: &AlertDecision) -> Result<()>`
  - Est: 1 hour

### P3-4: Unit Tests
- [ ] **P3-4.1** Test phone threshold evaluation
  - Case 1: phone 10s, warn=20s, crit=30s → None
  - Case 2: phone 25s, warn=20s, crit=30s → Warning
  - Case 3: phone 35s, warn=20s, crit=30s → Critical
  - Est: 1 hour

- [ ] **P3-4.2** Test cooldown blocking
  - Scenario: Alert triggered at T=0s, cooldown=900s
  - At T=100s: Same alert type → None (in cooldown)
  - At T=1000s: Same alert type → AlertDecision (cooldown expired)
  - Est: 1 hour

- [ ] **P3-4.3** Test priority scoring
  - Scenario: Phone + Blink + Hydration all triggered simultaneously
  - Expected: Return highest severity (assume Blink critical, Phone warning)
  - Result: Return Blink critical only
  - Est: 1 hour

- [ ] **P3-4.4** Test reasoning generation
  - Verify: Reasoning string contains µ, σ, context, threshold, actual
  - Verify: Grammar & formatting correct (no encoding errors)
  - Est: 1 hour

### P3-5: Integration Test
- [ ] **P3-5.1** Simulate realistic scenario (1 hour work session)
  - T=0–20min: Normal work, no alerts
  - T=20min: Blink rate drops → Warning alert
  - T=25min: Phone detected 25s → Warning alert (but suppressed, already in alert)
  - T=30min: Phone released → Cancel phone alert
  - T=45min: Blink critical → Critical alert
  - Verify: Alerts fire at right times, cooldown respected
  - Est: 1.5 hours

### P3-6: Acceptance Criteria P3
- [ ] Phone distraction threshold evaluated correctly ✓
- [ ] Blink fatigue threshold evaluated correctly ✓
- [ ] Screen time threshold evaluated correctly ✓
- [ ] Hydration threshold evaluated correctly ✓
- [ ] Alert cooldown enforced (15 min) ✓
- [ ] Only highest severity alert returned when multiple triggered ✓
- [ ] Reasoning string includes baseline, context, threshold, actual ✓
- [ ] Alert decisions logged to DB ✓

---

## PHASE 4: UI Severity Styling + Reasoning Panel (Week 4)

### P4-1: Update Alert Banner Styling
- [ ] **P4-1.1** Define severity color scheme
  - File: `src/App.css` or Tailwind config
  - Info: bg-blue-500/15, border-blue-400, text-blue-300, icon 💡
  - Warning: bg-amber-500/20, border-amber-400, text-amber-300, icon ⚠️
  - Critical: bg-rose-500/25, border-rose-500, text-rose-300, icon 🚨
  - Est: 30 min

- [ ] **P4-1.2** Create severity-based conditional rendering
  - File: `src/App.tsx` (Alert component)
  - Conditional: `if (severity === 'critical') { add shake animation, persistent }`
  - Conditional: `if (severity === 'warning') { auto-dismiss 10s }`
  - Conditional: `if (severity === 'info') { auto-dismiss 5s }`
  - Est: 1.5 hours

- [ ] **P4-1.3** Add subtle shake animation for critical
  - File: `src/App.css`
  - Keyframe: `@keyframes shake { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(2px); } }`
  - Duration: 0.3s, repeat 3x
  - Est: 30 min

### P4-2: Implement Reasoning Panel
- [ ] **P4-2.1** Add expandable reasoning section
  - File: `src/App.tsx`
  - UI: Icon + "Why?" link below alert message
  - State: `reasoningExpanded: boolean` per alert
  - Est: 1 hour

- [ ] **P4-2.2** Display reasoning text in details panel
  - File: `src/App.tsx`
  - Format reasoning for readability:
    ```
    Why this alert:
    • Context: Work mode
    • Your baseline: 12.5s (avg phone check)
    • Current: 35.2s (continuous hold)
    • Threshold: Critical at 21.8s (baseline + 2 std devs)
    ```
  - Est: 1 hour

- [ ] **P4-2.3** Add metadata display
  - Show: Alert timestamp, confidence level (if applicable)
  - Show: "Dismiss" button logs user feedback
  - Est: 30 min

### P4-3: Cooldown Visual Indicator
- [ ] **P4-3.1** Add cooldown countdown timer
  - File: `src/App.tsx`
  - UI: "(Alert suppressed for 12 more minutes)"
  - Update: Every 10s to show remaining time
  - Est: 1 hour

- [ ] **P4-3.2** Pulse animation for cooldown
  - File: `src/App.css`
  - Visual: Soft pulse opacity while in cooldown
  - Duration: 1s pulse, repeats
  - Est: 30 min

### P4-4: User Feedback Tracking
- [ ] **P4-4.1** Add dismiss button with logging
  - File: `src/App.tsx`
  - Button: "Got it" or "Dismiss"
  - Action: Invoke Tauri command `log_alert_dismissed(alert_id, user_feedback)`
  - Est: 1 hour

- [ ] **P4-4.2** Create feedback logging endpoint
  - File: `src-tauri/src/lib.rs`
  - Command: `#[tauri::command] async fn log_alert_dismissed(db: State<AppState>, alert_id: i64, feedback: String) -> Result<()>`
  - DB: Store feedback for future ML
  - Est: 1 hour

### P4-5: Responsive Mobile Layout
- [ ] **P4-5.1** Test alert rendering on small viewport
  - Viewport: 640x520 (current canvas)
  - Verify: Reasoning panel doesn't overflow
  - Verify: Buttons clickable, not cramped
  - Est: 30 min

- [ ] **P4-5.2** Adjust padding/margins for mobile
  - Adjust: Info text size for readability
  - Adjust: Icon size (24px mobile, 32px desktop)
  - Est: 30 min

### P4-6: Test Screenshots
- [ ] **P4-6.1** Capture Info alert
  - Run: `grim -g "320,0 640x350" ~/test_info.png`
  - Verify: Blue styling, 💡 icon, lembut appearance
  - Est: 15 min

- [ ] **P4-6.2** Capture Warning alert
  - Verify: Yellow styling, ⚠️ icon, moderate prominence
  - Est: 15 min

- [ ] **P4-6.3** Capture Critical alert
  - Verify: Red styling, 🚨 icon, shake animation, persistent
  - Est: 15 min

- [ ] **P4-6.4** Capture Reasoning panel expanded
  - Verify: Readable formatting, metadata shown
  - Est: 15 min

### P4-7: Acceptance Criteria P4
- [ ] Alert colors match severity (info blue, warning yellow, critical red) ✓
- [ ] Critical alerts shake & persist until dismissed ✓
- [ ] Warning alerts auto-dismiss after 10s ✓
- [ ] Info alerts auto-dismiss after 5s ✓
- [ ] Reasoning panel expandable with details ✓
- [ ] Cooldown timer visible & accurate ✓
- [ ] Dismiss button logs user feedback ✓
- [ ] Mobile layout responsive, no overflow ✓

---

## PHASE 5: Testing, Tuning, Pilot (Week 5)

### P5-1: Unit Test Suite
- [ ] **P5-1.1** Run all existing tests
  - Terminal: `cargo test --manifest-path src-tauri/Cargo.toml`
  - Verify: >90% pass rate
  - Fix: Any regressions
  - Est: 1 hour

- [ ] **P5-1.2** Expand coverage for new modules
  - Target: adaptive_thresholds.rs >80% coverage
  - Target: decision_engine.rs >80% coverage
  - Add: Edge case tests (null values, extreme numbers)
  - Est: 2 hours

### P5-2: Integration Test Suite
- [ ] **P5-2.1** Create E2E test scenario (60 min work + break)
  - File: `src-tauri/tests/e2e_test.rs`
  - Scenario 1: Normal work session (blink, screen time normal)
  - Expected: No critical alerts, only info reminders
  - Est: 1.5 hours

- [ ] **P5-2.2** Create fatigue scenario (low blink + long screen time)
  - Scenario 2: User tired, 40 min screen, blink rate 5/min
  - Expected: Blink warning at 30 min, critical at 45 min
  - Est: 1 hour

- [ ] **P5-2.3** Create distraction scenario (phone checking)
  - Scenario 3: Phone picked up at T=20s, held until T=45s
  - Expected: Warning at 30s, critical at 40s
  - Est: 1 hour

- [ ] **P5-2.4** Create hydration scenario (no water for 90 min)
  - Scenario 4: No drinks logged for 1.5 hours
  - Expected: Warning at 75 min, critical at 90 min
  - Est: 1 hour

### P5-3: Performance Benchmark
- [ ] **P5-3.1** Measure CPU usage over 30 min
  - Tool: `top`, collect avg CPU%
  - Target: <15% average on i5-1135G7
  - Current: ~25%
  - Est: 30 min

- [ ] **P5-3.2** Measure frame drops
  - Collect: Face detection FPS, YOLO FPS, context update latency
  - Target: Face 6–7 FPS, YOLO 2 FPS, no drops
  - Est: 30 min

- [ ] **P5-3.3** Memory profiling
  - Tool: `valgrind --tool=massif`
  - Check: No memory leaks in worker threads
  - Target: Heap <100MB steady state
  - Est: 1 hour

### P5-4: Real-World Pilot (3 days, 1 user)
- [ ] **P5-4.1** Run NotchPulse in normal work (8h/day)
  - Collect: All telemetry, alerts, decisions
  - Monitor: Stability (no crashes, no hangs)
  - Est: 3 days (passive)

- [ ] **P5-4.2** Analyze alert accuracy
  - Metric: How many alerts were "correct" (timely, relevant)?
  - Goal: >80% relevant
  - Adjust thresholds if needed
  - Est: 1 hour

- [ ] **P5-4.3** Analyze false positive rate
  - Count: Alerts dismissed vs acted upon
  - Goal: <15% dismiss rate
  - Adjust: Multipliers or grace periods
  - Est: 1 hour

### P5-5: Documentation
- [ ] **P5-5.1** Update README with new features
  - Add: Context awareness, adaptive thresholds, severity levels
  - Add: Configuration section for cooldown, learning window
  - Est: 1 hour

- [ ] **P5-5.2** Write troubleshooting guide
  - Section: "Why am I getting so many alerts?"
  - Section: "How do baselines work?"
  - Section: "How to adjust thresholds"
  - Est: 1 hour

- [ ] **P5-5.3** Create architecture diagram
  - Tool: ASCII or Mermaid
  - Show: 5-layer pipeline, data flow
  - Est: 1 hour

### P5-6: Final Build & Deployment
- [ ] **P5-6.1** Compile final release build
  - Terminal: `cargo build --release --manifest-path src-tauri/Cargo.toml && npm run build`
  - Verify: Optimizations applied, <50MB binary
  - Est: 1 hour

- [ ] **P5-6.2** Create changelog
  - List: All new features, bug fixes, performance improvements
  - Est: 30 min

- [ ] **P5-6.3** Push to main + tag release
  - Git: Commit final changes, push to main
  - Tag: `v2.0.0` (major version bump)
  - Est: 15 min

### P5-7: Acceptance Criteria P5
- [ ] All unit tests pass (>90% pass rate) ✓
- [ ] E2E scenarios pass (normal, fatigue, distraction, hydration) ✓
- [ ] CPU usage <15% average ✓
- [ ] No frame drops or hangs ✓
- [ ] 3-day pilot: >80% alert accuracy ✓
- [ ] 3-day pilot: <15% false positive rate ✓
- [ ] Documentation complete ✓
- [ ] Release build optimized & tagged ✓

---

## Summary

| Phase | Title | Duration | Tasks | Risk Level |
|---|---|---|---|---|
| P1 | Foundation | 1 week | 6 sections, 20 tasks | MEDIUM (threading) |
| P2 | Adaptive Engine | 1 week | 6 sections, 16 tasks | LOW |
| P3 | Decision Logic | 1 week | 6 sections, 18 tasks | LOW |
| P4 | UI Styling | 1 week | 7 sections, 17 tasks | LOW |
| P5 | Testing & Pilot | 1 week | 7 sections, 18 tasks | MEDIUM (pilot feedback) |
| | **TOTAL** | **5 weeks** | **89 tasks** | |

---

## Rollback Strategy

- **Phase 1 issue:** Revert to single-threaded daemon (commit prior to threading)
- **Phase 2 issue:** Revert DB changes, use default thresholds
- **Phase 3 issue:** Disable decision engine, use legacy alert logic
- **Phase 4 issue:** Revert to simple alert styling (no severity)
- **Phase 5 issue:** Roll back release, use v1.x

---

## Success Criteria (Overall)

✓ False positive rate: <10% (from ~40%)  
✓ User dismiss rate: <20% (from ~60%)  
✓ Adaptive accuracy: >85%  
✓ Frame rate: 6–7 FPS stable  
✓ CPU: <15% average  
✓ Zero regression bugs  
✓ 3-day pilot success (>80% alert accuracy)

---

**Created:** 2026-10-30T10:14:09Z  
**Updated:** [pending]  
**Status:** READY FOR IMPLEMENTATION
