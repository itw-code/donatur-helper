# Panduan Konfigurasi Variabel Lingkungan (Environment Variables)

Dokumen ini menjelaskan struktur konfigurasi variabel lingkungan (*environment variables*) untuk migrasi **Donatur Helper** ke **Supabase** (Database Postgres & Edge Functions), **Resend** (Layanan Email Transaksional), dan **Cloudflare Pages** (Hosting Frontend).

---

## 1. Ikhtisar Arsitektur Keamanan

Aplikasi Donatur Helper menggunakan model pemisahan keamanan *client-side* (frontend) dan *server-side* (backend/Edge Functions):

```
┌────────────────────────────────────────────────────────┐
│             Frontend (Cloudflare Pages)               │
│  - Hanya mengakses SUPABASE_URL &                      │
│    SUPABASE_PUBLISHABLE_KEY (anon key)                 │
│  - Menghubungi Supabase dengan Row Level Security (RLS)│
│  - TIDAK PERNAH memuat SUPABASE_SECRET_KEY / Resend Key│
└───────────────────────────┬────────────────────────────┘
                            │
               Panggilan API & Edge Functions
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│            Supabase Edge Functions Runtime             │
│  - Menyimpan SUPABASE_SECRET_KEY & RESEND_API_KEY      │
│  - Menjalankan operasi admin dan pengiriman email      │
│  - Mengirim email via Resend REST API                  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Matriks Variabel & Klasifikasi Keamanan

| Variabel | Kebutuhan / Fungsi | Sumber Nilai (Dashboard) | Cakupan (Scope) | Lokasi Runtime |
| :--- | :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | URL endpoint API & Database Supabase | **Supabase Dashboard** &rarr; Project Settings &rarr; API &rarr; *Project URL* | **Client-Safe (Publik)** | Frontend (Cloudflare Pages) & Edge Functions |
| `SUPABASE_PUBLISHABLE_KEY` | Kunci publishable/anon publik untuk query client dengan proteksi RLS | **Supabase Dashboard** &rarr; Project Settings &rarr; API &rarr; *Project API keys* (`publishable` / `anon`) | **Client-Safe (Publik)** | Frontend (Cloudflare Pages) |
| `SUPABASE_SECRET_KEY` | Kunci master secret/service_role backend (bypass RLS) | **Supabase Dashboard** &rarr; Project Settings &rarr; API &rarr; *Project API keys* (`secret` / `service_role`) | 🚨 **RAHASIA TINGGI (Server-Only)** | Supabase Edge Functions Secrets SAJA |
| `BACKEND_MODE` | Penanda mode backend (`supabase` atau `apps_script`) | Konfigurasi aplikasi internal (`supabase`) | **Client-Safe (Publik)** | Frontend & Konfigurasi Lokal |
| `RESEND_API_KEY` | Kunci API untuk mengirim email notifikasi donatur | **Resend Dashboard** &rarr; *API Keys* (`https://resend.com/api-keys`) | 🚨 **RAHASIA TINGGI (Server-Only)** | Supabase Edge Functions Secrets SAJA |
| `EMAIL_FROM` | Alamat email & nama pengirim terverifikasi | **Resend Dashboard** &rarr; *Domains* (contoh: `Donatur Helper <notifikasi@domainanda.org>`) | **Server-Side** | Supabase Edge Functions |
| `APP_URL` | URL dasar aplikasi untuk tautan email dan redirect | URL lokal (`http://localhost:3000`) atau domain produksi | **Publik** | Frontend & Supabase Edge Functions |
| `SUPABASE_PROJECT_REF` | Reference ID proyek Supabase (CLI/deployment) | **Supabase Dashboard** &rarr; Project Settings &rarr; General &rarr; *Reference ID* | **DevOps / CLI** | Lokal `.env` / CI-CD |
| `SUPABASE_ACCESS_TOKEN` | Token akun untuk otomasi Supabase CLI | **Supabase Dashboard** &rarr; Account &rarr; *Access Tokens* | 🔒 **Rahasia Pengembang** | CLI Lokal / CI-CD Pipeline |

---

## 3. Detail Setiap Variabel

### 3.1 `SUPABASE_URL`
- **Fungsi:** Menjadi basis URL untuk inisialisasi Supabase JS Client di browser dan pemanggilan Edge Functions.
- **Format:** `https://<project-ref>.supabase.co`
- **Keamanan:** Aman diakses publik / frontend.

### 3.2 `SUPABASE_PUBLISHABLE_KEY`
- **Fungsi:** Kunci API client-side untuk otentikasi dan operasi data frontend (sebelumnya dikenal sebagai `anon` key). Seluruh akses data yang menggunakan key ini dibatasi secara ketat oleh aturan **PostgreSQL Row Level Security (RLS)**.
- **Format:** String API Key / JWT publik (`sb_pub_...` atau JWT `anon`).
- **Keamanan:** Aman diekspos ke browser asalkan RLS aktif di semua tabel database.

### 3.3 `SUPABASE_SECRET_KEY`
> [!CAUTION]
> **JANGAN PERNAH MENGEKSPOS `SUPABASE_SECRET_KEY` KE FRONTEND/BROWSER!**
> Kunci ini memiliki hak akses penuh (*superuser/admin*, service role) dan membypass seluruh aturan Row Level Security (RLS). Siapa pun yang memiliki kunci ini dapat membaca, mengubah, atau menghapus seluruh database tanpa batasan.

