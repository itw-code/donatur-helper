# Matriks Verifikasi & Checklist Kesiapan Produksi (Production Readiness Checklist)

Dokumen ini adalah matriks verifikasi dan checklist rilis produksi resmi untuk aplikasi **Donatur Helper** (Phase 6). Dokumen ini digunakan sebagai standar verifikasi sebelum rilis ke lingkungan produksi untuk mencegah terjadinya regresi pada alur kerja pengguna.

---

## 1. Matriks Verifikasi Berdasarkan Peran (Role-by-Role Verification Matrix)

| Peran / Area | Permukaan / ID View | Skenario Pengujian | Kriteria Lulus (Pass Criteria) | Status |
|---|---|---|---|:---:|
| **Landing & Autentikasi** | `#view-landing`<br>`#view-user-login`<br>`#view-token-login` | 1. Tampilan awal landing page<br>2. Login WhatsApp donatur<br>3. Pendaftaran donatur baru<br>4. Login token PIC / Admin / SuperAdmin | - Tombol "Saya mau donasi" memiliki rasio kontras WCAG AA (5.82:1).<br>- Teks privasi nomor WhatsApp ditampilkan secara jelas.<br>- Form registrasi meminta Nama Lengkap & Status Karyawan (`Active`/`Ex`).<br>- Pesan error ramah pengguna (contoh: "Nomor WhatsApp belum terdaftar"). | [x] |
| **Donor / Member** | `#view-user-dashboard`<br>`#profile-modal` | 1. Dashboard donatur dengan tagihan terbuka<br>2. Dashboard donatur tanpa tagihan (Empty State)<br>3. Pengelompokan campaign<br>4. Unggah bukti transfer<br>5. Edit profil donatur | - Empty state tagihan menampilkan pesan menenangkan ("Tidak ada tagihan tertunda") dan CTA ke campaign terbuka.<br>- Campaign terbagi rapi: "Bisa Diikuti", "Sudah Diikuti", dan "Selesai / Riwayat" (dalam disclosure).<br>- Unggahan bukti menampilkan preview responsif dan instruksi batas ukuran 2MB.<br>- Profil modal memungkinkan perubahan nama & email, nomor WA terkunci. | [x] |
| **PIC (Person in Charge)** | `#view-pic-dashboard`<br>`#view-pic-create` | 1. Buat campaign baru<br>2. Progres & ringkasan campaign<br>3. Hierarki aksi berdasarkan status<br>4. Antrean donatur & status verifikasi<br>5. Salin rekap pengingat WhatsApp<br>6. Kampanye final & settled state | - Form buat campaign memvalidasi target, nominal hadiah, dan deadline.<br>- Status Terbuka (Open): 1 primary CTA, kotak salin undangan sekunder, tutup pendaftaran terpisah.<br>- Status Menunggu Finalisasi (Closed): 1 primary CTA untuk input rekening & total hadiah.<br>- Status Final: Donatur yang sudah verifikasi mendapat styling tenang (`.donor-card-settled`) tanpa tombol tagih.<br>- Tersedia tombol 1-klik "Salin Rekap Pengingat Belum Bayar" untuk WhatsApp. | [x] |
| **Admin** | `#view-admin-dashboard` | 1. Navigasi sticky (`.admin-nav-bar`)<br>2. Ringkasan metrik berskala jelas<br>3. Kartu campaign padat & rapi<br>4. Penanganan campaign terlewat deadline<br>5. Paginasi member (20 kartu + Muat lebih banyak)<br>6. Pembuatan token PIC / Admin baru | - Navigasi sticky tetap dapat diakses di bagian atas ponsel saat scrolling.<br>- Metrik membedakan jelas: Campaign Aktif vs Database, Member Tampil vs Total.<br>- Campaign lewat deadline menampilkan tanggal absolut (`DD MMM YYYY`) dan rekomendasi langkah tindak lanjut.<br>- Daftar member memuat maks 20 kartu pada awal render dan menyediakan tombol "Muat lebih banyak".<br>- Tombol buat token PIC diletakkan di section Tools dengan tampilan sekunder yang rapi. | [x] |
| **SuperAdmin** | `#view-superadmin-dashboard` | 1. Pengaturan sistem (pembulatan, validasi member)<br>2. Database maintenance (pembersihan arsip data)<br>3. Manajemen token admin | - Pengaturan tersimpan secara aman ke backend.<br>- Pembersihan data arsip (Data Sweep) memiliki konfirmasi dan indikator proses.<br>- Navigasi sticky peran SuperAdmin berjalan konsisten. | [x] |

---

## 2. Matriks Kondisi Status & Edge Cases (State Verification Matrix)

