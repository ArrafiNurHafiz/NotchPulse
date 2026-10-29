# OptiHabit — On-Device Computer Vision Dynamic Island for Laptop Productivity & Wellness

> **Elevator Pitch:** OptiHabit menghadirkan Dynamic Island melayang di layar laptop yang secara pasif menjaga kesehatan dan fokus pengguna menggunakan Computer Vision on-device tanpa mengorbankan privasi.

---

## 1. Problem & Market Gap
1. **Digital Eye Strain (DES):** Rata-rata orang berkedip 15-20x/menit, namun turun drastis menjadi < 5x/menit saat menatap monitor. Menyebabkan mata kering, perih, dan buram.
2. **Dehidrasi Kronis Saat Bekerja:** Pekerja kantoran dan programmer sering lupa minum selama berjam-jam saat deep focus.
3. **Micro-distractions & Doomscrolling:** Menjangkau ponsel pintar di meja tanpa disadari memecah alur fokus (flow state) hingga butuh 23 menit untuk kembali fokus penuh.
4. **Isu Privasi Aplikasi Kamera Tradisional:** Pengguna menolak aplikasi pemantau yang mengunggah rekaman video ke server cloud karena ancaman kebocoran privasi.

---

## 2. Solusi OptiHabit
- **100% On-Device:** Seluruh pipeline visual (MediaPipe Face Mesh + YOLOv8-nano) diproses di memori volatil lokal laptop. Nol frame gambar disimpan ke disk atau diunggah ke internet.
- **Dynamic Island Native HUD:** Desain kapsul melayang (420x180 px transparan) di tengah atas layar:
  - **Idle Mode:** Pil hitam elegan minimalis menampilkan skor fokus real-time.
  - **Pulsing Alert Mode:** Animasi visual kontekstual halus (Cyan: Kedip Mata, Amber: HP terdeteksi, Biru: Minum air, Ungu: Istirahat 20-20-20).
  - **Expanded Mode:** Klik untuk melihat dasbor kebiasaan harian secara komprehensif.

---

## 3. Tech Stack & Keunggulan Rekayasa
- **Platform:** Tauri v2 (Rust Backend + React 19 / TypeScript / Tailwind CSS v4).
- **Footprint Ringan:** RAM < 60MB, CPU idle < 5% (berbeda jauh dari aplikasi Electron yang memakan >300MB RAM).
- **Algoritma Deteksi:**
  - *Eye Aspect Ratio (EAR):* Mengukur rasio jarak vertikal dan horizontal 6 facial landmarks kelopak mata.
  - *IoU Bounding Box Intersection:* Mendeteksi gestur minum saat wadah minuman berpotongan dengan area bibir.
  - *State Machine Thresholding:* Membedakan mengambil ponsel sesaat vs distraksi terus-menerus (>5 detik).
- **Local Persistence:** Embedded SQLite (`rusqlite`) dengan perhitungan agregasi otomatis *Productivity Score* harian.

---

## 4. Model Bisnis (Freemium Commercialization)
- **Free Tier (Zero Friction):**
  - Dynamic Island pill overlay.
  - Peringatan live kedipan mata, minum air, distraksi ponsel, dan jeda 20-20-20.
  - 100% perlindungan privasi lokal.
- **Pro Tier ($4.99/bulan atau $39/tahun):**
  - Analisis tren mingguan/bulanan & habit score.
  - Heatmap fokus produktivitas.
  - Smart Pomodoro tersinkronisasi kehadiran wajah.
  - Kustomisasi tema warna, posisi, dan sensitivitas sensor.
- **B2B Corporate Wellness:**
  - Lisensi korporat untuk perusahaan yang peduli pada ergonomi kesehatan karyawan jarak jauh.

---

## 5. Ringkasan Hasil Validasi Teknis
- **Unit Testing Suite:** 6/6 modul pengujian Rust lulus (EAR calculation, Drinking gesture, Phone distraction threshold, SQLite init, Upsert daily metrics).
- **Frontend Build:** Lulus verifikasi lint dan type check TypeScript v6 + Vite v8 client build.
- **Native Binary:** Kompilasi biner `src-tauri/target/debug/optihabit` selesai dan siap dijalankan.
