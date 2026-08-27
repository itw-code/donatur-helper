# Design Document: README.md Repositori Donatur Helper

**Tanggal**: 2026-08-27  
**Status**: Disetujui (Approved)  
**Bahasa**: Bahasa Indonesia (Humanized & Ramah Pengguna)  
**Target File**: `README.md` (Root Repositori)  
**Tautan Produksi**: [https://don4tpro.pages.dev](https://don4tpro.pages.dev)

---

## 1. Latar Belakang & Tujuan

Donatur Helper adalah aplikasi berbasis web yang dirancang untuk mempermudah koordinasi donasi, patungan (seperti kado perpisahan, pernikahan, duka cita, atau kegiatan sosial bersama), penentuan porsi iuran, hingga verifikasi bukti transfer antar rekan kerja/komunitas.

Sebelumnya, repositori GitHub belum memiliki berkas `README.md` utama di root repositori, sehingga halaman repositori terlihat kosong. Dokumen ini merancang berkas `README.md` resmi dengan gaya bahasa Indonesia yang luwes, ramah, manusiawi (*humanized*), dan profesional, serta menyertakan tautan langsung ke aplikasi produksi yang aktif.

---

## 2. Karakteristik & Nada Bahasa (*Tone of Voice*)

- **Manusiawi & Solutif**: Tidak kaku seperti dokumentasi mesin/terjemahan mentah. Berangkat dari masalah nyata yang dihadapi tim (repot mencocokkan mutasi rekening, lupa siapa yang belum transfer, kwitansi tercecer di chat grup).
- **Transparan & Akuntabel**: Menekankan ketenangan batin bagi Donatur maupun PIC (Penanggung Jawab) bahwa setiap rupiah tercatat rapi.
- **Kamus Istilah Konsisten**: Mengikuti kesepakatan domain di `CONTEXT.md`:
  - *Kampanye* (bukan event/acara)
  - *PIC (Penanggung Jawab Kampanye)*
  - *Donatur* dan *Member*
  - *Bukti Transfer* & *Pembayaran Gabungan (Combined Payment)*
  - *Alasan Penolakan* & *Refund*

---

## 3. Struktur Bagian `README.md`

### Bagian 1: Identitas & Tautan Aplikasi Aktif
- Judul: **Donatur Helper**
- Slogan: *Patungan dan donasi bersama tanpa drama rekapan spreadsheet.*
- Tombol Utama: **[🌐 Buka Aplikasi Donatur Helper (don4tpro.pages.dev)](https://don4tpro.pages.dev)**
- Lencana status: Versi 1.2.0, Cloudflare Pages, Supabase Database & Storage, Zero-Framework Vanilla JS.

### Bagian 2: Mengapa Donatur Helper?
Penjelasan singkat dan membumi tentang masalah yang diselesaikan:
- Mengakhiri drama "siapa yang belum transfer?" di grup chat.
- Menggantikan spreadsheet manual yang rawan tertimpa atau salah hitung.
- Memberi kepastian bagi donatur bahwa bukti transfer mereka sudah dilihat dan diverifikasi oleh PIC.

### Bagian 3: Fitur Sesuai Peran
1. **Untuk Donatur (Rekan Tim / Anggota)**:
   - Pilih nominal tetap atau sesuaikan donasi sukarela (minimal Rp 50.000).
   - Unggah bukti transfer langsung via ponsel/laptop.
   - Fitur **Pembayaran Gabungan**: Cukup sekali transfer dan satu bukti untuk beberapa kampanye yang rekening tujuannya sama.
   - Status yang jelas: *Menunggu Finalisasi*, *Menunggu Verifikasi*, atau *Lunas/Selesai*.
2. **Untuk PIC (Penanggung Jawab Kampanye)**:
   - Buka kampanye baru dengan target dana atau sistem bagi rata tagihan (*bill split*).
   - Antrean tinjauan bukti transfer yang fokus pada tindakan: verifikasi sekali klik atau tolak dengan alasan yang jelas agar donatur bisa upload ulang.
   - Pelacakan kelebihan bayar (*Refund perlu diselesaikan*).
3. **Untuk Pengelola (Admin & SuperAdmin)**:
   - Manajemen persetujuan anggota baru.
   - Dasbor tindakan darurat berorientasi batas waktu (*deadline-first*).
   - Keamanan data dan konfigurasi sistem global.

### Bagian 4: Arsitektur & Teknologi
- **Frontend**: Vanilla JavaScript modern berbasis ES Modules, CSS responsif bersih tanpa beban library berat.
- **Backend & Database**: Supabase PostgreSQL dengan stored procedures (RPC) transaksional dan Row Level Security (RLS).
- **Penyimpanan Berkas**: Supabase Storage (`bukti-transfer`) dengan pre-signed URL aman untuk melindungi privasi rekening & identitas donatur.
- **Infrastruktur**: Cloudflare Pages untuk penyajian statis ultra-cepat dan aman.
- **Cadangan Pengembang**: Google Apps Script (`Code.js`) sebagai fallback transisi.

### Bagian 5: Menjalankan di Komputer Lokal (*Quick Start*)
Panduan langkah demi langkah untuk pengembang yang ingin berkontribusi atau menjalankan tes secara lokal:
1. Clone repositori & install dependensi (`npm install`).
2. Konfigurasi berkas `.env` dan `js/config/env.local.js`.
3. Menjalankan tes otomatis (`npm test`).
4. Membangun aset rilis statis (`npm run build`).

### Bagian 6: Tautan Panduan & Dokumentasi
Rujukan cepat ke berkas dokumentasi mendalam:
- [Buku Panduan Donatur & PIC (`PANDUAN_USER_PIC.md`)](file:///C:/Users/oneda/Projects/Donatur%20Helper/PANDUAN_USER_PIC.md) (tersedia juga versi PDF siap cetak)
- [Buku Panduan Admin (`PANDUAN_ADMIN.md`)](file:///C:/Users/oneda/Projects/Donatur%20Helper/PANDUAN_ADMIN.md)
- [Kamus Istilah & Domain Model (`CONTEXT.md`)](file:///C:/Users/oneda/Projects/Donatur%20Helper/CONTEXT.md)

---

## 4. Kriteria Keberhasilan

1. Berkas `README.md` hadir di direktori utama repositori.
2. Tautan `https://don4tpro.pages.dev` disematkan dengan jelas dan mudah diakses.
3. Seluruh bahasa mengalir secara alami, komunikatif, dan memancarkan nilai empati serta keteraturan.
4. Instruksi teknis akurat dan sesuai dengan skrip `package.json` serta struktur project saat ini.
