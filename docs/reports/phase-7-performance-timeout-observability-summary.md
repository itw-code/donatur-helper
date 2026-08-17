# Ringkasan Eksekutif Implementasi Phase 7: Performance Profiling, Timeout Hardening & Observability

> **Aplikasi:** Donatur Helper  
> **Tanggal Selesai:** 17 Agustus 2026  
> **Status:** Selesai Penuh (100% Lulus Verifikasi Gate, 69/69 Unit & Integrasi Test Lolos)  
> **Fokus Utama:** Performa Admin/SuperAdmin, Hardening Timeout Localhost, Deduplikasi Query, dan Observabilitas Multi-Role

---

## 1. Ringkasan Diagnostik Bottleneck Admin/SuperAdmin

Sebelum Phase 7, antarmuka Admin dan SuperAdmin mengalami kelambatan ekstrem (*slowness*) dan sering *timeout* saat diuji pada lingkungan *localhost*. Berdasarkan audit arsitektur dan penelusuran instrumentasi, ditemukan 4 akar masalah utama:
1. **Parallel Request Storm (Konkurensi Backend)**: `loadAdminDashboard` dan `loadSuperAdminDashboard` menembak 5–7 request POST serentak ke Google Apps Script backend (`doPost`). Karena Google Apps Script mengakses Google Sheets dengan script lock, request berantai ini menyebabkan antrean panjang dan *lock contention*.
2. **Duplikasi Panggilan Inisialisasi**: Panggilan `getPendingMembers` ditembak dua kali secara bersamaan saat inisialisasi (sekali oleh `refreshPendingMembers` dan sekali lagi oleh `startAdminPolling`).
3. **Ketiadaan Abort Controller & Batas Waktu Klien**: `fetchBackend` tidak memiliki batas waktu (*timeout threshold*), menyebabkan aplikasi menunggu tanpa batas waktu jika backend mengalami *cold start*.
4. **Pemuatan Tidak Bertahap**: Seluruh daftar kampanye, database member, daftar akun admin, dan pengaturan sistem dimuat secara paralel bersamaan di awal alih-alih diprioritaskan bertahap.

---

## 2. Solusi & Optimasi yang Diterapkan

### 1. Modul Instrumentasi Waktu Multi-Role Tanpa Kebocoran Data (`js/perf.js`)
- Mengukur alokasi waktu secara granular untuk seluruh 5 POV pengguna: **Landing**, **Donor**, **PIC**, **Admin**, **SuperAdmin**.
- Memisahkan **Waktu Fetch API**, **Waktu Render DOM**, dan **Total Durasi Tampilan**.
- Menjaga privasi penuh (*Zero PII*): metrik hanya mencatat durasi, jumlah record, jumlah timeout/error, dan tidak pernah menyimpan nomor WhatsApp, nama donatur, password, tautan bukti transfer, atau token otentikasi.

### 2. Hardening Batas Waktu Permintaan & Pesan Pengguna Ramah (`js/api.js` & `js/utils.js`)
- Menerapkan `DEFAULT_TIMEOUT_MS = 15000` (15 detik) menggunakan `AbortController` standar.
- Menstandarkan pesan kegagalan timeout ke bahasa Indonesia yang tenang dan ramah:
  > *"Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi."*
- Menyediakan tombol coba lagi instan (*retry action*) berbasis komponen tanpa perlu reload seluruh halaman.

### 3. Pemuatan Bertahap Berprioritas (*Staged Prioritized Loading*) (`js/views/admin.js` & `js/views/superadmin.js`)
- **Tahap 1 (Prioritas Utama)**: Memuat Ringkasan Operasional (`getDashboardSummary`), Antrean Pendaftaran Member Baru (`getPendingMembers`), dan Pengajuan Donatur Susulan (`getPendingLateRequests`).
- **Tahap 2 (Prioritas Sekunder)**: Memuat Daftar Kampanye (`listAllCampaigns`), Database Member (`fetchAllMembers`), dan Pengaturan Admin (`listAdmins` / `getSettingsForSuperAdmin`).

