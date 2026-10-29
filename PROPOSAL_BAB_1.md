# BAB I. PENDAHULUAN

## 1.1 Latar Belakang dan Urgensi Permasalahan

Transformasi digital yang kian masif telah menempatkan Generasi Z dan Milenial pada episentrum paparan teknologi berintensitas tinggi. Sebagai kelompok *digital native*, aktivitas kerja, akademik, dan sosial mereka terikat pada penggunaan perangkat berlayar (*Visual Display Terminals* / VDT) seperti laptop dan ponsel pintar (*smartphone*) selama lebih dari 8–10 jam per hari. Keterikatan digital yang kronis ini tidak hanya mengubah pola interaksi sosial menjadi pasif dan menimbulkan kecemasan psikologis (Twenge et al., 2019; Zis et al., 2021), melainkan melahirkan krisis kesehatan ergonomis yang nyata dan sering kali diabaikan.

Secara klinis, ancaman kesehatan primer akibat paparan layar berkepanjangan termanifestasi dalam sindrom *Digital Eye Strain* (DES) atau *Computer Vision Syndrome* (CVS) yang kini diderita oleh lebih dari 65–70% pengguna komputer aktif (Ccami-Bernal et al., 2024; Sheppard & Wolffsohn, 2018). Gangguan ini dipicu oleh disfungsi okulomotorik: saat seseorang berkonsentrasi menatap layar digital, frekuensi kedipan mata spontan (*blink rate*) merosot drastis dari ambang batas fisiologis normal (15–20 kali/menit) menjadi kurang dari 5–7 kali/menit, disertai tingginya rasio kedipan tidak sempurna (*incomplete blinks*) (Al-Mohtaseb et al., 2021). Kondisi hipobliselektif tersebut mempercepat penguapan lapisan air mata (*tear film breakup*), merusak homeostasis permukaan kornea, serta menimbulkan gejala mata kering, perih, iritasi, hingga gangguan akomodasi visual.

Di samping gangguan ocular, pola kerja digital yang statis mendorong terjadinya *dehidrasi subklinis*. Keterlibatan mendalam pada layar monitor (*cognitive absorption*) menekan persepsi rasa haus, sehingga pengguna kerap mengabaikan asupan cairan selama berjam-jam. Defisit cairan tubuh ringan sebesar 1–2% saja telah terbukti secara metabolik meningkatkan kelelahan subjektif (*fatigue*), menginduksi sakit kepala, serta menurunkan fungsi memori kerja dan atensi eksekutif (Armstrong et al., 2012). Beban fisiologis ini diperburuk oleh kebiasaan memegang ponsel pintar di sela-sela jam kerja (*multitasking gawai*). Interupsi konstan dari ponsel memicu fragmentasi kognitif dan pelepasan hormon stres (kortisol), di mana individu memerlukan rata-rata 23 menit hanya untuk memulihkan alur konsentrasi (*resumption lag*) setelah terdistraksi (Kushlev et al., 2016; Mark et al., 2008).

Kesenjangan kritisnya, intervensi kesehatan digital yang beredar saat ini umumnya berupa aplikasi pengingat manual atau *timer* statis yang kaku. Pendekatan berbasis alarm waktu terbukti memiliki tingkat kepatuhan rendah dan menghambat pembentukan kebiasaan otomatis (*automaticity*) karena sering diabaikan oleh pengguna yang sedang sibuk (Stawarz et al., 2015). Di sisi lain, solusi pemantauan berbasis kamera sering kali ditolak karena risiko privasi pengawasan video. Oleh sebab itu, urgensi penelitian ini terletak pada pengembangan sistem intervensi kesehatan digital yang bekerja secara pasif, objektif, dan privat menggunakan komputasi tepi (*on-device vision*) tanpa perekaman video. Melalui antarmuka ergonomis *Dynamic Island*, sistem ini mampu mendeteksi penurunan kedipan mata (*Eye Aspect Ratio*), jeda hidrasi, dan distraksi ponsel secara *real-time* untuk menjaga kesehatan visual serta fisik pengguna laptop tanpa mengorbankan privasi.

---

## 1.2 Rumusan Masalah

Berdasarkan latar belakang klinis dan ergonomis di atas, rumusan masalah dalam penelitian ini adalah:

