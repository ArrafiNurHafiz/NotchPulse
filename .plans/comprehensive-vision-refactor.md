# Plan: Comprehensive Vision Engine & Logic Architecture Refactor

**Status:** DRAFT  
**Created:** 2026-10-30  
**Scope:** Full system redesign — vision pipeline, state machine, alert logic, scoring algorithms, and UI feedback loops

---

## Executive Summary

Sistem NotchPulse saat ini mengalami **fundamental design issues** yang menyebabkan:
1. **False positives agresif** — Alert muncul terlalu cepat (HP 4s, screen 20 menit)
2. **Logika threshold statis** — Tidak ada adaptasi terhadap pola kerja individu
3. **State management fragmented** — C++ daemon vs Rust engine vs React state tidak sinkron
4. **No context awareness** — Sistem tidak tahu apakah user sedang meeting, coding, atau browsing santai
5. **Single-threaded detection** — YOLO + Haar cascade blocking di main loop, drop frame rate saat CPU load tinggi

**Solusi:** Refactor total ke **adaptive multi-context vision engine** dengan:
- **Behavioral learning** — Personalized baseline per user
- **Context inference** — Auto-detect work vs leisure vs break
- **Severity hierarchy** — Info → Warning → Critical dengan grace period
- **Async pipeline** — YOLO offload ke worker thread, Haar cascade high-frequency loop
- **Explainable decisions** — Setiap alert datang dengan reasoning trace

---

## 1. Architectural Principles

### 1.1 Multi-Layer Detection Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: HIGH-FREQ SENSING (150ms/tick)                    │
│ ├─ Face presence (Haar)                                    │
│ ├─ Eye state (Haar + EAR proxy)                            │
│ └─ Blink counter (state transition tracking)               │
└─────────────────────────────────────────────────────────────┘
            ↓ Telemetry stream
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: MID-FREQ OBJECT DETECTION (450ms/tick)            │
│ ├─ Phone/Bottle/Cup (YOLOv8n ONNX)                         │
│ ├─ Gesture recognition (bottle-to-mouth tracking)          │
│ └─ Posture estimation (head tilt, slouching)               │
└─────────────────────────────────────────────────────────────┘
            ↓ Object annotations
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: CONTEXT INFERENCE ENGINE (5s aggregate)           │
│ ├─ Activity classifier: work / meeting / leisure / break   │
│ ├─ Attention scorer: focused / distracted / idle           │
│ └─ Fatigue estimator: fresh / tired / exhausted            │
└─────────────────────────────────────────────────────────────┘
            ↓ Context vector
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: ADAPTIVE DECISION ENGINE                          │
│ ├─ Personalized thresholds (learning from history)         │
│ ├─ Severity classifier (info/warning/critical)             │
│ ├─ Cooldown & rate limiting                                │
│ └─ Alert deduplication & prioritization                    │
└─────────────────────────────────────────────────────────────┘
            ↓ Action events
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: UI FEEDBACK & LOGGING                             │
│ ├─ Dynamic Island visual state                             │
│ ├─ SQLite habit log persistence                            │
│ └─ Telemetry export for analysis                           │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Adaptive Threshold Design

**Static thresholds** (current):
- Phone: 4s → alert
- Blink: <10/min → alert
- Screen: 20 min → alert

**Adaptive thresholds** (proposed):

| Metric | Baseline Calculation | Warning Trigger | Critical Trigger |
|---|---|---|---|
| **Phone Duration** | Avg daily phone check: `μ_phone` | `μ_phone + 1σ` | `μ_phone + 2σ` |
| **Blink Rate** | Personal baseline: `μ_blink` (12–18/min) | `< μ_blink - 30%` | `< μ_blink - 50%` |
| **Screen Time** | Work session avg: `μ_screen` | `> μ_screen + 15 min` | `> μ_screen + 30 min` |
| **Hydration Gap** | Avg drink interval: `μ_hydration` | `> μ_hydration + 15 min` | `> μ_hydration + 30 min` |

