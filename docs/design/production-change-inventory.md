# Inventaris Perubahan Produksi (Production Change Inventory) DonatPRO v2.2

> Versi: 2.2.0 (Refocused on Farewell Gifts & Digital Experience)  
> Merek Resmi: **DonatPRO**  
> Fokus Utama (95%): **Patungan Kado &amp; Kenang-kenangan Perpisahan Rekan Resign / Exit SawitPRO**  
> Kasus Khusus (<5%): Dana Duka Cita &amp; Musibah Keluarga Rekan  
> Mesin Fungsional: **Donatur Helper** (Digital Donation &amp; Bill Split Engine)  
> Model Operasional: **100% Digital-First (Web App + WhatsApp)** — Tanpa Kebutuhan Perlengkapan Fisik/Kertas  
> Tautan Produksi: https://don4tpro.pages.dev  
> Status: Panduan Migrasi Resmi (Living Migration Register)

---

## 1. Ikhtisar &amp; Keputusan Ruang Lingkup (Scope Boundaries)

Berdasarkan keputusan produk terbaru, ruang lingkup implementasi DonatPRO difokuskan secara presisi:

1. **Fokus Inti Aplikasi (Core Reality):**  
   Penggunaan sehari-hari difokuskan untuk **patungan kado perpisahan rekan kerja yang resign atau exit** (sekitar 95% kampanye). Sekitar <5% kasus mencakup bantuan duka cita atau kemanusiaan darurat bagi keluarga rekan kerja.
2. **Operasional 100% Digital:**  
   Tidak diperlukan kerepotan operasional fisik seperti mencetak kop surat, mencetak kartu nama fisik, mencetak kuitansi kertas, atau membuat tali lanyard/ID card fisik. Semuanya berjalan secara *paperless* melalui peramban web HP/desktop dan koordinasi tautan WhatsApp.
3. **Pemberhentian `netlify_index.html`:**  
   Berkas `netlify_index.html` telah **dihapus (dropped)** dari repositori dan tidak lagi digunakan dalam alur produksi atau pengujian.
4. **Gaya Tutur Bersama:**  
   Menggunakan kombinasi rasa syukur yang menyatukan: **"Alhamdulillah, puji syukur..."** dalam notifikasi dan pelaporan resmi.

---

## 2. Inventaris Berkas Kode Produksi yang Perlu Diperbarui

### 2.1 Berkas Kulit HTML (HTML Shells)

| Berkas | Lokasi / Elemen | Nilai Saat Ini | Nilai Produksi Baru (DonatPRO) |
|---|---|---|---|
| `index.html` | `<title>` (Baris 6) | `Donatur Helper — Patungan Hadiah & Donasi Kantor` | `DonatPRO — Patungan Kado Perpisahan Rekan SawitPRO` |
| `index.html` | `<meta name="description">` (Baris 7) | Deskripsi patungan kantor lama | `Platform patungan kado dan hadiah perpisahan rekan kerja SawitPRO yang praktis, transparan, dan tanpa drama selisih kas.` |
| `index.html` | `<header class="app-header">` (Baris 29) | `<h1>Donatur Helper</h1>` | `<div class="dh-brand-lockup"><img src="assets/logo/logo-icon.svg" width="36" height="36" alt="DonatPRO"><h1>Donat<span style="color:var(--primary-hover,#34d399)">PRO</span></h1></div><p class="sub">Patungan Kado Perpisahan Rekan SawitPRO</p>` |
| `index.html` | `<link rel="icon">` | Default / belum terdefinisi | `<link rel="icon" type="image/svg+xml" href="assets/logo/favicon.svg">` |
| `netlify_index.html` | Seluruh berkas | Berkas legacy Netlify | **DIHAPUS / DROPPED** (Sudah dibersihkan dari repositori &amp; test suite) |

---

### 2.2 Modul JavaScript Tampilan &amp; Logika (`js/`)

| Berkas | Lokasi / Fungsi | Detail Pembaruan |
|---|---|---|
| `js/state.js` | `originalTitle` (Baris 12) | Ganti default title menjadi `'DonatPRO'` |
| `js/views/donor.js` | `renderDonorDashboard` &amp; Welcome | Sapaan selamat datang difokuskan ke rekan kerja: *"Halo [Nama], mari beri kado kenang-kenangan terbaik untuk rekan kita."* |
| `js/views/donor.js` | Empty state (Baris 299) | *"Belum ada patungan kado perpisahan yang aktif saat ini. Rekan tim dapat membuat campaign baru melalui tombol di atas."* |
| `js/views/pic.js` | Template Reminder WA (Baris 979) | Sesuaikan pesan ajakan patungan kado perpisahan (lihat rincian di bawah) |
| `js/views/pic.js` | Judul Workspace PIC | Ubah header menjadi: *"Workspace PIC Patungan Kado DonatPRO"* |
| `js/views/admin.js` | Label &amp; Filter Anggota | *"Insan SawitPRO (Karyawan Aktif & Alumni)"* |

