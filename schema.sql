-- Skema Basis Data Lokal SQLite OptiHabit (On-Device Storage)
-- Jalur penyimpanan: ~/.local/share/optihabit/data.db

-- 1. Sesi Kehadiran & Layar Pengguna
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_start DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    session_end DATETIME,
    total_screen_time_seconds INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Log Peristiwa Deteksi Kebiasaan Real-time
CREATE TABLE IF NOT EXISTS habit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    event_type TEXT NOT NULL CHECK(event_type IN ('blink_strain', 'phone_distraction', 'hydration', 'screen_break')),
    duration_seconds INTEGER DEFAULT 0,
    metadata_json TEXT, -- menyimpan detail teknis: misal nilai EAR, confidence score
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES user_sessions(id) ON DELETE CASCADE
);

-- 3. Agregasi Skor Produktivitas & Kesehatan Harian
CREATE TABLE IF NOT EXISTS daily_habit_metrics (
    date TEXT PRIMARY KEY, -- Format YYYY-MM-DD
    total_screen_time_minutes INTEGER NOT NULL DEFAULT 0,
    phone_distraction_seconds INTEGER NOT NULL DEFAULT 0,
    hydration_count INTEGER NOT NULL DEFAULT 0,
    blink_fatigue_instances INTEGER NOT NULL DEFAULT 0,
    productivity_score INTEGER NOT NULL DEFAULT 100 CHECK(productivity_score BETWEEN 0 AND 100),
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Pengaturan Konfigurasi & Ambang Batas Pengguna
CREATE TABLE IF NOT EXISTS user_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indeks untuk query performa analitik
CREATE INDEX IF NOT EXISTS idx_habit_events_created_at ON habit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_habit_events_type ON habit_events(event_type);
