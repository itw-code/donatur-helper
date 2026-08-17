# Panduan Rilis Produksi (Production Release Runbook) — Donatur Helper

Dokumen ini adalah prosedur operasional standar (SOP) untuk merilis pembaruan kode aplikasi **Donatur Helper** ke lingkungan produksi (Cloudflare Pages, Netlify, dan Google Apps Script).

---

## 1. Pemeriksaan Pra-Rilis (Pre-Deploy Checks)

Lakukan semua langkah verifikasi berikut di lingkungan lokal sebelum melakukan push atau rilis:

### A. Uji Otomatis & Regresi
Jalankan seluruh rangkaian pengujian unit:
```bash
rtk node --test
```
- **Kriteria Lulus**: 100% tes lolos (0 failed, 0 errors).

### B. Pemeriksaan Status Git
Pastikan direktori kerja bersih dan tidak ada file sementara:
```bash
rtk git status
```
- Pastikan perubahan telah di-commit secara rapi dengan format conventional commit.

### C. Verifikasi Integritas File & Header
- Periksa bahwa `_headers` dan `netlify.toml` mencakup aturan cache dan security headers yang valid.
- Pastikan aset modular di `css/` dan `js/` berada di bawah batas anggaran kinerja.

---

## 2. Langkah Rilis (Deploy Steps)

### A. Rilis Frontend ke Cloudflare Pages (Produksi Utama)

1. **Otomatis via Git Integration (Direkomendasikan)**:
   - Lakukan push ke branch `main`:
     ```bash
     rtk git push origin main
     ```
   - Cloudflare Pages akan mendeteksi commit baru dan membangun deployment secara instan.
   - Buka Cloudflare Dashboard → Workers & Pages → `don4tpro` untuk memantau status build.

2. **Manual via Direct Upload (Wrangler CLI)**:
   Jika rilis darurat atau bypass git:
   ```bash
   npx wrangler pages deploy . --project-name=don4tpro --branch=main
   ```

### B. Rilis Redirect Netlify (`don4pro.com`)

- Netlify terhubung otomatis ke repository GitHub dan melacak file `netlify.toml` untuk aturan redirect 301 ke Cloudflare Pages.
- Pastikan deployment Netlify berstatus **Published**.

### C. Pembaruan Backend Google Apps Script (`Code.js`)

*(Hanya jika ada perubahan logika pada file `Code.js`)*:
1. Buka project di [Google Apps Script Editor](https://script.google.com).
2. Salin isi file `Code.js` terbaru ke editor.
3. Klik tombol **Deploy** → **Manage deployments**.
4. Pilih deployment aktif Web App → Klik ikon **Edit** (pensil).
5. Pada dropdown **Version**, pilih **New version**.
6. Masukkan deskripsi rilis (contoh: "Release Phase 6 - Production Readiness").
7. Klik **Deploy** dan pastikan URL Web App tidak berubah.

---

## 3. Uji Asap Pasca-Rilis (Post-Deploy Smoke Test Checklist)

Lakukan pengujian cepat berikut langsung pada URL produksi `https://don4tpro.pages.dev/`:

1. **Akses Publik & Landing**:
   - [ ] Buka `https://don4tpro.pages.dev/`.
   - [ ] Pastikan halaman termuat cepat tanpa error console.
   - [ ] Periksa bahwa CSS modular dan JS ES module termuat dengan status HTTP 200/304.
2. **Alur Donatur**:
   - [ ] Klik "Saya mau donasi" → Masukkan nomor WhatsApp donatur.
   - [ ] Pastikan dashboard donatur terbuka dengan daftar campaign ("Bisa Diikuti", "Sudah Diikuti").
   - [ ] Buka modal profil donatur dan periksa input data.
3. **Alur PIC (Deep Dive)**:
   - [ ] Buka tautan deep-dive campaign atau login dengan token PIC.
   - [ ] Periksa kartu progres campaign, 1 tombol primary CTA, dan daftar donatur.
   - [ ] Uji tombol "Salin Rekap Pengingat Belum Bayar" (pastikan notifikasi toast "Teks berhasil disalin!" muncul).
4. **Alur Admin / SuperAdmin**:
   - [ ] Masuk menggunakan token Admin.
   - [ ] Pastikan navigasi sticky peran berfungsi saat digulir ke bawah.
   - [ ] Periksa paginasi member (maksimal 20 kartu pertama + tombol "Muat lebih banyak").
   - [ ] Periksa tampilan peringatan jika terdapat campaign yang terlewat deadline.
5. **Responsivitas & Keyboard**:
   - [ ] Uji pada perangkat mobile (atau device emulation 390px).
   - [ ] Pastikan form input tidak terpotong saat keyboard virtual aktif.

---

## 4. Penanganan Insiden Darurat & Prosedur Eskalasi (Emergency Incident Handling)

Jika terjadi kendala kritis di produksi pasca-deploy:

### Klasifikasi Keparahan Insiden:
- **P0 (Kritis - Blocker)**: Donatur tidak bisa login, data donasi corrupt/hilang, seluruh antarmuka blank/crash.
  - **Tindakan**: Lakukan **Instant Rollback** segera (< 2 menit) mengikuti panduan `docs/runbooks/rollback-plan.md`.
- **P1 (Tinggi - Fungsional Terganggu)**: Salah satu role mengalami error tombol, unggah bukti gagal, atau format pesan WA keliru.
  - **Tindakan**: Rollback atau deploy hotfix cepat setelah diverifikasi dengan unit test lokal.
- **P2 (Rendah - Kosmetik/Minor)**: Typo teks minor, ketidaksejajaran layout kecil pada browser spesifik.
  - **Tindakan**: Perbaiki pada iterasi normal tanpa rollback darurat.