---

### 2.3 Template Pesan WhatsApp (Operational WhatsApp Copy)

Pesan otomatis yang dibuat aplikasi untuk dibagikan PIC ke donatur:

#### A. Ajakan Patungan Kado Perpisahan (PIC ke Grup WhatsApp / Rekan Tim)
```
Halo Rekan-rekan SawitPRO! 👋
Sebentar lagi rekan kita *[Nama Rekan Resign]* akan menyelesaikan masa baktinya di SawitPRO.

Mari bersama kita berikan kado kenang-kenangan terbaik sebagai bentuk apresiasi atas kebersamaan dan kerja sama hebat selama ini. 🎁

📌 Target Kado: *[Nama Hadiah / Kado]*
💰 Patungan Bagi Rata: Rp [Nominal Due]

Rekan-rekan dapat melihat detail rekening transfer dan mengunggah resi pembayaran di tautan ini:
👉 https://don4tpro.pages.dev#c=[CampaignID]

Terima kasih banyak atas partisipasi dan kebersamaan rekan-rekan! ✨
— Tim PIC DonatPRO SawitPRO
```

#### B. Konfirmasi Kuitansi Sah ke Donatur (Setelah Bukti Diverifikasi)
```
Halo Rekan [Nama],
Alhamdulillah, puji syukur! 🙏

Patungan kado perpisahan untuk *[Nama Rekan Resign]* sebesar *Rp [Nominal]* telah diverifikasi oleh PIC.
🧾 Kuitansi Digital: KWT/DPRO/2026/[Nomor]
Tautan Rincian Kas: https://don4tpro.pages.dev#c=[CampaignID]

Terima kasih atas kebersamaan dan partisipasi kado untuk rekan kita!
— DonatPRO (Patungan Kado Perpisahan Rekan SawitPRO)
```

#### C. Laporan Penyerahan Kado Selesai (Laporan Akhir PIC)
```
Rekan-rekan insan SawitPRO,
Alhamdulillah, puji syukur atas kebersamaan dan kekompakan kita semua. 

Kado kenang-kenangan dan kartu ucapan perpisahan telah diserahkan dengan hangat kepada Rekan *[Nama Rekan Resign]*:
📦 Status: 100% Selesai Disalurkan
🧾 Total Dana Terkumpul: Rp [Total]
Dokumentasi penyerahan dapat dilihat di: https://don4tpro.pages.dev#c=[CampaignID]

Sukses selalu untuk langkah karir Rekan [Nama Rekan Resign] ke depan! 🌟
```

---

### 2.4 Penjelasan Status Berkas Fisik / Offline (CIP Status)

| Berkas Desain CIP | Status Implementasi Saat Ini | Catatan Operasional |
|---|---|---|
| `assets/cip/receipt-voucher.svg` | **AKTIF (Digital)** | Digunakan sebagai template dasar kuitansi digital / cetak PDF jika diminta donatur |
| `assets/cip/certificate.svg` | **AKTIF (Digital/Optional)** | Piagam penghargaan digital untuk rekan kerja yang resign |
| `assets/cip/official-stamp.svg` | **AKTIF (Digital)** | Cap stempel digital pada kuitansi web |
| `assets/cip/letterhead.svg` | **DITANGGUHKAN (Deferred)** | Tidak diperlukan untuk operasional harian kantor saat ini |
| `assets/cip/id-badge.svg` | **DITANGGUHKAN (Deferred)** | Tidak diperlukan lanyard / kartu pengenal fisik di setup saat ini |
| `assets/cip/business-card.svg` | **DITANGGUHKAN (Deferred)** | Tidak diperlukan kartu nama fisik; koordinasi 100% via link web & WA |

---

### 2.5 Dokumentasi Repositori (`README.md`)

- Ubah judul utama menjadi: `# 🌿 DonatPRO`
- Deskripsi: `Platform Digital Patungan Kado Perpisahan Rekan SawitPRO (Powered by Donatur Helper Engine)`
- Sorot nilai utama: bagi rata nominal otomatis, bebas drama selisih kas kantor, kuitansi digital tervalidasi, dan koordinasi WhatsApp cepat.
