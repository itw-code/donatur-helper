# Spesifikasi Sistem Komponen Antarmuka (UI Component System) DonatPRO v2.0

> Merek: **DonatPRO**  
> Konteks: Dana Solidaritas Karyawan &amp; Eks-Karyawan SawitPRO  
> Mesin Kerja: **Donatur Helper** (Digital Donation &amp; Verification Engine)

Dokumen ini merinci arsitektur, token, markup HTML, varian, dan aturan aksesibilitas untuk seluruh komponen antarmuka DonatPRO, terintegrasi penuh dengan **Tema Aurora OLED (Dark)** dan **Accessible Light Mode**.

## 1. Arsitektur Komponen

Setiap komponen dirancang mengikuti pola **shadcn/ui** berbasis semantic tokens dan CSS custom properties (`css/design-tokens.css`), dengan prinsip:
- **Zero Ambiguity:** Setiap elemen interaktif memiliki status `default`, `hover`, `active`, `focus-visible`, dan `disabled`.
- **Sentuhan Nyaman (Touch-friendly):** Target sentuh interaktif minimal `44 × 44 px` pada perangkat seluler.
- **Aksesibilitas Kontras (WCAG AAA/AA):** Teks reguler memiliki kontras minimal `4.5:1` (AA) hingga `7.0:1` (AAA) terhadap latar belakang permukaan.

---

## 2. Tombol (Buttons)

### 2.1 Varian Tombol

| Varian | Kelas CSS | Latar Belakang (Dark) | Latar Belakang (Light) | Kegunaan |
|---|---|---|---|---|
| **Primary** | `.btn` / `.btn-primary` | `#10B981` (Hover: `#34D399`) | `#059669` (Hover: `#047857`) | Tindakan utama: Simpan, Salurkan Donasi, Gabung |
| **Secondary** | `.btn.secondary` | `rgba(255,255,255,0.06)` | `#F1F5F9` | Tindakan kedua: Batal, Kembali, Salin Token |
| **Blue Action** | `.btn.blue` | `rgba(96,165,250,0.15)` | `#EFF6FF` | Tindakan perbankan: Lihat Rekening, Panduan Transfer |
| **Danger** | `.btn.danger` | `#B91C1C` (Hover: `#991B1B`) | `#DC2626` | Tindakan destruktif: Hapus Campaign, Tolak Bukti |
| **Ghost / Link** | `.link-btn` | Transparan (Teks: `#5EEAD4`) | Transparan (Teks: `#0D9488`) | Tautan navigasi sekunder |

### 2.2 Contoh Markup Tombol
```html
<!-- Tombol Utama dengan Ikon -->
<button class="btn btn-primary" type="button">
  <svg class="dh-btn-icon" width="18" height="18"><use href="assets/icons/sprite.svg#dh-heart"/></svg>
  <span>Salurkan Donasi</span>
</button>

<!-- Tombol Sekunder Transparan -->
<button class="btn secondary" type="button">
  <svg class="dh-btn-icon" width="18" height="18"><use href="assets/icons/sprite.svg#dh-receipt"/></svg>
  <span>Lihat Kuitansi</span>
</button>
```

---

## 3. Kartu & Panel Permukaan (Cards & Surfaces)

### 3.1 Kartu Standar (`.card`)
- **Dark Aurora:** Latar `rgba(255, 255, 255, 0.045)`, garis tepi `rgba(255, 255, 255, 0.09)`, radius sudut `14px`, bayangan `var(--dh-shadow-md)`.
- **Light Slate:** Latar `#FFFFFF`, garis tepi `#E2E8F0`, radius sudut `14px`, bayangan `0 4px 12px rgba(0,0,0,0.05)`.

### 3.2 Contoh Kartu Ringkasan Program (Campaign Card)
```html
<div class="card dh-campaign-card">
  <div class="card-header">
    <div class="dh-card-badges">
      <span class="badge badge-success">Terverifikasi</span>
      <span class="badge badge-info">Batch 4</span>
    </div>
    <h3 class="card-title">Paket Sembako Ramadhan Yatim &amp; Dhuafa</h3>
    <p class="card-subtitle">Koordinator Lapangan: Ahmad Fauzi (PIC)</p>
  </div>
  
  <div class="card-body">
    <!-- Progress Bar Penyaluran -->
    <div class="dh-progress-container">
      <div class="dh-progress-label">
        <span>Terkumpul: <strong>Rp 24.500.000</strong></span>
        <span>Target: <strong>Rp 25.000.000</strong></span>
      </div>
      <div class="pic-progress-track">
        <div class="pic-progress-bar" style="width: 98%;"></div>
      </div>
    </div>
  </div>

  <div class="card-footer">
    <button class="btn btn-primary btn-sm">Gabung Donatur</button>
    <a href="#" class="link-btn">Rincian Transparansi &rarr;</a>
  </div>
</div>
```

