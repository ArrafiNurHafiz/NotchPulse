# Product Requirements Document (PRD)

> **Document Status:** Approved  
> **Last Updated:** 2026-10-29  
> **Product Manager:** Arrafi Nur Hafiz  
> **Target Platform:** Desktop Native (Linux, Windows, macOS) via Tauri v2  

---

## Executive Summary

**Product Name:** OptiHabit

**Problem Statement:**  
Pekerja profesional dan pelajar sering mengalami kelelahan mata digital, dehidrasi, postur statis, dan distraksi gawai tanpa sadar saat berada di depan laptop. Sebagian besar aplikasi produktivitas berbasis timer manual yang mudah diabaikan serta tidak peka terhadap kebiasaan fisik pengguna di dunia nyata.

**Proposed Solution:**  
OptiHabit adalah aplikasi desktop dengan antarmuka Dynamic Island melayang di bagian atas layar laptop yang menggunakan pipeline penglihatan komputer (computer vision) on-device (Face Mesh + YOLOv8-nano). Aplikasi mendeteksi frekuensi berkedip, asupan cairan, penggunaan ponsel pintar, dan durasi menatap layar secara otomatis dan menjaga privasi penuh tanpa pengunggahan video/frame ke internet.

**Success Metrics:**  
- Tingkat latensi deteksi on-device < 50ms per batch inferensi.
- Penggunaan sumber daya sistem: CPU < 8%, RAM < 80MB saat berjalan di latar belakang.
- Penurunan durasi menatap layar tanpa jeda sebesar 30% pada minggu pertama penggunaan.
- Adopsi model freemium: 5% conversion rate dari pengguna gratis ke langganan berbayar (Pro).

**Launch Target:** Q1 2027

---

## Background & Context

### Why Now?
Kesadaran ergonomi kerja hibrida meningkat tajam. Pada saat yang sama, pemrosesan on-device (NPU / GPU modern / ONNX Runtime) memungkinkan model komputer visi berjalan langsung di perangkat pengguna secara hemat energi tanpa mengorbankan privasi.

### Differentiation
- **100% On-Device & Privacy First:** Aliran kamera hanya diproses di memori volatil (RAM) lokal dan dibuang seketika; tidak ada video yang direkam atau dikirim ke peladen luar.
- **Dynamic Island Native UI:** Overlay minimalis tanpa mengganggu ruang kerja aktif atau jendela aplikasi lain.
- **Multimodal Habit Tracking:** Menggabungkan analisis biologis (kedipan mata) dan perilaku (minum, pegang ponsel) dalam satu sistem terpadu.

---

## Goals & Success Criteria

### Business Goals
1. Memvalidasi kebutuhan pasar solusi digital wellness desktop berbasis model freemium.
2. Memperoleh 1.000 pengguna aktif harian (DAU) organik dalam bulan pertama peluncuran.
3. Mencapai konversi lisensi Pro sebesar 5% dari basis pengguna aktif.

### User Goals
1. Mengurangi ketegangan mata kering akibat frekuensi berkedip yang rendah saat bekerja intensif.
2. Mempertahankan hidrasi tubuh teratur tanpa perlu pencatatan manual.
3. Memutus siklus distraksi doomscrolling saat berada di jam kerja produktif.

### Success Metrics (Detailed)

| Metric | Baseline | Target | Timeframe | Measurement Method |
|---|---|---|---|---|
| Latensi Inferensi | - | < 50 ms | Peluncuran | Rust internal timer telemetry |
| RAM Footprint | ~200MB (Electron) | < 80 MB | Peluncuran | System process monitor |
| Akurasi Deteksi Ponsel | 80% | > 92% | Tahap Uji PoC | Matrix IoU & F1-score pengujian |
| Akurasi Deteksi Minum | 75% | > 90% | Tahap Uji PoC | Intersection landmark bibir & wadah |

### Non-Goals (Out of Scope)
- Bukan perangkat pengawasan karyawan (tidak ada fitur tangkapan layar atau pengawasan ke manajer).
- Tidak menyimpan rekaman video mentah di disk lokal.
- Tidak menyertakan pelacakan gawai seluler dari sisi sistem operasi ponsel (deteksi murni berbasis pandangan kamera laptop).

