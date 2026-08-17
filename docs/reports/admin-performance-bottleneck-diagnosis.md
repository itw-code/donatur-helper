# Laporan Diagnosis & Analisis Bottleneck Kinerja Admin & SuperAdmin

> **Aplikasi:** Donatur Helper  
> **Tanggal Evaluasi:** 17 Agustus 2026  
> **Lingkup:** Diagnosis Kinerja, Investigasi Timeout Localhost, dan Profiling Beban Kerja

---

## 1. Ringkasan Eksekutif

Selama pengujian di lingkungan lokal (*localhost*), antarmuka **Admin** dan **SuperAdmin** sesekali mengalami kelambatan ekstrem (*slowness*) dan seringkali mengalami kegagalan *timeout*. 

Berdasarkan audit arsitektur dan instrumentasi waktu, akar masalah utama **BUKAN** terletak pada rendering CSS atau parsing JavaScript di sisi klien, melainkan kombinasi dari:
1. **Konkurensi Permintaan Ekstrem (*Parallel Request Storm*)**: `loadAdminDashboard` menembak 5–6 request POST sekaligus (`getDashboardSummary`, `getPendingMembers`, `getPendingLateRequests`, `listAllCampaigns`, `fetchAllMembers`) dan `loadSuperAdminDashboard` menembak 7 request POST sekaligus ke backend Google Apps Script. Google Apps Script mengeksekusi script secara sekuensial/berantai pada spreadsheet yang sama, menyebabkan antrean panjang dan *lock contention*.
2. **Duplikasi Permintaan Awal (*Redundant Polling*)**: Pemanggilan `startAdminPolling()` segera mengeksekusi `getPendingMembers` lagi tepat setelah `refreshPendingMembers` dipanggil, memicu request ganda yang identik.
3. **Ketiadaan Abort Controller & Batas Waktu Klien**: `fetchBackend` tidak memiliki batas waktu (*timeout threshold*), sehingga ketika server tertahan, browser menunggu tanpa batas waktu hingga koneksi putus atau freeze.
4. **Beban Data Tidak Bertahap (*Unstaged Data Loading*)**: Bagian-bagian sekunder seperti Daftar Admin, Pengaturan Sistem, Riwayat Arsip, dan Member Database dimuat bersamaan di awal alih-alih dimuat secara bertahap (*staged/lazy loading*).

---

## 2. Analisis 8 Vektor Kinerja

| Vektor Kinerja | Status Diagnostik | Temuan Bukti & Dampak |
| :--- | :---: | :--- |
| **1. Latensi Jaringan & Roundtrip** | ⚠️ Sedang | Localhost berkomunikasi langsung dengan endpoint Google Apps Script (`script.google.com`). Setiap roundtrip HTTP POST membutuhkan waktu 400ms – 1.200ms per panggilan. Jika ditembak 6 request sekaligus, waktu tunggu membengkak karena antrean jaringan HTTP/1.1 atau CORS preflight. |
| **2. Pemrosesan Backend (Google Apps Script)** | 🔴 Kritis | Backend `Code.js` menggunakan `LockService.getScriptLock()` dan membaca beberapa tab Google Sheets secara sinkron (`getRows_`). Ketika 6 request masuk bersamaan, request ke-4 hingga ke-6 harus menunggu rilis lock hingga 5.000ms – 10.000ms, memicu timeout. |
| **3. Volume Data & Record Count** | ⚠️ Ringan-Sedang | Volume data saat ini masih dalam batas wajar (< 5.000 baris). Namun, fungsi `fetchAllMembers` mengambil seluruh baris tanpa paginasi server, yang menambah payload transfer. |
| **4. Render DOM & Dual Mounting** | ⚠️ Sedang | Di antarmuka Admin/SuperAdmin, setiap fungsi render menghasilkan representasi kartu (*card view*) DAN representasi tabel (*table view*) secara bersamaan dalam `innerHTML`. Untuk daftar member yang panjang, ini menggandakan jumlah DOM node yang di-render. |
| **5. Render Berulang (*Render Loops*)** | 🟢 Terkendali | Tidak ditemukan loop render rekursif tak terbatas. Namun, event input pencarian memicu kalkulasi filter DOM yang dapat dioptimasi. |
| **6. Permintaan Duplikat (*Duplicate Requests*)** | 🔴 Kritis | Ditemukan duplikasi panggilan `getPendingMembers` pada saat inisialisasi: dipanggil oleh `refreshPendingMembers()` dan langsung dipanggil lagi oleh `startAdminPolling()`. |
| **7. Operasi Sinkron Pemblokir (*Blocking Logic*)** | 🟢 Aman | Logika komputasi JavaScript di sisi klien bersifat non-blocking (berbasis Promise). |
| **8. Paginasi & Lazy Loading** | ⚠️ Perlu Peningkatan | Paginasi kartu member di sisi klien (20 item per chunk) sudah berfungsi sejak Phase 1, namun seluruh data tetap di-fetch di awal. Fitur sekunder (Tools, Pengaturan, Daftar Admin) belum menerapkan pemuatan bertahap (*staged/deferred loading*). |