---

## 4. Lencana Status (Status Badges & Pills)

Digunakan untuk menampilkan tahapan donasi dan hak akses PIC secara seketika.

| Status | Kelas | Visual Dark Mode | Visual Light Mode | Arti Status |
|---|---|---|---|---|
| **Berjalan / Terbuka** | `.badge.open` / `.badge.success` | Teks `#6EE7B7`, latar `rgba(52,211,153,0.14)` | Teks `#065F46`, latar `#D1FAE5` | Campaign aktif menerima donatur |
| **Menunggu Verifikasi** | `.badge.closed` / `.badge.warning` | Teks `#FCD34D`, latar `rgba(251,191,36,0.13)` | Teks `#92400E`, latar `#FEF3C7` | Bukti diunggah, menunggu cek PIC |
| **Penyaluran Selesai** | `.badge.finalized` / `.badge.info` | Teks `#93C5FD`, latar `rgba(96,165,250,0.13)` | Teks `#1E40AF`, latar `#DBEAFE` | Donasi 100% tersalurkan ke warga |
| **Tertolak / Dibatalkan** | `.badge.danger` / `.badge.red` | Teks `#FCA5A5`, latar `rgba(248,113,113,0.14)`| Teks `#991B1B`, latar `#FEE2E2` | Bukti tidak valid / dibatalkan |
| **Arsip Data** | `.badge.archived` | Teks `#CBD5E1`, latar `rgba(255,255,255,0.07)`| Teks `#475569`, latar `#F1F5F9` | Data lampau tersimpan aman |

---

## 5. Kolom Isian Formulir (Form Controls & Inputs)

### 5.1 Spesifikasi Input
- **Tinggi Dasar:** `42px` (desktop), `46px` (mobile).
- **Padding:** `0 14px`.
- **Garis Tepi Default:** `1px solid rgba(255, 255, 255, 0.15)` (Dark), `1px solid #CBD5E1` (Light).
- **Garis Fokus (Focus Ring):** `outline: 2px solid #34D399` dengan `outline-offset: 1px`.
- **Placeholder Text:** `#8DA89C` (Dark), `#94A3B8` (Light) — rasio kontras `4.5:1` tetap terjaga.

### 5.2 Contoh Form Group Input Donasi
```html
<div class="dh-form-group">
  <label for="input-nominal" class="dh-form-label">Nominal Donasi (Rupiah)</label>
  <div class="dh-input-prefix-wrapper">
    <span class="dh-input-prefix">Rp</span>
    <input type="text" id="input-nominal" class="dh-input" placeholder="500.000" inputmode="numeric" />
  </div>
  <span class="dh-form-hint">Nominal akan diverifikasi otomatis sesuai mutasi bank.</span>
</div>
```

---

## 6. Tabel Data & Antrean Verifikasi (Data Tables & Queues)

Antrean verifikasi bukti transfer PIC dan Admin disusun dalam struktur baris responsif dengan kontras tinggi:

```html
<div class="table-responsive">
  <table class="dh-table">
    <thead>
      <tr>
        <th>Donatur</th>
        <th>Program</th>
        <th>Nominal</th>
        <th>Status</th>
        <th class="text-right">Tindakan</th>
      </tr>
    </thead>
    <tbody>
      <tr class="dh-row-pending">
        <td>
          <div class="dh-user-cell">
            <strong>Hamba Allah</strong>
            <span class="dh-subtext">WA: +62 812-***-9921</span>
          </div>
        </td>
        <td>Paket Sembako #4</td>
        <td class="dh-mono-cell">Rp 500.000</td>
        <td><span class="badge badge-warning">Menunggu Verifikasi</span></td>
        <td class="text-right">
          <button class="btn btn-sm btn-primary">Verifikasi</button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## 7. Kotak Dialog Modal (Modal Overlays)

- **Backdrop:** `rgba(0, 0, 0, 0.75)` dengan filter `backdrop-filter: blur(4px)`.
- **Permukaan:** `.theme-surface-modal` (`#0B1319` pada dark mode, `#FFFFFF` pada light mode).
- **Penutup Modal:** Tombol silang `×` dengan warna `#A8B8CF` (kontras `9.2:1`).
- **Aksi Bawah:** Tombol Batal (Secondary) dan Tombol Konfirmasi (Primary) berjejer rapi di kanan bawah.