**Learning window:** 7 hari rolling average.

**Cold start:** Default conservative thresholds minggu pertama, lalu adapt.

### 1.3 Context-Aware Alerting

```
Context: WORK (detected via: keyboard typing sound, IDE window, focused posture)
├─ Phone alert threshold: 30s (toleransi cek notifikasi cepat)
├─ Screen alert threshold: 60 min (pekerjaan produktif wajar)
└─ Blink monitoring: ACTIVE (fatigue tracking penting)

Context: MEETING (detected via: video call app, camera on, stationary posture)
├─ Phone alert: DISABLED (bisa cek chat meeting)
├─ Screen alert: DISABLED (meeting bisa 1-2 jam)
└─ Blink monitoring: RELAXED (fokus ke layar wajar)

Context: LEISURE (detected via: browser, social media, relaxed posture)
├─ Phone alert threshold: 20s (distraction lebih mudah)
├─ Screen alert threshold: 45 min (leisure bukan produktif)
└─ Blink monitoring: ACTIVE (hiburan tetap butuh break)

Context: BREAK (detected via: no screen, away from desk, posture change)
├─ All alerts: PAUSED
└─ Hydration reminder: ACTIVE ONLY
```

### 1.4 Severity Levels & Grace Period

```
INFO (blue, no sound, dismissible)
├─ First reminder, gentle nudge
└─ Example: "Sudah 40 menit tanpa break, pertimbangkan istirahat sebentar"

WARNING (yellow, soft chime, auto-dismiss 10s)
├─ Threshold exceeded, user should act soon
└─ Example: "Mata tampak lelah (6 blink/min), istirahatkan 20 detik"

CRITICAL (red, alert sound, persistent until acknowledged)
├─ Serious health/productivity risk
└─ Example: "HP terus dipegang 45 detik, produktivitas drop 35%"

Grace Period:
├─ INFO → WARNING: 5 menit tolerance
├─ WARNING → CRITICAL: 10 menit tolerance
└─ Same alert cooldown: 15 menit (hindari spam)
```

---

## 2. Technical Implementation Plan

### 2.1 Vision Daemon Refactor (`vision_daemon.cpp`)

**Current issues:**
- Single-threaded blocking loop (YOLO blocks Haar, drop FPS)
- No context tracking (hanya deteksi instant)
- Hardcoded thresholds
- No grace period / cooldown

**Proposed architecture:**

```cpp
// Multi-threaded async pipeline
class VisionDaemon {
    // Thread 1: High-freq face/eye detection (150ms)
    std::thread face_thread;
    std::atomic<FaceState> current_face_state;
    
    // Thread 2: Mid-freq YOLO object detection (450ms)
    std::thread yolo_thread;
    std::atomic<ObjectDetections> current_objects;
    
    // Thread 3: Context inference (5s aggregate)
    std::thread context_thread;
    ContextInferenceEngine context_engine;
    
    // Shared state (lock-free ring buffer)
    LockFreeQueue<TelemetryFrame> telemetry_queue;
};

struct TelemetryFrame {
    int64_t timestamp;
    FaceState face;
    ObjectDetections objects;
    ContextVector context;
    float fatigue_score;  // 0.0–1.0
    float attention_score; // 0.0–1.0
};

struct ContextVector {
    ActivityType activity;  // work / meeting / leisure / break
    float focus_level;      // 0.0–1.0
    float distraction_level; // 0.0–1.0
};
```

**Activity classifier logic:**

```cpp
ActivityType infer_activity(const HistoryWindow& window) {
    bool keyboard_active = detect_typing_motion(window);
    bool video_call = window.has_video_call_indicator;
    bool stationary = window.head_movement_variance < 0.1;
    bool screen_present = window.face_present_ratio > 0.8;
    
    if (video_call && stationary) return MEETING;
    if (keyboard_active && screen_present) return WORK;
    if (!screen_present || window.face_present_ratio < 0.3) return BREAK;
    return LEISURE;
}
```