- **Fungsi:** Digunakan hanya oleh backend runtime (Supabase Edge Functions / Server) untuk operasi administratif tertentu (misal: webhook pembayaran, sinkronisasi data sistem).
- **Lokasi Penyimpanan:** Disimpan di Supabase Edge Functions Environment Secrets (`supabase secrets set SUPABASE_SECRET_KEY=...`).

### 3.4 `BACKEND_MODE`
- **Fungsi:** Menentukan backend adapter yang digunakan (`supabase` untuk backend baru atau `apps_script` jika membutuhkan fallback sementara selama proses migrasi).
- **Nilai:** `supabase`

### 3.5 `RESEND_API_KEY`
> [!CAUTION]
> **JANGAN PERNAH MEMASUKKAN `RESEND_API_KEY` KE BUNDLE FRONTEND!**
> Kunci API Resend memungkinkan pengiriman email tak terbatas atas nama domain Anda. Jika bocor di browser, penyerang dapat menyalahgunakan kuota pengiriman untuk spam/phishing yang merusak reputasi domain.

- **Fungsi:** Otentikasi pengiriman email transaksional (konfirmasi donasi, token PIC, pengingat tenggat).
- **Lokasi Penyimpanan:** Disimpan di Supabase Edge Functions Secrets SAJA. Frontend memicu pengiriman email dengan memanggil Edge Function, bukan memanggil API Resend secara langsung.

### 3.6 `EMAIL_FROM`
- **Fungsi:** Alamat email pengirim yang muncul di kotak masuk penerima.
- **Format:** `Nama Pengirim <email@domain-terverifikasi.com>` (contoh: `Donatur Helper <halo@donaturhelper.org>`).
- **Syarat:** Domain pengirim harus sudah lolos verifikasi DNS (DKIM, SPF, DMARC) di dashboard Resend.

### 3.7 `APP_URL`
- **Fungsi:** URL dasar aplikasi yang digunakan untuk menyusun tautan rujukan di dalam email (misal: tautan token PIC, halaman konfirmasi donasi).
- **Lokal:** `http://localhost:3000` (atau port dev server Anda).
- **Produksi:** `https://donatur-helper.pages.dev` (atau domain kustom Anda).

### 3.8 `SUPABASE_PROJECT_REF` & `SUPABASE_ACCESS_TOKEN` (Opsional)
- **Fungsi:** Digunakan untuk eksekusi perintah CLI lokal Supabase (migrasi database, deployment Edge Functions, sinkronisasi schema).
- **Penggunaan:** Hanya di terminal pengembang lokal atau GitHub Actions CI/CD.

---

## 4. Perbedaan Lingkungan: Lokal vs Produksi

### A. Pengembangan Lokal (Local Development)

1. **File `.env`:**
   - Salin file `.env.example` menjadi `.env`.
   - Masukkan URL dan kunci publishable lokal/staging Anda.
   - File `.env` sudah diabaikan oleh Git via `.gitignore`.
2. **Supabase Local / CLI:**
   - Saat menjalankan Supabase secara lokal via Docker/CLI (`supabase start`), CLI akan menyediakan URL lokal (`http://127.0.0.1:54321`) dan publishable/anon key lokal secara otomatis.
   - Untuk menguji Edge Functions lokal:
     ```bash
     supabase functions serve --env-file ./supabase/.env.local
     ```

### B. Produksi di Cloudflare Pages

1. **Konfigurasi Environment Variables di Cloudflare Dashboard:**
   - Buka **Cloudflare Dashboard** &rarr; **Workers & Pages** &rarr; Pilih Proyek **donatur-helper**.
   - Buka menu **Settings** &rarr; **Environment Variables**.
   - Tambahkan variabel yang dibutuhkan oleh Frontend:
     - `SUPABASE_URL`: `https://<id-proyek>.supabase.co`
     - `SUPABASE_PUBLISHABLE_KEY`: `<publishable-key-produksi>`
     - `BACKEND_MODE`: `supabase`
     - `APP_URL`: `https://donatur-helper.pages.dev`
2. **PENTING - Variabel yang TIDAK BOLEH ditambahkan ke Cloudflare Pages Frontend:**
   - ❌ `SUPABASE_SECRET_KEY`
   - ❌ `RESEND_API_KEY`

### C. Produksi di Supabase Edge Functions

Rahasia server-side disetel langsung ke runtime Supabase Edge Functions:
```bash
# Menyetel secrets produksi untuk Edge Functions
supabase secrets set RESEND_API_KEY="re_123456789..."
supabase secrets set EMAIL_FROM="Donatur Helper <notifikasi@domainanda.org>"
supabase secrets set APP_URL="https://donatur-helper.pages.dev"
```

Edge Functions secara otomatis memiliki akses ke `SUPABASE_URL` dan `SUPABASE_SECRET_KEY` bawaan lingkungan Supabase.

---

## 5. Ringkasan Aturan Keamanan (Security Rules Checklist)

- [x] **File `.env` terdaftar di `.gitignore`** (bersama `.env.local`, `.env.production`, `.env.cloudflare`).
- [x] **`.env.example` tidak berisi data rahasia asli**, hanya placeholder aman dan dokumentasi.
- [x] **Frontend hanya membaca variabel publik** (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `BACKEND_MODE`, `APP_URL`).
- [x] **`SUPABASE_SECRET_KEY` dan `RESEND_API_KEY` terisolasi di Edge Functions** dan tidak pernah dimuat ke JavaScript bundle browser.
- [x] **Semua tabel Postgres dilindungi dengan Row Level Security (RLS)** sebelum publishable key dipublikasikan.
