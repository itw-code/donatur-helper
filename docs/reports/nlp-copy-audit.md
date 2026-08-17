# Donatur Helper: Indonesian NLP Copy Quality Audit Report

Tanggal: 2026-08-17  
Target Audit: `docs/copy/ui-copy-inventory.md` dan implementasi UI di `index.html`  
Metode: Analisis otomatis menggunakan `nlp_auditor.py` (Kamus KBBI, EYD, Aturan Kata Depan, Deteksi Pola AI Slop, Flesch-Kincaid Adaptasi Bahasa Indonesia) serta tinjauan manual UX copy.

---

## 1. Ringkasan Eksekutif

Audit kualitas bahasa dan komunikasi (*copywriting*) pada aplikasi **Donatur Helper** bertujuan memastikan seluruh teks antarmuka menggunakan Bahasa Indonesia yang baku, lugas, ramah pengguna (*humanized*), konsisten, dan bebas dari istilah teknis internal (*internal tool jargon*) atau bahasa campur (*mixed language*).

Hasil audit inventaris UI copy standar (`docs/copy/ui-copy-inventory.md`):
- **Skor Kualitas Konten**: `100/100` (setelah standarisasi & pembersihan tanda baca non-standar)
- **Total Kata**: `5.256 kata`
- **Indeks Keterbacaan (Flesch-Indo)**: `55.7` (`Standar Teknis / Informatif`)
- **Target Audiens**: `SMA / Profesional`
- **Rata-rata Panjang Kalimat**: `13.7 kata/kalimat` (2.47 suku kata/kata)
- **Rincian Temuan**: 🔴 High: 0 | 🟡 Medium: 0 | 🔵 Low: 0

---

## 2. Temuan Prioritas pada Implementasi UI (`index.html`)

Meskipun dokumen inventaris telah distandarisasi, audit kode sumber `index.html` mengidentifikasi inkonsistensi yang perlu diperbaiki pada fase implementasi (Task 3, 4, 5):

### 🔴 Prioritas Tinggi (High Priority)

1. **Konsistensi Nama Brand Aplikasi (Brand Header)**
   - *Lokasi*: `index.html:1848`
   - *Teks Saat Ini*: `Donation Helper`
   - *Masalah*: Inkonsistensi nama produk antara `Donation Helper` dan `Donatur Helper`.
   - *Solusi*: Standarisasi judul header menjadi `Donatur Helper`.

2. **Penggunaan Bentuk Non-Baku / Kata Serapan Asing pada Notifikasi Clipboard (`di-copy`)**
   - *Lokasi*: `index.html` (beberapa fungsi toast & modal seperti `showToast('Pesan berhasil di-copy!')`, `showToast('Teks berhasil di-copy!')`, `showToast('Laporan selesai berhasil di-copy!')`).
   - *Masalah*: Bentuk kata kerja pasif tidak baku `di-copy` dan `meng-copy`.
   - *Solusi*: Ganti seluruhnya dengan istilah baku KBBI `disalin` dan `menyalin`.

3. **Istilah Teknis Internal pada Tombol & Konfirmasi Admin**
   - *Lokasi*: `index.html:5021`, `index.html:5117`, `index.html:5193`
   - *Teks Saat Ini*: `Recalculate Donor Split`, `Amount Due`, `Lihat sebagai PIC (Deep Dive)`.
   - *Masalah*: Teks bahasa Inggris dan jargon internal di tengah antarmuka berbahasa Indonesia.
   - *Solusi*: 
     - `Recalculate Donor Split` -> `Hitung Ulang Tagihan Donatur`
     - `Amount Due` -> `nominal tagihan`
     - `Lihat sebagai PIC (Deep Dive)` -> `Tinjau sebagai PIC`

4. **Eksposur Pesan Error Teknis Mentah ke Pengguna**
   - *Lokasi*: Berbagai blok `.catch(e => showInfoModal(e.message || String(e), 'Error'))` dan innerHTML string error.
   - *Masalah*: Pesan teknis seperti `Failed to fetch`, `TypeError`, atau stack trace mengurangi rasa aman/kepercayaan pengguna.
   - *Solusi*: Terapkan fungsi pembantu normalisasi pesan error `formatUserErrorMessage(err)` yang memetakan gangguan koneksi atau kegagalan sistem ke bahasa yang tenang dan solutif.

---

### 🟡 Prioritas Menengah (Medium Priority)

1. **Standarisasi Aksi Pembuatan Akses / Token**
   - *Lokasi*: `index.html:1969`, `index.html:2031`
   - *Teks Saat Ini*: `+ Generate token PIC baru`, `Generate token Admin baru`.
   - *Solusi*: Ubah kata kerja menjadi `+ Buat token PIC baru` dan `Buat token Admin baru`.

2. **Penamaan Fitur Pembersihan Basis Data**
   - *Lokasi*: `index.html:2123`, `index.html:5326`
   - *Teks Saat Ini*: `Jalankan Sweep Data`, `Sweeping database...`.
   - *Solusi*: Ubah menjadi `Bersihkan Arsip Data` dan `Membersihkan data arsip...` dengan penjelasan yang menenangkan ("Pindahkan data campaign yang sudah diarsipkan ke penyimpanan dingin untuk menjaga kecepatan sistem.").

3. **Standarisasi Label Status Member dan Donatur**
   - *Lokasi*: Filter dropdown dan badge antrean (`index.html`).
   - *Teks Saat Ini*: `Perlu Cek`, `Bukti Belum Ada`, `Active / Ex / Pending`.
   - *Solusi*: Harmonisasi menjadi `Perlu Ditinjau`, `Bukti Belum Diunggah`, `Active (Karyawan)`, `Ex (Alumni)`, `Pending (Menunggu Persetujuan)`.

4. **Kejelasan Mikro-instruksi Bukti Transfer & Privasi**
   - *Lokasi*: Form upload bukti dan pendaftaran donor.
   - *Solusi*: Tambahkan catatan privasi yang menenangkan: "Nomor WhatsApp hanya digunakan untuk verifikasi login dan pengingat patungan donasi." dan "Bukti transfer hanya digunakan oleh PIC untuk verifikasi."

---

## 3. Rencana Aksi Remediasi

| Task | Fokus Pekerjaan | File Terkait |
|---|---|---|
| Task 3 | Perbaikan brand header, penggantian `di-copy` -> `disalin`, istilah aksi admin (`Hitung Ulang`, `Buat token`, `Tinjau sebagai PIC`, `Bersihkan Arsip Data`) | `index.html`, `tests/language-icon-consistency.test.js` |
| Task 4 | Harmonisasi semantik status (`Terbuka`, `Menunggu finalisasi`, `Final`, `Selesai`, `Perlu Ditinjau`, `Bukti Belum Diunggah`), format tanggal absolut deadline | `index.html`, `tests/status-semantics.test.js` |
| Task 5 | Penambahan fungsi `formatUserErrorMessage()` dan perbaikan microcopy sensitif kepercayaan (bukti bayar, privasi WA, reassurance empty states) | `index.html`, `tests/trust-microcopy.test.js` |
| Task 6 | Pengujian otomatis Node test suite untuk mencegah regresi bahasa & copy | `tests/copy-trust-quality.test.js` |