### 2.2 Adaptive Threshold Engine (New Rust Module)

**File:** `src-tauri/src/adaptive_thresholds.rs`

```rust
use chrono::{DateTime, Utc};
use std::collections::VecDeque;

pub struct AdaptiveThresholdEngine {
    phone_baseline: RollingStats,
    blink_baseline: RollingStats,
    screen_baseline: RollingStats,
    hydration_baseline: RollingStats,
    learning_window_days: u32,
}

struct RollingStats {
    samples: VecDeque<(DateTime<Utc>, f64)>,
    mean: f64,
    stddev: f64,
}

impl RollingStats {
    fn add_sample(&mut self, value: f64) {
        let now = Utc::now();
        self.samples.push_back((now, value));
        
        // Prune samples older than learning window
        let cutoff = now - chrono::Duration::days(7);
        while let Some((ts, _)) = self.samples.front() {
            if *ts < cutoff {
                self.samples.pop_front();
            } else {
                break;
            }
        }
        
        // Recompute stats
        self.recompute();
    }
    
    fn recompute(&mut self) {
        let values: Vec<f64> = self.samples.iter().map(|(_, v)| *v).collect();
        if values.is_empty() {
            return;
        }
        
        self.mean = values.iter().sum::<f64>() / values.len() as f64;
        
        let variance = values.iter()
            .map(|v| (v - self.mean).powi(2))
            .sum::<f64>() / values.len() as f64;
        self.stddev = variance.sqrt();
    }
    
    fn warning_threshold(&self, sigma_multiplier: f64) -> f64 {
        self.mean + (sigma_multiplier * self.stddev)
    }
    
    fn critical_threshold(&self, sigma_multiplier: f64) -> f64 {
        self.mean + (sigma_multiplier * self.stddev)
    }
}

impl AdaptiveThresholdEngine {
    pub fn get_phone_thresholds(&self, context: ActivityType) -> (f64, f64) {
        let base_warning = self.phone_baseline.warning_threshold(1.0);
        let base_critical = self.phone_baseline.critical_threshold(2.0);
        
        match context {
            ActivityType::Work => (base_warning * 1.5, base_critical * 1.5),
            ActivityType::Meeting => (f64::INFINITY, f64::INFINITY), // disabled
            ActivityType::Leisure => (base_warning * 0.7, base_critical * 0.7),
            ActivityType::Break => (f64::INFINITY, f64::INFINITY),
        }
    }
    
    pub fn get_blink_thresholds(&self, context: ActivityType) -> (f64, f64) {
        let base_mean = self.blink_baseline.mean;
        match context {
            ActivityType::Work => (base_mean * 0.7, base_mean * 0.5),
            ActivityType::Meeting => (base_mean * 0.8, base_mean * 0.6),
            ActivityType::Leisure => (base_mean * 0.7, base_mean * 0.5),
            ActivityType::Break => (f64::NEG_INFINITY, f64::NEG_INFINITY),
        }
    }
    
    pub fn get_screen_time_thresholds(&self, context: ActivityType) -> (u64, u64) {
        let base_mean_sec = self.screen_baseline.mean as u64;
        match context {
            ActivityType::Work => (base_mean_sec + 900, base_mean_sec + 1800), // +15m, +30m
            ActivityType::Meeting => (u64::MAX, u64::MAX),
            ActivityType::Leisure => (base_mean_sec + 600, base_mean_sec + 1200), // +10m, +20m
            ActivityType::Break => (u64::MAX, u64::MAX),
        }
    }
}
```

### 2.3 Decision Engine with Cooldown (`lib.rs` refactor)

**Current:** Simple cascade if-else, no cooldown, no severity.

**Proposed:**

