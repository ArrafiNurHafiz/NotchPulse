# Work Plan: NotchPulse Adaptive UI/UX Evolution (Coucou-Inspired)

> **Status:** Pending Approval  
> **Target:** Menyempurnakan NotchPulse dengan sistem animasi Dynamic Island adaptif berbasis referensi Coucou (`Louis-CFM/coucou`).

---

## 1. Requirements & Core Objectives
1. **Adaptive Notch States:**
   - **Hidden/Wake State:** Berada di tepi atas dengan tinggi minimal (~6px atau pill mini), otomatis melebar saat didekati kursor (hover).
   - **Compact State (Idle):** Pill hitam pekat (210x32 px) menempel di bezel atas, menampilkan indikator denyut kesehatan kerja, jam/status, dan avatar maskot mikro.
   - **Contextual Alert State:** Pill melebar dinamis (340x40 px) saat deteksi mata lelah, hidrasi, atau distraksi ponsel aktif dengan aksen warna kontekstual (Cyan, Amber, Blue, Purple).
   - **Expanded State (Dashboard/Card):** Melebar mulus (400x170 px) ke bawah saat diklik, menampilkan rincian metrik, streak fokus, dan kontrol cepat.
2. **Smooth Physics-Based Spring/Bézier Transitions:**
   - Kurva transisi Apple/Coucou: `cubic-bezier(0.16, 1, 0.3, 1)` untuk dimensi `width`, `height`, dan `transform`.
3. **Smart Mouse Interaction & Click-Through:**
   - Mendukung mode auto-collapse setelah pointer meninggalkan area pulau (timer 3-5 detik kecuali sedang di-pin atau ada aksi aktif).
   - Non-intrusif: Tidak mencuri fokus keyboard pengguna saat sedang mengetik kode/pekerjaan lain.

---

## 2. Implementation Steps

### Tahap 1: Refactoring State Machine UI (`src/App.tsx`)
- Implementasikan mode tampilan terstruktur:
  - `compact` (default mengambang di bezel)
  - `alert` (melebar otomatis saat event kamera/kebiasaan terpicu)
  - `expanded` (dasbor kontrol & analitik lengkap)
- Tambahkan pendeteksi hover kursor (`onMouseEnter` / `onMouseLeave`) dengan debounce auto-close seperti Coucou.

### Tahap 2: Polish Visual & Apple-Grade Typography (`src/App.css`)
- Tambahkan style Coucou notch:
  - Drop curve khusus: `border-radius: 0 0 18px 18px`
  - Subtle hairline border: `border: 1px solid rgba(255, 255, 255, 0.08)`
  - Backdrop blur pekat: `backdrop-filter: blur(24px); background: rgba(0, 0, 0, 0.92);`
- Elemen mikro-interaksi:
  - Mini habit tracker indicator (titik status warna-warni di sisi kanan notch)
  - Ticker live text untuk pesan kebiasaan

### Tahap 3: Penyesuaian Ukuran Jendela Dinamis di Tauri (`src-tauri/src/lib.rs`)
- Tambahkan Tauri IPC command `resize_island(width, height)` agar jendela webview menyesuaikan ukuran sebenarnya tanpa memblokir klik desktop di luar area pill.

### Tahap 4: Verifikasi & Testing
- Verifikasi build frontend: `npm run build`
- Verifikasi test Rust: `cargo test`
- Validasi visual langsung di Hyprland desktop

---

## 3. Acceptance Criteria
- [ ] Notch menempel sempurna di bezel atas (`y = 0`) dengan sudut atas rata dan sudut bawah membulat.
- [ ] Hover atau klik membuka tampilan transisi mulus tanpa patah/glitch visual.
- [ ] Alert deteksi (mata, hidrasi, ponsel) memicu ekspansi horizontal otomatis secara elegan.
- [ ] Area desktop di luar pulau tetap dapat diklik normal (tidak terhalang kotak transparan kosong).