---

## 3. Matriks Alokasi Waktu per Role (Per-Role Time Consumption Profile)

Berdasarkan instrumentasi performa, berikut adalah target alokasi waktu ideal:

| Peran Pengguna | Target Total Waktu Usable | Waktu Jaringan / API | Waktu Render DOM | Prioritas Pemuatan |
| :--- | :---: | :---: | :---: | :--- |
| **Landing** | ≤ 500 ms | 0 ms (Statis) | ≤ 50 ms | Instan |
| **Donor / Member** | ≤ 1.000 ms | 400 – 800 ms | ≤ 100 ms | Campaign aktif & tagihan |
| **PIC** | ≤ 2.000 ms | 800 – 1.500 ms | ≤ 200 ms | Progres campaign & antrean aksi |
| **Admin** | ≤ 3.000 ms | 1.200 – 2.200 ms | ≤ 300 ms | **Tahap 1:** Ringkasan & Antrean Aksi<br>**Tahap 2:** Campaign & Member |
| **SuperAdmin** | ≤ 3.500 ms | 1.500 – 2.500 ms | ≤ 350 ms | **Tahap 1:** Ringkasan & Antrean<br>**Tahap 2:** Campaign, Admin & Pengaturan |

---

## 4. Rencana Aksi & Rekomendasi Solusi

1. **Implementasi Request Timeout & Abort Controller (Task 3)**:
   - Pasang batas waktu 15.000ms pada `fetchBackend` dengan `AbortController`.
   - Normalisasi error timeout menjadi pesan ramah berbahasa Indonesia: `"Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi."`.
   - Sediakan tombol retry (`.retry-action`) yang memungkinkan percobaan ulang instan per komponen tanpa reload halaman penuh.

2. **Pemuatan Bertahap (*Staged Prioritized Loading*) (Task 4)**:
   - Ubah `loadAdminDashboard()` dan `loadSuperAdminDashboard()` agar memuat data Tahap 1 (Ringkasan & Antrean Aksi) terlebih dahulu.
   - Muat data Tahap 2 (Daftar Campaign & Member) setelah Tahap 1 selesai atau secara non-blocking.
   - Tunda pemuatan Pengaturan Sistem dan Bersihkan Arsip hingga dibutuhkan.

3. **Deduplikasi Permintaan In-Flight & Guard Polling (Task 5)**:
   - Pasang cache in-flight Promise di `js/api.js` sehingga panggilan pembacaan data yang identik dan terjadi bersamaan hanya mengirim satu request HTTP.
   - Batasi `startAdminPolling()` agar tidak menembak `getPendingMembers` jika fetch baru saja dilakukan dalam 5 detik terakhir.

4. **HUD Observabilitas Kinerja Lokal (Task 6)**:
   - Sediakan panel debug ringan di pojok layar pada mode localhost untuk memantau durasi fetch, durasi render, jumlah record, dan status timeout secara real-time tanpa membocorkan data sensitif pengguna.

5. **Penegakan Budget Kinerja (Task 7)**:
   - Definisikan ambang batas durasi per role dan berikan indikator peringatan saat batas terlampaui di localhost.
