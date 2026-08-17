# Laporan Stabilisasi Content Security Policy (CSP) & Analisis Keamanan

Tanggal: 2026-08-17  
Aplikasi: **Donatur Helper** (`https://don4tpro.pages.dev/` & `https://don4pro.com`)

---

## 1. Ringkasan Eksekutif & Status Kebijakan CSP

Saat ini, header keamanan `Content-Security-Policy-Report-Only` diaktifkan pada Cloudflare Pages (`_headers`) dan Netlify (`netlify.toml`).

### Kebijakan CSP yang Berlaku (Active Policy):
```http
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://accounts.google.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://script.google.com https://script.googleusercontent.com https://accounts.google.com; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self';
```

---

## 2. Mengapa CSP Menggunakan Mode `Report-Only` (Rationale)

Aplikasi Donatur Helper menggunakan integrasi pihak ketiga dan pola DOM dinamis berikut yang memerlukan fleksibilitas saat runtime:

1. **Google Identity Services (GSI - `https://accounts.google.com`)**:
   - Skrip Google One Tap / Sign-In (`https://accounts.google.com/gsi/client`) memuat iframe autentikasi dinamis dan menjalankan callback JavaScript di client.
2. **Google Apps Script Backend (`https://script.google.com`)**:
   - Backend berjalan sebagai Google Apps Script Web App yang mengembalikan respons JSON/JSONP atau redirect ke `script.googleusercontent.com`.
3. **Event Handler Inline pada Template HTML**:
   - Elemen antarmuka (seperti tombol `onclick="showView('user-login')"`, `onclick="logoutToken()"`) dipasang pada dokumen statis `index.html` dan direferensikan oleh modul ES6 melalui binding `window`.
4. **Third-party Pinned Libraries (Flatpickr via jsDelivr)**:
   - Komponen date picker dimuat dari CDN jsDelivr dengan verifikasi integritas Subresource Integrity (SRI) SHA-384.

Jika `Content-Security-Policy` ditegakkan secara ketat (Enforced CSP) tanpa `'unsafe-inline'`, maka seluruh event `onclick` pada HTML dan skrip callback Google Identity akan diblokir oleh peramban, menyebabkan kegagalan login dan interaksi tombol.

---

## 3. Matriks Sumber Daya & Asal Izin (Allow-listed Origins)

| Direktif CSP | Asal yang Diizinkan (Origins) | Tujuan Penggunaan |
|---|---|---|
| `default-src` | `'self'` | Membatasi asal default hanya ke domain aplikasi. |
| `script-src` | `'self'`, `'unsafe-inline'`, `https://cdn.jsdelivr.net`, `https://accounts.google.com` | Memuat pustaka `js/*.js`, Flatpickr datepicker, dan Google Identity Services. |
| `style-src` | `'self'`, `'unsafe-inline'`, `https://cdn.jsdelivr.net`, `https://fonts.googleapis.com` | Memuat `css/*.css`, stylesheet Flatpickr, dan Google Fonts Inter. |
| `font-src` | `'self'`, `https://fonts.gstatic.com` | Memuat file font biner WOFF2 dari server Google Fonts. |
| `img-src` | `'self'`, `data:`, `https:` | Menampilkan bukti transfer, preview hadiah, dan ikon SVG inline. |
| `connect-src` | `'self'`, `https://script.google.com`, `https://script.googleusercontent.com`, `https://accounts.google.com` | Mengirim data API POST/GET ke backend Google Apps Script dan verifikasi OAuth. |
| `frame-src` | `https://accounts.google.com` | Menampilkan overlay tombol login Google Identity. |
| `object-src` | `'none'` | Memblokir plugin Flash, Java, atau objek berbahaya lainnya. |
| `base-uri` | `'self'` | Mencegah eksploitasi manipulasi `<base href>`. |

---

## 4. Roadmap & Rencana Migrasi Menuju CSP Ketat (Enforced CSP)

Untuk beralih dari `Content-Security-Policy-Report-Only` ke CSP yang ditegakkan (`Content-Security-Policy`), langkah-langkah bertahap berikut direncanakan untuk iterasi masa depan (di luar ruang lingkup Phase 6 untuk menjaga stabilitas produksi):

1. **Migrasi Event Handler HTML**:
   - Ganti atribut HTML `onclick="..."`, `onkeyup="..."` dengan `addEventListener` deklaratif di dalam modul JavaScript `js/views/*.js`.
2. **Implementasi Nonce / Cryptographic Hashes**:
   - Jika ada skrip inline yang tersisa, sematkan atribut `nonce="..."` atau hash SHA-256 pada header CSP.
3. **Penyedia Pelaporan Pelanggaran (CSP Reporting)**:
   - Tambahkan direktif `report-uri` atau `report-to` ke endpoint monitoring (misal Cloudflare Web Analytics / Sentry) untuk memantau jika ada script injection mencurigakan.
4. **Enforcement Aktivasi**:
   - Ubah header dari `Content-Security-Policy-Report-Only` menjadi `Content-Security-Policy` setelah pengujian menyeluruh pada seluruh jenis peramban.

---

## 5. Kesimpulan Kesiapan Produksi (Production Readiness Verdict)

Konfigurasi keamanan saat ini stabil, aman terhadap serangan umum (dilengkapi `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, sanitasi `sanitizeUrl` & `escapeHtml`, serta SRI pada CDN), dan tidak menyebabkan gangguan fungsional pada aplikasi Donatur Helper.