### 4. Deduplikasi Permintaan In-Flight & Guard Polling (`js/api.js` & `js/views/auth.js`)
- Memasang *in-flight request deduplication map* di `call()` sehingga panggilan pembacaan data yang identik dan berbarengan secara otomatis berbagi Promise tunggal dan hanya memicu 1 permintaan HTTP.
- Memasang *throttle guard* (5 detik) pada `startAdminPolling()` agar tidak menembak request duplikat saat baru saja diinisialisasi oleh `refreshPendingMembers`.
- Menggunakan `timer.unref()` pada timer interval polling latar belakang agar Node.js runner dapat keluar bersih.

### 5. Localhost Debug Timing HUD (`js/debug-panel.js` & `css/components.css`)
- Panel observabilitas dev interaktif di pojok kanan bawah yang hanya aktif di lingkungan lokal (`localhost`, `127.0.0.1`, atau saat `_DH_DEBUG === true`).
- Menampilkan perbandingan durasi riil terhadap budget performa per role, breakdown fetch vs render, jumlah record, dan peringatan timeout secara real-time.

---

## 3. Matriks Budget & Profil Waktu per Role

| Peran Pengguna (POV) | Budget Maksimal | Estimasi Waktu Jaringan | Estimasi Waktu Render | Status Pengujian |
| :--- | :---: | :---: | :---: | :---: |
| **Landing** | ≤ 500 ms | 0 ms (Aset statis) | ≤ 50 ms | 🟢 Lulus |
| **Donor / Member** | ≤ 1.000 ms | 300 – 600 ms | ≤ 80 ms | 🟢 Lulus |
| **PIC** | ≤ 2.000 ms | 500 – 1.200 ms | ≤ 150 ms | 🟢 Lulus |
| **Admin** | ≤ 3.000 ms | 800 – 1.800 ms | ≤ 200 ms | 🟢 Lulus |
| **SuperAdmin** | ≤ 3.500 ms | 1.000 – 2.200 ms | ≤ 250 ms | 🟢 Lulus |

---

## 4. Bukti Verifikasi Pengujian & Integritas Fitur

| Suite Pengujian | File Uji | Jumlah Kasus Uji | Status |
| :--- | :--- | :---: | :---: |
| Instrumentasi Waktu Multi-Role | `tests/role-timing.test.js` | 2 | 🟢 Lolos |
| Diagnosis Bottleneck & Dokumentasi | `tests/performance-bottleneck-diagnosis.test.js` | 1 | 🟢 Lolos |
| Keamanan & Normalisasi Error Timeout | `tests/error-handling-safety.test.js` | 3 | 🟢 Lolos |
| Pemuatan Bertahap Admin & Paginasi | `tests/admin-initial-load.test.js` | 2 | 🟢 Lolos |
| Deduplikasi Permintaan In-Flight | `tests/request-deduplication.test.js` | 2 | 🟢 Lolos |
| Localhost Debug Timing HUD | `tests/debug-panel.test.js` | 2 | 🟢 Lolos |
| Budget Performa & Ambang Batas Runtime | `tests/performance-budget.test.js` | 1 | 🟢 Lolos |
| Suite Regresi Lengkap Phase 7 | `tests/performance-timeout-observability.test.js` | 5 | 🟢 Lolos |
| Suite Regresi Fase Sebelumnya (Phase 1–6) | Berbagai test suite di `tests/` | 51 | 🟢 Lolos |
| **TOTAL** | **Semua berkas pengujian** | **69** | **100% Lolos (69/69)** |

---

## 5. Kesimpulan & Status Kesiapan

Implementasi **Phase 7: Performance Profiling, Timeout Hardening & Role-Based Observability** telah selesai secara menyeluruh tanpa merusak ataupun meregresi fitur Phase 1 hingga Phase 6. Seluruh interaksi Admin dan SuperAdmin kini terlindungi oleh penanganan timeout yang tangguh, pemuatan bertahap yang efisien, dan visibilitas metrik multi-peran yang aman dari kebocoran privasi.
