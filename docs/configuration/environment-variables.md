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
| `SUPABASE_URL` (Worker) | Secret Worker *keep-alive* Free Plan | **Supabase Dashboard** &rarr; Project Settings &rarr; API &rarr; *Project URL* | **Client-Safe (Publik)** | Cloudflare Worker (`workers/supabase-keepalive/`) |
| `SUPABASE_PUBLISHABLE_KEY` (Worker) | Secret Worker *keep-alive* Free Plan | **Supabase Dashboard** &rarr; Project Settings &rarr; API &rarr; *Project API keys* (`publishable` / `anon`) | **Client-Safe (Publik)** | Cloudflare Worker (`workers/supabase-keepalive/`) |
| `SUPABASE_SECRET_KEY` (Backup) | Backup mingguan membaca seluruh tabel (bypass RLS) | **Supabase Dashboard** &rarr; Project Settings &rarr; API &rarr; *Project API keys* (`secret` / `service_role`) |  **RAHASIA TINGGI (Server-Only)** | GitHub Actions `backup-supabase.yml` |
| `BACKUP_PASSPHRASE` (Backup) | Frasa sandi enkripsi artifact backup | Dibuat sendiri (acak, panjang) | 🚨 **RAHASIA TINGGI (Server-Only)** | GitHub Actions `backup-supabase.yml` + pengelola kata sandi |

