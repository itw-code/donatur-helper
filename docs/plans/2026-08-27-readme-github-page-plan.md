# README.md Repositori Donatur Helper Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Menambahkan berkas `README.md` komprehensif, manusiawi, dan berbahasa Indonesia di root repositori dengan tautan aplikasi aktif (`https://don4tpro.pages.dev`), panduan peran, arsitektur, dan instruksi lokal.

**Architecture:** Berkas Markdown statis di root repositori (`README.md`) yang otomatis ditampilkan oleh GitHub pada halaman repositori utama (`https://github.com/itw-code/donatur-helper`). Mengikuti kamus istilah domain di `CONTEXT.md` dan merujuk dokumen panduan operasional.

**Tech Stack:** GitHub Flavored Markdown (GFM), Mermaid Diagrams, Node.js Test Runner.

---

### Task 1: Buat Berkas README.md di Root Repositori

**Files:**
- Create: `README.md`
- References:
  - `docs/plans/2026-08-27-readme-github-page-design.md`
  - `CONTEXT.md`
  - `PANDUAN_USER_PIC.md`
  - `PANDUAN_ADMIN.md`
  - `package.json`

**Step 1: Tulis isi lengkap README.md**
Tulis isi `README.md` dengan struktur:
1. Header, lencana (versi, stack), dan tautan aplikasi aktif: `https://don4tpro.pages.dev`
2. Latar Belakang & Nilai Utama (Humanized, ramah, menjelaskan solusi patungan tanpa drama spreadsheet)
3. Fitur Utama berdasarkan Peran (Donatur, PIC Kampanye, Pengelola / Admin)
4. Diagram & Ringkasan Arsitektur Sistem (Frontend ES Modules, Supabase RPC & Storage, Cloudflare Pages, GAS Fallback)
5. Panduan Menjalankan Secara Lokal (Prasyarat, konfigurasi env, npm test, npm run build)
6. Tautan Dokumen Pendukung (Panduan PIC, Panduan Admin, Kamus Istilah)

**Step 2: Verifikasi Integritas Tautan dan Berkas**
Jalankan verifikasi:
- Periksa keberadaan file `README.md`
- Pastikan tautan produksi `https://don4tpro.pages.dev` terdapat di dalam berkas
- Pastikan berkas referensi (`PANDUAN_USER_PIC.md`, `PANDUAN_ADMIN.md`, `CONTEXT.md`) benar-benar ada di repo

**Step 3: Jalankan Pengujian Otomatis Repositori**
Jalankan tes repo untuk memastikan tidak ada efek samping:
`rtk npm test`
Expected: 111/111 passing tests.

**Step 4: Commit Berkas README.md**
```powershell
rtk git add README.md
rtk git commit -m "docs: add humanized Bahasa Indonesia README with live app link"
```