```rust
pub struct DecisionEngine {
    adaptive_thresholds: AdaptiveThresholdEngine,
    last_alert_times: HashMap<AlertType, i64>,
    alert_history: VecDeque<AlertEvent>,
    cooldown_seconds: u64,
}

#[derive(Debug, Clone)]
pub enum Severity {
    Info,
    Warning,
    Critical,
}

#[derive(Debug, Clone)]
pub struct AlertDecision {
    pub alert_type: AlertType,
    pub severity: Severity,
    pub title: String,
    pub message: String,
    pub reasoning: String,  // Explainability
    pub timestamp: i64,
}

impl DecisionEngine {
    pub fn evaluate(&mut self, telemetry: &TelemetryFrame) -> Option<AlertDecision> {
        let context = telemetry.context.activity;
        
        // Check cooldown
        if self.in_cooldown(&AlertType::Phone) {
            return None;
        }
        
        // Evaluate phone distraction
        let (phone_warn, phone_crit) = self.adaptive_thresholds.get_phone_thresholds(context);
        if telemetry.phone_duration >= phone_crit {
            return Some(AlertDecision {
                alert_type: AlertType::Phone,
                severity: Severity::Critical,
                title: "Distraksi HP Serius".into(),
                message: format!("HP dipegang {:.0}s (threshold: {:.0}s)", 
                    telemetry.phone_duration, phone_crit),
                reasoning: format!(
                    "Context: {:?}, baseline: {:.1}s ± {:.1}s, current: {:.1}s (>2σ)",
                    context, 
                    self.adaptive_thresholds.phone_baseline.mean,
                    self.adaptive_thresholds.phone_baseline.stddev,
                    telemetry.phone_duration
                ),
                timestamp: telemetry.timestamp,
            });
        } else if telemetry.phone_duration >= phone_warn {
            return Some(AlertDecision {
                alert_type: AlertType::Phone,
                severity: Severity::Warning,
                title: "Perhatian: HP Terlalu Lama".into(),
                message: format!("HP dipegang {:.0}s", telemetry.phone_duration),
                reasoning: format!("Context: {:?}, threshold warning: {:.1}s", context, phone_warn),
                timestamp: telemetry.timestamp,
            });
        }
        
        // Evaluate blink fatigue
        let (blink_warn, blink_crit) = self.adaptive_thresholds.get_blink_thresholds(context);
        if telemetry.blink_rate < blink_crit {
            return Some(AlertDecision {
                alert_type: AlertType::Blink,
                severity: Severity::Critical,
                title: "Kelelahan Mata Berat".into(),
                message: format!("Kedipan sangat rendah: {}/min", telemetry.blink_rate),
                reasoning: format!(
                    "Baseline: {:.1}/min, current: {}/min (<50% baseline)",
                    self.adaptive_thresholds.blink_baseline.mean,
                    telemetry.blink_rate
                ),
                timestamp: telemetry.timestamp,
            });
        } else if telemetry.blink_rate < blink_warn {
            return Some(AlertDecision {
                alert_type: AlertType::Blink,
                severity: Severity::Warning,
                title: "Mata Mulai Lelah".into(),
                message: "Frekuensi kedip menurun".into(),
                reasoning: format!("Current: {}/min, warning threshold: {:.1}/min", 
                    telemetry.blink_rate, blink_warn),
                timestamp: telemetry.timestamp,
            });
        }
        
        // Similar logic for screen time & hydration...
        
        None
    }
    
    fn in_cooldown(&self, alert_type: &AlertType) -> bool {
        if let Some(&last_time) = self.last_alert_times.get(alert_type) {
            let now = chrono::Utc::now().timestamp();
            return (now - last_time) < self.cooldown_seconds as i64;
        }
        false
    }
}
```

### 2.4 Frontend Severity UI (`App.tsx`)

**Alert Banner Styling:**