1. Bagaimana merancang pipeline visi komputer *on-device* yang mampu mendeteksi parameter kesehatan fisik (penurunan kedipan mata/EAR, gestur hidrasi, dan distraksi gawai seluler) secara *real-time* dan hemat daya tanpa melakukan transmisi data visual keluar perangkat?
2. Bagaimana mengimplementasikan antarmuka *Dynamic Island HUD* desktop yang menempel secara adaptif di bezel layar laptop (*notch*) serta mampu menyampaikan sinyal intervensi kesehatan secara halus (*ambient feedback*) tanpa memecah konsentrasi kerja pengguna?
3. Seberapa tinggi sensitivitas dan akurasi model heuristik deteksi kebiasaan kesehatan (*precision*, *recall*, dan *F1-score*), serta sejauh mana sistem mampu menekan penggunaan sumber daya komputasi (*CPU overhead* <8% dan RAM <80 MB) saat beroperasi kontinu?

---

## 1.3 Tujuan Penelitian

### 1.3.1 Tujuan Umum
Mengembangkan sistem intervensi ergonomi dan kebiasaan sehat berbasis visi komputer tepi (*on-device vision*) dengan antarmuka mikro *Dynamic Island* guna mencegah risiko *Digital Eye Strain*, dehidrasi subklinis, dan fragmentasi fokus pada pengguna laptop secara preventif dan menjaga privasi penuh.

### 1.3.2 Tujuan Khusus
1. Mengintegrasikan algoritma *Facial Mesh* untuk kalkulasi *Eye Aspect Ratio* (EAR) dan model deteksi objek ringan terkuantisasi guna mengenali pola kedipan mata abnormal, gestur minum cairan, dan keberadaan ponsel di area kerja secara simultan.
2. Membangun antarmuka *Dynamic Island* berbasis Tauri v2 dan Rust yang non-intrusif, transparan, dan responsif terhadap perubahan resolusi monitor laptop.
3. Menguji efektivitas sistem peringatan preventif (seperti panduan aturan 20-20-20 dan pengingat hidrasi berkala) dalam memicu kesadaran ergonomis pengguna.
4. Mengukur performa komputasi sistem meliputi latensi proses inferensi (<50 ms), konsumsi daya/CPU, serta memverifikasi jaminan privasi *zero-data-leakage*.

---

## 1.4 Batasan Masalah

1. **Parameter Kesehatan yang Dipantau:** Difokuskan pada tiga indikator kesehatan kerja digital primer: dinamika kedipan mata (EAR < 0.20 sebagai indikator mata tertutup/kelelahan visual), gestur minum (irisan spasial wadah minuman dengan bibir), dan durasi aktif ponsel pintar di depan layar (>5 detik).
2. **Platform & Lingkungan Operasional:** Sistem diimplementasikan pada perangkat laptop berspesifikasi standar yang menjalankan sistem operasi desktop (Linux/Windows) dengan webcam internal beresolusi minimal 720p.
3. **Privasi & Keamanan Citra:** Kamera hanya digunakan sebagai sensor komputasi lokal di memori volatil (RAM). Sistem secara ketat tidak menyimpan citra/video di penyimpanan disk maupun mentransmisikannya ke peladen awan (*cloud*).
4. **Penyimpanan Metrik Kesehatan:** Data riwayat kebiasaan dan skor kesehatan produktivitas diagregasi secara lokal menggunakan basis data *embedded* SQLite yang terisolasi di laptop pengguna.

---

## 1.5 Manfaat Penelitian

### 1.5.1 Manfaat Teoretis
1. Memperkaya literatur dalam bidang *Human-Computer Interaction* (HCI) dan *Preventive Digital Health* mengenai penerapan *ambient micro-intervention* untuk pembentukan kebiasaan sehat di tempat kerja.
2. Memberikan bukti empiris pemanfaatan visi komputer *edge computing* yang efisien dan mengutamakan etika perlindungan privasi (*privacy-by-design*).

### 1.5.2 Manfaat Praktis
1. **Bagi Kesehatan Pekerja Digital & Pelajar:** Memberikan proteksi aktif terhadap sindrom kelelahan mata digital (*Digital Eye Strain*), mencegah dehidrasi kronis saat bekerja, dan meningkatkan kualitas atensi kerja.
2. **Bagi Institusi & Perusahaan:** Mendukung terciptanya budaya kerja digital yang sehat (*workplace ergonomics and wellness*) yang secara langsung berkontribusi pada penurunan risiko *burnout* dan peningkatan produktivitas jangka panjang karyawan.