---

## User Personas & Use Cases

### Primary Persona: Professional Remote Worker / Software Engineer
- **Peran:** Pekerja jarak jauh / pengembang peranti lunak dengan screen time > 8 jam/hari.
- **Masalah:** Mata lelah/kering, lupa minum air berjam-jam, sering membuka ponsel tanpa sadar di tengah alur kerja.
- **Tingkat Kemahiran:** Menengah hingga mahir.
- **Konteks Penggunaan:** Menggunakan laptop atau monitor eksternal di ruang kerja.

### Key Use Cases

#### 1. Peringatan Berkedip & Kelelahan Mata (Eye Strain Relief)
- **Kondisi Awal:** Pengguna fokus menatap layar laptop selama bekerja.
- **Alur:**
  1. Modul penglihatan membaca landmark mata dan menghitung Eye Aspect Ratio (EAR).
  2. EAR mengidentifikasi frekuensi kedip turun di bawah 12 kedipan/menit selama 45 detik.
  3. Dynamic Island melebar halus menampilkan mikro-animasi denyut: "Kedipkan mata sejenak".
  4. Pengguna berkedip sadar; indikator kembali ke bentuk pil minimalis.
- **Hasil:** Mata pengguna terjaga kelembapannya secara teratur.

#### 2. Deteksi Distraksi Ponsel Pintar
- **Kondisi Awal:** Pengguna berada dalam sesi kerja fokus.
- **Alur:**
  1. Pengguna mengangkat ponsel ke arah pandangan wajah.
  2. YOLOv8-nano mendeteksi kelas `cell phone` stabil selama > 5 detik di area pandang.
  3. Dynamic Island membesar menjadi peringatan oranye dan menampilkan penghitung waktu distraksi live.
  4. Pengguna menurunkan ponsel; Dynamic Island mencatat durasi distraksi dan kembali ke mode idle.
- **Hasil:** Memutus siklus distraksi sebelum menjadi doomscrolling berkepanjangan.

#### 3. Pemantauan Asupan Cairan (Hydration Tracker)
- **Kondisi Awal:** Pengguna bekerja sepanjang hari.
- **Alur:**
  1. Modul mendeteksi objek `bottle` atau `cup` mendekati bibir/landmark mulut bawah (gestur minum).
  2. Sistem mencatat 1 interaksi minum ke basis data lokal SQLite.
  3. Jika tidak ada interaksi minum selama > 75 menit saat pengguna aktif di depan laptop, Dynamic Island menampilkan ikon tetesan air lembut.
- **Hasil:** Target hidrasi harian tercapai tanpa input manual.

---

## Technical Specifications

### Architecture Overview
- **UI & Overlay Shell:** Tauri v2 + Rust + React / Tailwind CSS. Jendela transparan `always-on-top`, tanpa dekorasi window OS.
- **Computer Vision Pipeline:** Rust backend memanfaatkan model ONNX Runtime lokal:
  - *Pipeline A:* MediaPipe Face Mesh (468 3D facial landmarks) untuk EAR dan estimasi orientasi kepala.
  - *Pipeline B:* YOLOv8-nano (kelas: cell phone, bottle, cup) dioptimalkan dengan kuantisasi INT8 / FP16.
- **Inter-process Communication (IPC):** Event stream asinkron `tauri::emit` mengirimkan status komputasi tanpa pembebanan siklus render antarmuka web.
- **Data Persistence:** SQLite lokal terenkripsi di perangkat pengguna (`~/.local/share/optihabit/data.db`).

---

## Monetization Model (Freemium SaaS)

1. **Paket Free:**
   - Dynamic Island HUD real-time.
   - Peringatan live (mata, minum, ponsel).
   - Privasi penuh lokal.

2. **Paket Pro (Bulanan / Tahunan):**
   - Agregasi skor produktivitas harian dan tren mingguan/bulanan.
   - Analitik mendalam: Heatmap fokus kerja dan korelasi jeda istirahat terhadap performa.
   - Mode Pomodoro otomatis cerdas berbasis pengenalan kehadiran wajah.
   - Kostumisasi tema, ukuran, dan posisi Dynamic Island.