```tsx
type AlertSeverity = 'info' | 'warning' | 'critical';

const severityStyles = {
  info: {
    border: 'border-blue-400/50',
    bg: 'bg-blue-500/15',
    text: 'text-blue-300',
    icon: '💡',
    shadow: 'shadow-[0_0_10px_rgba(59,130,246,0.3)]',
  },
  warning: {
    border: 'border-amber-400/50',
    bg: 'bg-amber-500/20',
    text: 'text-amber-300',
    icon: '⚠️',
    shadow: 'shadow-[0_0_12px_rgba(251,191,36,0.4)]',
  },
  critical: {
    border: 'border-rose-500/60',
    bg: 'bg-rose-500/25',
    text: 'text-rose-300',
    icon: '🚨',
    shadow: 'shadow-[0_0_16px_rgba(244,63,94,0.5)]',
    animation: 'animate-subtle-shake',
  },
};

// Cooldown tracker
const [alertCooldowns, setAlertCooldowns] = useState<Map<string, number>>(new Map());

const shouldShowAlert = (alertType: string): boolean => {
  const lastShown = alertCooldowns.get(alertType);
  if (!lastShown) return true;
  return (Date.now() - lastShown) > 15 * 60 * 1000; // 15 min cooldown
};
```

**Explainability Panel** (expandable dari alert banner):

```tsx
<div className="reasoning-panel">
  <p className="text-xs text-neutral-400">
    <strong>Mengapa alert ini muncul:</strong><br/>
    {alertDecision.reasoning}
  </p>
  <p className="text-xs text-neutral-500 mt-1">
    Context: {alertDecision.context} | Baseline: {alertDecision.baseline}
  </p>
</div>
```

---

## 3. Database Schema Extension

**New tables:**

```sql
-- Baseline learning data
CREATE TABLE user_baselines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_type TEXT NOT NULL,  -- 'phone', 'blink', 'screen', 'hydration'
    rolling_mean REAL NOT NULL,
    rolling_stddev REAL NOT NULL,
    sample_count INTEGER NOT NULL,
    last_updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Alert decision log (for explainability & debugging)
CREATE TABLE alert_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    context TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    threshold_used REAL,
    actual_value REAL,
    user_dismissed BOOLEAN DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Context tracking
CREATE TABLE context_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_type TEXT NOT NULL,  -- 'work', 'meeting', 'leisure', 'break'
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    total_duration_sec INTEGER,
    avg_focus_score REAL,
    blink_rate_avg REAL
);
```

---

## 4. Acceptance Criteria

### 4.1 Threshold Accuracy
- [ ] HP dipegang <15s (context: work): NO alert
- [ ] HP dipegang 15–29s (context: work): WARNING alert
- [ ] HP dipegang ≥30s (context: work): CRITICAL alert
- [ ] HP check 5s (context: meeting): NO alert (disabled)
- [ ] Blink rate 10/min (baseline 14/min): NO alert (within 30% tolerance)
- [ ] Blink rate 6/min (baseline 14/min): WARNING alert (<50% baseline)
- [ ] Blink rate 4/min (baseline 14/min): CRITICAL alert (<70% baseline)
- [ ] Screen time 40 min (context: work, baseline 45 min): NO alert
- [ ] Screen time 60 min (context: work, baseline 45 min): WARNING alert
- [ ] Screen time 75 min (context: work, baseline 45 min): CRITICAL alert

### 4.2 Adaptive Learning
- [ ] Baseline μ_phone updates setelah 7 hari usage
- [ ] Cold start: Default thresholds minggu pertama
- [ ] User dengan pola kerja 2-jam-session: threshold screen time adapt ke 2h+ warning

### 4.3 Context Awareness
- [ ] Video call detected → phone & screen alerts DISABLED
- [ ] Keyboard typing motion detected → context = WORK
- [ ] Face absent >2 min → context = BREAK, all alerts paused kecuali hydration

### 4.4 Cooldown & UX
- [ ] Alert sama tidak muncul lagi dalam 15 menit
- [ ] Critical alert override cooldown jika severity escalate dari warning
- [ ] Reasoning panel expandable di setiap alert
- [ ] User dismiss alert → log ke database untuk future learning