> Detail mekanisme pencegahan penjedaan otomatis Free Plan ada di [Bagian 3.9](#39-keep-alive-free-plan-supabase-cloudflare-worker). Detail backup offsite ada di [Bagian 3.10](#310-backup-offsite-mingguan-github-actions).

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

### 3.9 Keep-Alive Free Plan Supabase (Cloudflare Worker)

Supabase otomatis **menjeda (*pause*)** proyek pada **Free Plan** yang tidak menerima cukup kueri basis data selama 7 hari berturut-turut. Proyek berbayar (Pro) tidak dapat dijeda otomatis. Referensi resmi: [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

Mekanisme *keep-alive* di repositori ini menggunakan **Cloudflare Worker**, bukan GitHub Actions — proyek ini di-deploy sepenuhnya di Cloudflare, sehingga *heartbeat* berjalan di akun Cloudflare yang sama dengan situs produksi dan tidak bergantung pada runner pihak ketiga.

| Aspek | Nilai |
| :--- | :--- |
| **Nama Worker** | `donatur-helper-supabase-keepalive` |
| **Berkas** | `workers/supabase-keepalive/wrangler.toml`, `workers/supabase-keepalive/src/index.js` |
| **Jadwal (Cron Trigger)** | `0 9,21 * * *` — dua kali sehari pukul 09:00 dan 21:00 UTC |
| **Aksi** | `POST {SUPABASE_URL}/rest/v1/rpc/get_public_settings` (baca-saja, tanpa argumen, *grant* ke `anon`) |
| **Retry** | 3x percobaan dengan jeda 1,5 detik (hanya jalur Cron); kegagalan akhir dilempar agar tercatat di Workers Logs |
| **Jalur kedua (redundansi)** | `GET` / `POST https://donatur-helper-supabase-keepalive.ihsantriwanda.workers.dev/ping` — satu heartbeat sekali jalan |
| **Observability** | `[observability] enabled = true` — log tersimpan, sehingga kegagalan terjadwal masih bisa didiagnosis setelah kejadian |
| **URL Worker** | `https://donatur-helper-supabase-keepalive.ihsantriwanda.workers.dev` |

> [!NOTE]
> **Mengapa dua kali sehari, bukan 3x/minggu?** Pedoman resmi Supabase berbunyi *"a few user requests to the database each day over the previous week is enough"* ([free-project-pausing](https://supabase.com/docs/guides/platform/free-project-pausing)). Jadwal Senin/Rabu/Jumat meninggalkan celah 3 hari (Jumat 09:00 &rarr; Senin 09:00 UTC) tepat di ambang batas yang tidak dipublikasikan. Dua kali sehari menutup celah itu dan tetap hanya ~60 pemanggilan/bulan dari kuota 100.000/hari.

> [!IMPORTANT]
> **Dua jalur heartbeat agar satu penjadwal bukan titik tunggal kegagalan.** `/ping` sengaja dibiarkan tanpa autentikasi: RPC yang sama memang sudah bisa dipanggil siapa pun yang memegang *publishable key*, dan key itu ikut terkirim di bundle frontend publik — jadi endpoint ini tidak membuka kemampuan basis data baru. Yang perlu disadari: `/ping` adalah request HTTP biasa, sehingga ikut memakai kuota **100.000 request/hari** milik Workers Free ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)); melewatinya memicu *Error 1027*. Untuk URL `workers.dev` yang tidak dipublikasikan, risiko ini diterima secara sadar, dan alarm `HEARTBEAT_URL` adalah jaring pengamannya.

> [!NOTE]
> Batas lain yang relevan pada Workers Free: **CPU time per Cron Trigger 10 ms** (waktu menunggu `fetch` tidak dihitung) dan maksimum **5 Cron Trigger per akun** — Worker ini memakai 1.

> [!NOTE]
> Panggilan ke `GET /rest/v1/` (root REST) TIDAK dihitung sebagai aktivitas basis data, karena tidak menyentuh Postgres. *Heartbeat* harus berupa kueri/RPC nyata — itulah alasan RPC `get_public_settings()` dipakai.

**Secrets Worker** (sudah terpasang di akun Cloudflare; bukan variabel `.env` frontend):

| Nama Secret | Nilai | Sumber |
| :--- | :--- | :--- |
| `SUPABASE_URL` | `https://hhgtospruzcjwlafvkhf.supabase.co` | **Supabase Dashboard** &rarr; Project Settings &rarr; API &rarr; *Project URL* |
| `SUPABASE_PUBLISHABLE_KEY` | Kunci `publishable` / `anon` | **Supabase Dashboard** &rarr; Project Settings &rarr; API &rarr; *Project API keys* |
| `HEARTBEAT_URL` *(opsional)* | URL *dead-man's switch*, mis. `https://hc-ping.com/<uuid>` | **healthchecks.io** (gratis) &rarr; langkah pemasangan di [§3.9.1](#391-buat-check-alarm-healthchecksio) |

> [!NOTE]
> `HEARTBEAT_URL` adalah **alarm**, bukan bagian dari mekanisme *keep-alive*. Worker memanggil URL ini setiap kali Cron berhasil (`POST <url>`), dan memanggil `<url>/fail` bila seluruh percobaan gagal. Jika Cron berhenti berjalan sama sekali, monitor tidak menerima ping dan mengirim email peringatan **sebelum** jendela 7 hari Supabase habis. Hanya jalur Cron yang memanggil switch — jadi bila jalur Cron mati sementara `/ping` eksternal tetap menghidupkan proyek, alarm tetap berbunyi. Selama secret ini belum diisi, Worker hanya mencatat peringatan dan tidak ada alarm.

> [!CAUTION]
> Jangan pernah menaruh `SUPABASE_SECRET_KEY` (service_role) pada Worker secret maupun bundle frontend. Gunakan **hanya** kunci publishable/anon.

**Operasional Worker:**

```bash
# Deploy ulang setelah mengubah kode/nama Worker
cd workers/supabase-keepalive
npx wrangler deploy

# WAJIB setelah deploy: buktikan binding secret masih hidup
curl -s "https://donatur-helper-supabase-keepalive.ihsantriwanda.workers.dev/ping"
# Harus balas {"ok":true,...} dengan HTTP 200. Bila balas
# "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY" (HTTP 502), binding
# terlepas: jalankan dua perintah secret put di bawah, lalu ulangi ping.

# Memutar (rotate) / memasang ulang secret
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put HEARTBEAT_URL        # opsional, alarm dead-man's switch

# Melihat daftar secret tanpa membocorkan nilainya
npx wrangler secret list

# Uji Cron Trigger secara lokal terhadap Supabase asli
npx wrangler dev --test-scheduled --env-file ../../.env
curl -X POST "http://127.0.0.1:8787/__scheduled?cron=0+9,21+*+*+*"

# Uji jalur kedua (redundansi) secara lokal, lalu terhadap produksi
curl -X POST "http://127.0.0.1:8787/ping"

# Log heartbeat produksi (live) — log historis ada di Workers Logs (observability)
npx wrangler tail donatur-helper-supabase-keepalive
```

> [!WARNING]
> **Bindings secret bisa terlepas saat deploy tanpa peringatan apa pun.** Teramati pada 19 Sep 2026: versi `10c833b4` (hasil `npx wrangler deploy`) membalas `GET /ping` dengan HTTP 502 *"Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY Worker secret"*, padahal `npx wrangler secret list` tetap menampilkan kedua secret. Percobaan balik membuktikan sumbernya adalah deploy, bukan secret yang hilang: rollback ke versi 18 Sep lalu deploy ulang mewarisi binding yang sehat dan `/ping` kembali HTTP 200.
>
> Karena itu `npx wrangler secret list` **bukan** bukti binding aktif — ia hanya mendaftar nama. Satu-satunya bukti yang sah adalah `GET /ping` yang mengembalikan `{"ok":true}` dari Worker produksi. Bila balasannya 502 *"Missing ... secret"*, jalankan dua `npx wrangler secret put` di atas lalu ulangi `/ping`.

Cara cepat menjalankan *heartbeat* sekali secara manual (misal setelah menerima email peringatan), tanpa Worker:

```bash
curl --fail-with-body -X POST "https://hhgtospruzcjwlafvkhf.supabase.co/rest/v1/rpc/get_public_settings" \
  -H "apikey: <publishable-key>" \
  -H "Authorization: Bearer <publishable-key>" \
  -H "Content-Type: application/json" -d '{}'
```

Jika proyek tetap dijeda, buka **Supabase Dashboard &rarr; Organizations &rarr; pilih proyek &rarr; Resume project**. Data tetap utuh dan dapat dipulihkan hingga 1 tahun setelah tanggal jeda.

#### 3.9.1 Buat Check Alarm (healthchecks.io)

Sekali saja. Diperlukan akun milik pemilik proyek.

1. Buka **healthchecks.io** &rarr; **Sign Up**.
2. Masukkan **hanya alamat email**. Pendaftaran memakai *magic link*, bukan kata sandi. Klik **Email Me a Link**.
3. Buka kotak masuk email. Klik tautan dari healthchecks.io. Tautan itu langsung memasukkan Anda.
4. *(Opsional)* **Account Settings** &rarr; **Set Password** bila ingin kata sandi.
5. Klik **Add Check**. Isi:

| Kolom | Nilai |
| :--- | :--- |
| **Name** | `Donatur Helper Supabase keepalive` |
| **Schedule type** | `Cron` |
| **Cron Expression** | `0 9,21 * * *` |
| **Time Zone** | `UTC` |
| **Grace Time** | `2 hours` |

6. **Save**, lalu salin **Ping URL** (bentuknya `https://hc-ping.com/<uuid>`). **Jangan** tambahkan `/fail` sendiri — Worker yang menambahkannya saat gagal.

> [!NOTE]
> Jadwal Check harus **sama** dengan Cron Worker (`0 9,21 * * *`, UTC). Bila zona waktu berbeda, alarm akan berbunyi beberapa jam lebih awal atau lebih lambat — lihat [FAQ resmi](https://healthchecks.io/faq/): *"The time zone on the client system must match the time zone that is configured for the check"*.

#### 3.9.2 Pasang Secret `HEARTBEAT_URL`

```bash
cd workers/supabase-keepalive
npx wrangler secret put HEARTBEAT_URL     # tempel Ping URL dari §3.9.1 saat diminta
```

Worker memanggil URL ini tiap Cron berhasil (`POST <url>`) dan memanggil `<url>/fail` bila seluruh percobaan gagal. Selama secret ini kosong, Worker hanya mencatat peringatan dan **tidak ada alarm**.

> [!WARNING]
> **URL yang salah tetap dibalas HTTP 200.** Pinging API healthchecks.io membalas `200 OK (not found)` untuk UUID yang tidak dikenal. Karena itu keberhasilan perintah `secret put` **bukan** bukti alarm bekerja — *typo* pada URL akan membuat Worker melaporkan sukses tanpa alarm apa pun.

> [!IMPORTANT]
> **Verifikasi yang sah: status `Up` di dashboard, bukan sukses di terminal.** Tunggu satu kali Cron berjalan (09:00 atau 21:00 UTC), lalu buka halaman Check di healthchecks.io. Statusnya harus **Up** dan log harus memuat ping. Bila masih **New**, Ping URL salah — ulangi perintah `secret put`.

#### 3.9.3 Jalur Kedua: Cron Eksternal (cron-job.org)

Jalur ini menghidupkan basis data saat Cron Trigger Cloudflare gagal. Sekali saja.

1. Buka **cron-job.org** &rarr; **Sign up**. Konfirmasi email **bila situs memintanya** (alur ini tidak terdokumentasi di halaman resminya).
2. **Create cronjob**. Isi:

| Kolom | Nilai |
| :--- | :--- |
| **Title** | `Donatur Helper Supabase keepalive (redundancy)` |
| **URL** | `https://donatur-helper-supabase-keepalive.ihsantriwanda.workers.dev/ping` |
| **Request method** | `GET` |
| **Schedule** | pukul `03:00` dan `15:00` UTC (ekspresi kustom `0 3,15 * * *`) |

3. Aktifkan **notifikasi email saat gagal**, bila formulir menyediakannya.
4. **Test run** &rarr; hasil harus **HTTP 200** dan badan balasan memuat `"ok":true`.
5. **Create**. Periksa riwayat eksekusi; setiap baris harus **200**.

> [!NOTE]
> **Mengapa `03:00` dan `15:00`, bukan sekali sehari?** Worker sudah berjalan pukul `09:00` dan `21:00` UTC. Tambahan `03:00`/`15:00` membuat empat heartbeat berjarak tepat 6 jam (03, 09, 15, 21) — celah terpanjang turun dari 12 jam menjadi 6 jam, dan bila satu eksekusi cron-job.org gagal, eksekusi lain di hari yang sama tetap menghidupkan proyek. Tetap satu job, tanpa biaya tambahan.

> [!WARNING]
> **cron-job.org menonaktifkan job secara otomatis setelah gagal lebih dari 25 kali berturut-turut** (indikasi URL tidak valid), dan job itu lalu diam. Aktifkan notifikasi email (langkah 3) agar penonaktifan itu terlihat. Konsekuensi lain dari jadwal dua kali sehari: ambang 25 kegagalan tercapai dalam ~12 hari, bukan ~25 hari — notifikasi kegagalan pertama tetap terkirim jauh sebelum itu.
>
> Interval tercepat yang diizinkan adalah **1 menit**; jangan lebih cepat. Kuota gratis: job tanpa batas jumlahnya, tetapi respons diputus setelah 30 detik dan 64 KB.

#### 3.9.4 Perawatan Berkala

| Frekuensi | Tindakan | Alasan |
| :--- | :--- | :--- |
| Setiap deploy Worker | `GET /ping` harus balas `{"ok":true}` | Binding secret bisa terlepas saat deploy (lihat WARNING di atas) |
| **Minimal sekali setahun** | Login ke akun healthchecks.io | Akun yang tidak dibuka >1 tahun dikirimi *"Inactive Account Notification"*, lalu dihapus 30 hari kemudian — pemantauan menjadi bisu |
| Saat alarm berbunyi | Cek `npx wrangler tail donatur-helper-supabase-keepalive`, lalu jalankan heartbeat manual | Bedakan kegagalan nyata dari gangguan sementara penyedia |

> [!NOTE]
> healthchecks.io dijalankan satu orang; FAQ resminya menyatakan **gangguan berjam-jam bahkan berhari-hari mungkin terjadi**. Gangguan semacam itu dapat memicu alarm palsu, tetapi tidak akan melewatkan kegagalan nyata.

**Tangga pemulihan tanpa upgrade ke Pro** (urut dari termurah):

| Situasi | Tindakan | Biaya |
| :--- | :--- | :--- |
| Menerima **email peringatan** (±1 minggu sebelum jeda) | Jalankan heartbeat manual (perintah `curl` di atas) atau buka proyek dari Dashboard | $0 |
| Proyek **sudah dijeda** | Klik **Resume project** di Dashboard; data utuh | $0 |
| Cron Worker tidak jalan | Panggil `POST /ping` dari penjadwal eksternal gratis (cron-job.org, UptimeRobot) sebagai jalur redundansi — lihat [§3.9.3](#393-jalur-kedua-cron-eksternal-cron-joborg) | $0 |
| Ingin tahu lebih awal | Isi secret `HEARTBEAT_URL` (healthchecks.io) — alarm via email bila Cron berhenti; lihat [§3.9.1](#391-buat-check-alarm-healthchecksio) dan [§3.9.2](#392-pasang-secret-heartbeat_url) | $0 |
| Masih dijeda **setelah lewat 1 tahun** (restore satu-klik kedaluwarsa) | Unduh backup dari Dashboard, atau upgrade ke Pro ($25/bulan per organisasi, [pricing](https://supabase.com/pricing)) satu bulan agar opsi restore yang kedaluwarsa aktif kembali, lalu turunkan lagi | $25 sekali |

> [!NOTE]
> Email konfirmasi Supabase menyebut jendela **90 hari**, sedangkan [dokumentasi resmi](https://supabase.com/docs/guides/platform/upgrading#time-limits) menyebut **1 tahun**. Jangan bergantung pada keduanya: apa pun tenggatnya, data tetap bisa diunduh sebagai backup setelahnya, dan proyek yang dibiarkan dijeda adalah satu-satunya risiko nyata.

---

### 3.10 Backup Offsite Mingguan (GitHub Actions)

Keep-alive mencegah penjedaan; backup menjamin data tetap dimiliki meskipun proyek dijeda, dihapus, atau restore satu-klik kedaluwarsa. Keduanya berbeda dan keduanya diperlukan.

Isi backup: **8 tabel** (`app_settings`, `members`, `campaigns`, `auth_tokens`, `donors`, `late_requests`, `reminder_logs`, `audit_logs`) **dan** seluruh isi bucket Storage `bukti-transfer` — yaitu gambar **Bukti Transfer** yang tidak dapat dibuat ulang dari basis data.

> [!CAUTION]
> **Repositori ini PUBLIK, dan artifact GitHub Actions dari repositori publik dapat diunduh siapa pun yang punya akses baca.** Karena itu workflow **wajib** mengenkripsi arsip sebelum mengunggahnya. Backup memuat nama **Member**, nomor WhatsApp, alamat email, dan **Bukti Transfer**. Jangan pernah menghapus langkah enkripsi, dan jangan pernah meng-commit berkas backup.

| Aspek | Nilai |
| :--- | :--- |
| **Workflow** | `.github/workflows/backup-supabase.yml` |
| **Jadwal** | Mingguan, Minggu 04:00 UTC (`0 4 * * 0`) + `workflow_dispatch` |
| **Skrip** | `scripts/migration/export-backup.mjs`, `encrypt-backup.mjs`, `decrypt-backup.mjs` |
| **Format arsip** | `DHBAK1` — header + salt scrypt + IV + AES-256-GCM + auth tag |
| **Retensi artifact** | 90 hari |

**Secrets repositori yang diperlukan** (Settings &rarr; Secrets and variables &rarr; Actions):

| Nama Secret | Nilai | Catatan |
| :--- | :--- | :--- |
| `SUPABASE_URL` | `https://hhgtospruzcjwlafvkhf.supabase.co` | Sama seperti Worker keep-alive |
| `SUPABASE_SECRET_KEY` | Kunci `secret` / `service_role` | **Bukan** kunci publishable; bypass RLS |
| `BACKUP_PASSPHRASE` | Frasa sandi acak yang panjang | **Tanpa ini backup tidak dapat dipulihkan.** Simpan di pengelola kata sandi |

> [!WARNING]
> **`BACKUP_PASSPHRASE` tidak tersimpan di mana pun di repositori ini.** Bila hilang, seluruh artifact menjadi tidak berguna secara permanen. Simpan di pengelola kata sandi **sebelum** menjalankan backup pertama.

> [!WARNING]
> **Workflow terjadwal di repositori publik dinonaktifkan otomatis setelah 60 hari tanpa aktivitas repositori** ([GitHub docs](https://docs.github.com/en/actions/reference/events-that-trigger-workflows), bagian `schedule`). Backup mingguan itu sendiri **bukan** aktivitas repositori. Bila tidak ada commit selama 60 hari, backup berhenti diam-diam. Periksa tab **Actions** minimal setiap dua bulan, dan aktifkan kembali workflow bila nonaktif.

**Menjalankan manual (lokal):**

```bash
npm run backup            # -> ./backup/          (mengandung data pribadi)
npm run backup:encrypt    # -> ./backup.dhbak     (butuh $BACKUP_PASSPHRASE)
npm run backup:decrypt    # -> ./restored/        (butuh $BACKUP_PASSPHRASE)
```

**Pulihkan dari artifact:**

1. Unduh artifact `supabase-backup-<n>` dari tab **Actions**.
2. Jalankan `BACKUP_PASSPHRASE='...' npm run backup:decrypt -- --in backup.dhbak --out restored`.
3. Terapkan `supabase/migrations/` ke proyek Supabase baru.
4. Muat `restored/tables/<tabel>.json` sebagai baris tabel, dan unggah `restored/storage/bukti-transfer/` kembali ke bucket `bukti-transfer`.

> [!IMPORTANT]
> **Pulihkan `app_settings` dengan tipe JSONB, bukan TEXT.** Nilai pada tabel itu bertipe `JSONB`, dan ekspor menghasilkan bentuk JSON. Memuatnya sebagai teks akan menghasilkan baris yang tampak benar tetapi gagal pada pemakaian (`{"EnableRounding": true}` tersimpan sebagai string, bukan boolean). Gunakan kolom `value` bertipe `JSONB` saat memuat.

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
