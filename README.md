# NotchPulse

> On-Device Computer Vision Dynamic Island for Laptop Productivity & Digital Wellness.

NotchPulse adalah aplikasi desktop berbasis Tauri v2 yang menghadirkan **Dynamic Island** melayang di bagian atas layar laptop. Sistem mendeteksi pola kebiasaan kerja dan kesehatan secara pasif, privat, dan on-device tanpa merekam atau mengunggah aliran video ke peladen luar.

---

## Fitur Utama

- **100% On-Device & Privacy-First:** Video frame kamera hanya diproses langsung di memori volatil (RAM) lokal dan dibuang seketika.
- **Dynamic Island Native HUD:**
  - *Idle State:* Pill minimalis elegan penunjuk skor produktivitas real-time.
  - *Contextual Alert:* Animasi denyut halus (Kedip Mata, Distraksi HP, Hidrasi, dan Jeda 20-20-20).
  - *Expanded Dashboard:* Tinjauan metrik kebiasaan kerja dan tombol simulasi uji interaktif.
- **Multi-Pipeline Heuristics:**
  - Eye Aspect Ratio (EAR) untuk deteksi mata lelah dan frekuensi berkedip rendah.
  - Bounding Box Intersection untuk gestur asupan cairan (minum air).
  - Ambang batas waktu durasi ponsel aktif di depan wajah (>5 detik).
  - Pengingat aturan 20-20-20 untuk istirahat mata berkala.
- **Persistensi Lokal Embedded:** Agregasi log kebiasaan dan penghitungan skor produktivitas harian menggunakan SQLite lokal (`rusqlite`).

---

## Tech Stack

- **Desktop Shell & Overlay:** [Tauri v2](https://tauri.app/) (Rust)
- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Vite v8
- **Data Layer:** SQLite Embedded (Rusqlite Bundled)
- **Computer Vision Logic:** Pure Rust Mathematical & Geometrical State Machine (EAR & IoU)

---

## Memulai Pengembangan

### Prasyarat

- Node.js (v18+)
- Rust & Cargo (1.80+)
- Dependensi sistem Linux untuk Tauri v2 (`webkit2gtk`, `libsoup3`, dll.)

### Pemasangan Cepat (1-Langkah)

Jalankan skrip pemasangan otomatis universal untuk Linux laptop:
```bash
bash install.sh
```
Skrip akan memasang biner ke `~/.local/bin/notchpulse`, mendaftarkan menu desktop launcher, dan mengonfigurasi autostart saat laptop menyala.

### Pemasangan Manual & Menjalankan

1. Pasang dependensi frontend:
   ```bash
   npm install
   ```

2. Jalankan unit test engine logika Rust:
   ```bash
   cd src-tauri && cargo test
   ```

3. Jalankan aplikasi mode pengembangan desktop:
   ```bash
   npm run tauri dev
   ```

4. Kompilasi biner rilis:
   ```bash
   npm run tauri build
   ```

---

## Lisensi

Dibuat untuk inovasi digital wellness dan produktivitas kerja masa kini.
