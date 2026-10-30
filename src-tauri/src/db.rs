use rusqlite::{params, Connection, Result};
use std::path::Path;

pub struct DatabaseManager {
    conn: Connection,
}

impl DatabaseManager {
    // Inisialisasi koneksi file atau in-memory untuk testing
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        let manager = Self { conn };
        manager.init_tables()?;
        Ok(manager)
    }

    pub fn new_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let manager = Self { conn };
        manager.init_tables()?;
        Ok(manager)
    }

    fn init_tables(&self) -> Result<()> {
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS user_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_start DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                session_end DATETIME,
                total_screen_time_seconds INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS habit_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER,
                event_type TEXT NOT NULL,
                duration_seconds INTEGER DEFAULT 0,
                metadata_json TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS daily_habit_metrics (
                date TEXT PRIMARY KEY,
                total_screen_time_minutes INTEGER NOT NULL DEFAULT 0,
                phone_distraction_seconds INTEGER NOT NULL DEFAULT 0,
                hydration_count INTEGER NOT NULL DEFAULT 0,
                blink_fatigue_instances INTEGER NOT NULL DEFAULT 0,
                productivity_score INTEGER NOT NULL DEFAULT 100,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS user_preferences (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS user_baselines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric_type TEXT NOT NULL UNIQUE,
                rolling_mean REAL NOT NULL DEFAULT 0.0,
                rolling_stddev REAL NOT NULL DEFAULT 1.0,
                sample_count INTEGER NOT NULL DEFAULT 0,
                last_updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            "#,
        )?;
        Ok(())
    }

    // Catat log event kebiasaan
    pub fn log_event(&self, session_id: Option<i64>, event_type: &str, duration_seconds: i32, metadata: &str) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO habit_events (session_id, event_type, duration_seconds, metadata_json) VALUES (?1, ?2, ?3, ?4)",
            params![session_id, event_type, duration_seconds, metadata],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    // Perbarui agregasi metrik harian
    pub fn upsert_daily_metrics(
        &self,
        date: &str,
        add_screen_time_min: i32,
        add_phone_sec: i32,
        add_hydration: i32,
        add_blink_fatigue: i32,
    ) -> Result<()> {
        self.conn.execute(
            r#"
            INSERT INTO daily_habit_metrics (
                date, total_screen_time_minutes, phone_distraction_seconds, 
                hydration_count, blink_fatigue_instances, productivity_score
            ) VALUES (?1, ?2, ?3, ?4, ?5, 100)
            ON CONFLICT(date) DO UPDATE SET
                total_screen_time_minutes = total_screen_time_minutes + excluded.total_screen_time_minutes,
                phone_distraction_seconds = phone_distraction_seconds + excluded.phone_distraction_seconds,
                hydration_count = hydration_count + excluded.hydration_count,
                blink_fatigue_instances = blink_fatigue_instances + excluded.blink_fatigue_instances,
                productivity_score = MAX(20, 100 - ((total_screen_time_minutes / 30) + (phone_distraction_seconds / 60) * 2 + (blink_fatigue_instances * 5)) + (hydration_count * 3)),
                updated_at = CURRENT_TIMESTAMP;
            "#,
            params![date, add_screen_time_min, add_phone_sec, add_hydration, add_blink_fatigue],
        )?;
        Ok(())
    }

    // Ambil metrik hari ini
    pub fn get_daily_metrics(&self, date: &str) -> Result<Option<(i32, i32, i32, i32, i32)>> {
        let mut stmt = self.conn.prepare(
            "SELECT total_screen_time_minutes, phone_distraction_seconds, hydration_count, blink_fatigue_instances, productivity_score FROM daily_habit_metrics WHERE date = ?1"
        )?;
        let mut rows = stmt.query(params![date])?;
        if let Some(row) = rows.next()? {
            Ok(Some((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)))
        } else {
            Ok(None)
        }
    }

    // Tambah satu gelas air langsung (Quick Action)
    pub fn add_hydration_log(&self, date: &str) -> Result<()> {
        self.upsert_daily_metrics(date, 0, 0, 1, 0)
    }

    // Catat sesi break timer selesai
    pub fn log_break_completed(&self, duration_sec: i32) -> Result<i64> {
        self.log_event(None, "break_timer", duration_sec, "{}")
    }

    // Catat poke maskot interaktif
    pub fn log_mascot_interaction(&self) -> Result<i64> {
        self.log_event(None, "mascot_poke", 0, "{}")
    }

    // === ADAPTIVE BASELINE MANAGEMENT ===
    
    // Ambil baseline untuk metric tertentu (phone, blink, screen, hydration)
    pub fn get_baseline(&self, metric_type: &str) -> Result<Option<(f64, f64, i32)>> {
        let mut stmt = self.conn.prepare(
            "SELECT rolling_mean, rolling_stddev, sample_count FROM user_baselines WHERE metric_type = ?1"
        )?;
        let mut rows = stmt.query(params![metric_type])?;
        if let Some(row) = rows.next()? {
            Ok(Some((row.get(0)?, row.get(1)?, row.get(2)?)))
        } else {
            Ok(None)
        }
    }

    // Update atau insert baseline
    pub fn upsert_baseline(&self, metric_type: &str, mean: f64, stddev: f64, sample_count: i32) -> Result<()> {
        self.conn.execute(
            r#"
            INSERT INTO user_baselines (metric_type, rolling_mean, rolling_stddev, sample_count, last_updated)
            VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
            ON CONFLICT(metric_type) DO UPDATE SET
                rolling_mean = excluded.rolling_mean,
                rolling_stddev = excluded.rolling_stddev,
                sample_count = excluded.sample_count,
                last_updated = CURRENT_TIMESTAMP
            "#,
            params![metric_type, mean, stddev, sample_count],
        )?;
        Ok(())
    }

    // Inisialisasi baseline default untuk cold start
    pub fn init_default_baselines(&self) -> Result<()> {
        self.upsert_baseline("phone", 12.0, 4.0, 0)?;
        self.upsert_baseline("blink", 14.0, 3.0, 0)?;
        self.upsert_baseline("screen", 45.0, 15.0, 0)?;
        self.upsert_baseline("hydration", 60.0, 15.0, 0)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_db_init_and_event_logging() {
        let db = DatabaseManager::new_in_memory().expect("Gagal buat in-memory db");
        let id = db.log_event(None, "hydration", 0, "{}").expect("Gagal catat event");
        assert_eq!(id, 1);
    }

    #[test]
    fn test_daily_metrics_upsert_and_score_calculation() {
        let db = DatabaseManager::new_in_memory().expect("Gagal in-memory db");
        let today = "2026-10-29";
        
        // Catat aktivitas awal
        db.upsert_daily_metrics(today, 60, 30, 2, 1).expect("Gagal upsert");
        let metrics = db.get_daily_metrics(today).expect("Gagal query").unwrap();
        
        assert_eq!(metrics.0, 60); // screen time 60m
        assert_eq!(metrics.1, 30); // phone distraction 30s
        assert_eq!(metrics.2, 2);  // hydration 2x
        assert_eq!(metrics.3, 1);  // blink fatigue 1x
        assert!(metrics.4 > 0 && metrics.4 <= 100); // score 0-100
    }
}