| Kondisi Status | Komponen Terkait | Perilaku yang Diharapkan | Status |
|---|---|---|:---:|
| **Empty State (Status Kosong)** | Donor bills, PIC donor queue, Admin approvals, Member filter | Menampilkan ilustrasi/ikon status semantik yang tenang, pesan penjelas bahwa tidak ada item tertunda, serta CTA alternatif jika relevan. Tidak menampilkan error atau layar kosong. | [x] |
| **Loading State (Status Memuat)** | Login check, fetching data, upload bukti, sweep data | Menampilkan indikator loading yang jelas (`role="status"`), tombol aksi dinonaktifkan sementara untuk mencegah double-submit. | [x] |
| **Error State (Status Kendala / Error)** | Gangguan koneksi, input tidak valid, file >2MB, token kedaluwarsa | Pesan berbahasa Indonesia, tenang, tidak memunculkan pesan teknis mentah (stack trace, script line, JSON parse error). Ditampilkan dengan `role="alert"`. | [x] |
| **Success State (Status Sukses)** | Simpan profil, salin tautan/teks, unggah bukti, buat token | Toast notifikasi muncul dengan `aria-live="polite"`, kata kerja baku ("Teks berhasil disalin!", "Profil berhasil disimpan!"). | [x] |
| **Final / Settled (Selesai & Final)** | PIC donor list, Donor completed campaigns | Donatur lunas/terverifikasi berlatar netral/hijau lembut, tanpa tombol reminder; jika semua selesai, muncul spanduk kepastian bahwa seluruh dana telah beres. | [x] |
| **Overdue (Terlewat Deadline)** | Admin campaign view, PIC campaign info | Menampilkan badge peringatan dengan tanggal absolut (contoh: "Terlewat 3 hari (14 Agu 2026)") dan rekomendasi tindakan jelas: "Hubungi PIC untuk menutup pendaftaran atau perbarui deadline." | [x] |

---

## 3. Matriks Responsivitas & Viewport (Viewport Matrix)

| Viewport / Kondisi | Target Pengujian | Kriteria Lulus (Pass Criteria) | Status |
|---|---|---|:---:|
| **360px (Small Android)** | Layar ponsel kecil (e.g. Galaxy A series / small viewport) | - Tidak ada horizontal scrollbar pada body (`overflow-x: hidden`).<br>- Teks tombol tidak terpotong.<br>- Padding kartu konsisten (`16px`).<br>- Target sentuh minimal `44px` untuk tombol sekunder dan `48px` untuk tombol utama. | [x] |
| **390px (Standard Mobile)** | iPhone 12/13/14/15, Pixel, Galaxy | - Sticky navigation bar berada pada posisi yang nyaman.<br>- Kartu campaign dan antrean donatur mudah di-scan dengan ritme visual yang seimbang.<br>- Dialog modal pas dengan margin aman. | [x] |
| **Virtual Keyboard Terbuka** | Form input pada ponsel (input WA, buat campaign, edit profil) | - Bidang input yang aktif tidak tertutup oleh keyboard virtual.<br>- Tombol simpan/lanjut tetap dapat diakses setelah keyboard selesai digunakan.<br>- Ukuran font input minimal `16px` untuk mencegah auto-zoom pada iOS. | [x] |
| **Desktop (>= 1024px)** | Layar monitor / laptop | - Container dibatasi maksimal `800px` (`.wrap`) agar tetap nyaman dibaca.<br>- Tabel dan form melebar secara proporsional.<br>- Modal berada di tengah layar dengan backdrop overlay gelap. | [x] |

---

## 4. Anggaran Kinerja & Sasaran Lighthouse (Performance Budget)

Berdasarkan audit awal (`docs/reports/web-quality-audit-2026-08-17.md`):

| Metrik | Nilai Awal (Baseline) | Target Anggaran (Budget) | Status Verifikasi |
|---|:---:|:---:|:---:|
| **Lighthouse Performance** | 88 | ≥ 92 | [x] |
| **Lighthouse Accessibility** | 66 | ≥ 90 | [x] |
| **Lighthouse Best Practices** | 96 | ≥ 96 | [x] |
| **Lighthouse SEO** | 73 | ≥ 90 | [x] |
| **Largest Contentful Paint (LCP)** | 3.1 s | ≤ 2.5 s | [x] |
| **Cumulative Layout Shift (CLS)** | 0 | ≤ 0.1 | [x] |
| **Total Blocking Time (TBT)** | 0 ms | ≤ 100 ms | [x] |
| **Total Ukuran CSS (Uncompressed)** | Monolitik inline (224KB total) | ≤ 60 KB (`css/*.css`) | [x] |
| **Total Ukuran JS (Uncompressed)** | Monolitik inline | ≤ 100 KB (`js/*.js`) | [x] |
| **Asset 404 / Missing Files** | Ada error syntax robots.txt | 0 error 404 / valid assets | [x] |
| **Render-blocking Resources** | Ada font `@import` & script blocking | 0 render blocking (semua script `defer`/`async`) | [x] |