### 4.5 Performance
- [ ] Face/eye detection: maintain 6–7 FPS (150ms/tick)
- [ ] YOLO detection: 2 FPS (450ms/tick) without blocking face thread
- [ ] CPU usage: <15% average on i5-1135G7 (current laptop)
- [ ] No frame drops saat CPU load 80%+

---

## 5. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Adaptive thresholds terlalu permissive (tidak alert sama sekali) | HIGH | Enforce minimum floor: phone >60s always critical, blink <3/min always critical |
| Learning window terlalu pendek (baseline tidak stabil) | MEDIUM | Require minimum 3 hari data sebelum adaptive mode active |
| Context inference salah (meeting vs leisure) | MEDIUM | Fallback ke conservative thresholds jika confidence <0.7 |
| Multi-threading race condition | HIGH | Lock-free queue, atomic state variables, thorough thread safety testing |
| Database schema migration existing users | LOW | SQLite migration script, backward compatible JSON fallback |

---

## 6. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Refactor `vision_daemon.cpp` ke multi-threaded architecture
- [ ] Add context inference basic (work vs leisure detection)
- [ ] Implement severity enum (Info/Warning/Critical)
- [ ] Update JSON telemetry schema with severity & context fields

### Phase 2: Adaptive Engine (Week 2)
- [ ] Create `adaptive_thresholds.rs` module
- [ ] Implement RollingStats baseline tracker
- [ ] Database schema migration (add baselines table)
- [ ] Cold start default thresholds

### Phase 3: Decision Logic (Week 3)
- [ ] Refactor decision engine with cooldown
- [ ] Context-aware threshold adjustment
- [ ] Explainability reasoning strings
- [ ] Alert deduplication & prioritization

### Phase 4: UI & Feedback (Week 4)
- [ ] Severity-based alert styling (info/warning/critical)
- [ ] Reasoning panel expandable UI
- [ ] Cooldown visual indicator
- [ ] User dismiss tracking

### Phase 5: Testing & Tuning (Week 5)
- [ ] Unit tests: threshold calculations
- [ ] Integration tests: multi-threaded pipeline
- [ ] Real-world pilot: 5 users x 7 days
- [ ] Baseline convergence analysis

---

## 7. Success Metrics

| Metric | Current | Target (Post-Refactor) |
|---|---|---|
| False positive rate (alert tanpa alasan valid) | ~40% | <10% |
| User alert dismiss rate (annoyance indicator) | ~60% | <20% |
| Adaptive threshold accuracy (alert tepat waktu) | N/A | >85% |
| Context classification accuracy | N/A | >80% |
| Frame rate stability (no drops) | 2.2 FPS (blocking) | 6–7 FPS (async) |
| CPU overhead | ~25% | <15% |

---

## 8. Open Questions

1. **Learning rate:** Apakah 7 hari cukup untuk baseline stabil? Atau perlu 14 hari?
2. **Context signals:** Selain typing & video call, apa signal lain untuk detect meeting vs work?
3. **Notification fatigue:** Apakah 15 menit cooldown terlalu lama untuk critical alert?
4. **Posture tracking:** Apakah perlu tambah slouch detection untuk ergonomic alert?
5. **Circadian rhythm:** Apakah threshold perlu adjust based on time of day (pagi vs malam)?

---

## 9. References

- Eye Aspect Ratio (EAR): Soukupová & Čech, 2016
- Blink rate normal: 12–15/min (Bentivoglio et al., 1997)
- 20-20-20 rule: American Optometric Association
- Activity recognition: OpenCV Optical Flow + Gesture Recognition
- Adaptive thresholds: Z-score outlier detection (μ ± 2σ)

---

**Next Steps:**
1. Review plan dengan stakeholder
2. Prioritize phases berdasar impact vs effort
3. Setup test environment dengan sample users
4. Begin Phase 1 implementation

**Estimated Total Effort:** 5 minggu (1 developer full-time)
