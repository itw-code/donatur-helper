# Rencana & Prosedur Rollback Darurat (Rollback & Recovery Plan) — Donatur Helper

Dokumen ini adalah panduan langkah demi langkah untuk melakukan pemulihan darurat (rollback) jika terjadi regresi kritis di lingkungan produksi Donatur Helper.

---

## 1. Kriteria Rollback (Rollback Triggers)

Lakukan rollback segera jika salah satu kondisi darurat berikut terpenuhi pasca-deploy:
- **P0**: Donatur tidak dapat melakukan login WhatsApp atau halaman utama mengalami blank screen / fatal error.
- **P0**: Terjadi kesalahan kalkulasi nominal tagihan atau pembagian split donasi.
- **P0**: Data donatur atau riwayat transaksi terhapus / gagal disimpan ke Google Sheets backend.
- **P1**: Fitur unggah bukti transfer gagal total di semua perangkat ponsel.
- **P1**: Token PIC atau Admin tidak dapat digunakan untuk otentikasi.

---

## 2. Metode 1: Rollback Instan Cloudflare Pages (Waktu Pemulihan < 60 Detik)

Ini adalah metode rollback tercepat untuk masalah pada antarmuka frontend:

1. Buka [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages**.
2. Pilih project **`don4tpro`**.
3. Klik tab **Deployments**.
4. Cari deployment sebelumnya yang berstatus stabil (misal: deployment commit Phase 5 yang telah diverifikasi).
5. Klik ikon menu titik tiga (`...`) di sisi kanan deployment stabil tersebut.
6. Pilih **Rollback to this deployment**.
7. Konfirmasi pemulihan. Cloudflare Pages akan mengarahkan traffic domain `https://don4tpro.pages.dev/` ke versi stabil dalam hitungan detik secara instan tanpa perlu rebuild.

---

## 3. Metode 2: Rollback via Git Revert

Untuk memastikan branch `main` di repositori kembali selaras dengan status produksi:

1. Buat commit pembalik (`git revert`) dari commit bermasalah:
   ```bash
   rtk git log -n 5 --oneline
   rtk git revert HEAD --no-edit
   ```
2. Jalankan rangkaian tes lokal untuk memastikan kondisi stabil:
   ```bash
   rtk node --test
   ```
3. Push commit revert ke remote:
   ```bash
   rtk git push origin main
   ```
4. Deployment otomatis Cloudflare Pages akan mempublikasikan ulang versi yang telah di-revert.

---

## 4. Metode 3: Rollback Backend Google Apps Script (`Code.js`)

Jika regresi terjadi pada endpoint API Google Apps Script:

1. Buka [Google Apps Script Dashboard](https://script.google.com).
2. Buka project **Donatur Helper Backend**.
3. Klik tombol **Deploy** di kanan atas → **Manage deployments**.
4. Pilih deployment aktif (Web App).
5. Klik ikon **Edit** (pensil).
6. Pada dropdown **Version**, pilih nomor versi stabil sebelumnya (misal: Version yang dibuat sebelum rilis).
7. Klik **Deploy**.
8. Perubahan versi backend aktif seketika tanpa mengubah URL endpoint Web App.

---

## 5. Protokol Komunikasi Donatur & PIC (Template Pesan WhatsApp)

Jika terjadi gangguan yang mempengaruhi pengguna aktif, kirimkan pemberitahuan tenang menggunakan template berikut:

### Template 1: Pemberitahuan Pemeliharaan Sistem Sementara
> *Halo rekan-rekan donatur, kami sedang melakukan pemeliharaan sistem kilat pada Donatur Helper untuk meningkatkan stabilitas aplikasi. Sistem akan kembali normal dalam 5–10 menit. Seluruh data partisipasi Anda aman tersimpan. Terima kasih atas kesabarannya.*

### Template 2: Pemberitahuan Sistem Telah Pulih
> *Pemberitahuan: Sistem Donatur Helper telah kembali normal dan dapat diakses seperti biasa di https://don4tpro.pages.dev. Jika Anda sebelumnya mengalami kendala saat membuka halaman, silakan muat ulang (refresh) halaman Anda. Terima kasih.*

---

## 6. Jaminan Integritas & Keamanan Data (Data Safety Rules)

1. **Penyimpanan Spreadsheet Terpisah**:
   - Seluruh data donasi, riwayat transfer, dan daftar member tersimpan di Google Sheets database yang independen dari deployment frontend.
   - Rollback frontend di Cloudflare Pages **TIDAK** menghapus, memodifikasi, atau mereset baris spreadsheet yang sudah tercatat.
2. **Tidak Ada Operasi DROP / Destructive Data**:
   - Prosedur rollback tidak boleh menjalankan script pembersihan atau penghapusan data massal.
3. **Verifikasi Data Pasca-Rollback**:
   - Setelah rollback selesai, PIC atau Admin dapat membuka sheet database untuk memverifikasi bahwa total baris partisipasi tetap utuh dan sesuai sebelum insiden terjadi.
