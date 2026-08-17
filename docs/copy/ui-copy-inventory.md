# Donatur Helper: UI Copy Inventory

Dokumen ini berisi inventaris lengkap seluruh teks dan pesan antarmuka pengguna (*user-visible UI copy*) pada aplikasi **Donatur Helper**, dikelompokkan berdasarkan peran pengguna (*role*), status sistem (*state*), komponen, dialog konfirmasi, dan templat pesan eksternal.

> **Catatan placeholder dinamis**: Variabel dinamis ditandai dengan kurung kurawal, contoh: `{targetName}`, `{count}`, `{amount}`, `{deadline}`, `{bankName}`.

---

## 1. Global Shell, Header & Modals

### 1.1 Brand & App Header
| Elemen | Lokasi | Teks Antarmuka |
|---|---|---|
| Main Brand Title | Header aplikasi | `Donatur Helper` |
| Default Document Title | Browser Tab | `Donatur Helper` |
| Dynamic Document Title | Browser Tab | `({pendingCount}) Pendaftaran Baru \| Donatur Helper` |
| Default Toast | Container `#toast` | `Teks berhasil disalin!` |

### 1.2 Modal Konfirmasi Global (`showConfirmModal`)
| Komponen | Teks / Template |
|---|---|
| Judul Modal | `Konfirmasi` |
| Tombol Batal | `Batal` |
| Tombol Lanjutkan | `Ya, Lanjutkan` |
| State Tombol Proses | `Memproses...` |

### 1.3 Modal Informasi Global (`showInfoModal`)
| Komponen | Teks / Template |
|---|---|
| Judul Default | `Informasi` |
| Judul Peringatan | `Peringatan` |
| Judul Perhatian | `Perhatian` |
| Judul Berhasil | `Sukses` |
| Judul Error | `Kendala Sistem` |
| Tombol Tutup | `Mengerti` |

---

## 2. Landing Page & Autentikasi

### 2.1 Landing Page (`#view-landing`)
| Elemen | Teks Antarmuka |
|---|---|
| Subjudul Hero | `Bantu kumpulkan donasi untuk kolega yang resign, secara rapi dan transparan.` |
| Tombol Utama (Donor) | `Saya mau donasi` |
| Tombol Sekunder (Token) | `Saya punya token (PIC / Admin / Super Admin)` |

### 2.2 Login Donatur / Member (`#view-user-login`)
| Elemen | Teks Antarmuka |
|---|---|
| Judul Form | `Masuk sebagai donatur` |
| Label Input WhatsApp | `No. WhatsApp` |
| Placeholder WhatsApp | `08xxxxxxxxxx` |
| Callout Privasi | `Kami menjaga privasi Anda. Nomor WhatsApp hanya digunakan untuk verifikasi login dan pengingat patungan donasi.` |
| Judul Subform Register | `Pendaftaran Baru` |
| Label Input Nama | `Nama Lengkap` |
| Placeholder Nama | `Nama kamu` |
| Petunjuk Nama | `Gunakan nama asli agar PIC mudah mengenali Anda saat mendata donasi.` |
| Label Status Karyawan | `Status Karyawan` |
| Pilihan Status (Default) | `-- Pilih Status --` |
| Pilihan Status: Active | `Active (Karyawan Saat Ini)` |
| Pilihan Status: Ex | `Ex (Alumni / Resign)` |
| Tombol Lanjut (Login) | `Lanjut` |
| Tombol Daftar (Register) | `Selesaikan Pendaftaran` |
| Tombol Kembali | `Kembali` |

#### Pesan Status & Validasi Login Donatur
| Kondisi | Tipe | Pesan / Modal |
|---|---|---|
| Input WhatsApp kosong | Error inline | `Harap isi Nomor WhatsApp.` |
| Loading cek nomor | Inline status | `Memeriksa nomor...` |
| Member berstatus Pending | Info Modal (`Menunggu Persetujuan`) | `Pendaftaran Anda sedang diproses. Mohon tunggu persetujuan Admin agar dapat masuk.` |
| Input Nama kosong | Error inline | `Harap isi Nama Lengkap.` |
| Status Karyawan belum dipilih | Error inline | `Harap pilih Status Karyawan.` |
| Loading registrasi | Inline status | `Memproses pendaftaran...` |
| Registrasi berhasil (pending) | Info Modal (`Pendaftaran Menunggu Persetujuan`) | `Pendaftaran berhasil dikirim! Mohon tunggu persetujuan dari Admin sebelum Anda bisa masuk.` |

### 2.3 Login Token (`#view-token-login`)
| Elemen | Teks Antarmuka |
|---|---|
| Judul Form | `Masuk dengan token` |
| Label Input Token | `Token` |
| Placeholder Token | `contoh: PIC-AB12CD34` |
| Tombol Lanjut | `Lanjut` |
| Tombol Kembali | `Kembali` |

---

## 3. Donor Dashboard (`#view-user-dashboard`)

### 3.1 Header & Identitas Donatur
| Elemen | Teks / Template |
|---|---|
| Role Eyebrow | `DONOR` |
| Judul Dashboard | `Perlu tindakan` |
| Greeting Pengguna | `Halo, {userName}` |
| Badge Member Terverifikasi | `Member terverifikasi` |
| Badge Member Alumni | `Member alumni` |
| Banner Peringatan Profil Email | `Email belum diisi. Tambahkan email di Profil agar Anda mendapat pengingat tagihan otomatis.` |
| Banner Alumni (Tidak bisa buat campaign) | `Status Anda adalah Alumni. Anda dapat berpartisipasi dalam donasi, tetapi pembuatan campaign baru hanya dapat dilakukan oleh karyawan aktif.` |
| Tombol Buat Campaign (PIC) | `+ Buat Campaign Baru (Jadi PIC)` |
| Tombol Profil | `Profil` |

### 3.2 Modal Profil Donatur (`#profile-modal`)
| Elemen | Teks Antarmuka |
|---|---|
| Judul Modal | `Profil Anda` |
| Label WhatsApp | `Nomor WhatsApp (Tidak bisa diubah)` |
| Label Nama | `Nama Anda` |
| Label Email | `Email (Opsional, untuk pengingat otomatis)` |
| Placeholder Email | `contoh@email.com` |
| Validasi Nama Kosong | `Nama tidak boleh kosong.` |
| Status Menyimpan | `Menyimpan...` |
| Sukses Simpan | `Profil berhasil diperbarui.` |
| Tombol Simpan | `Simpan Profil` |
| Tombol Tutup | `Tutup` |
| Tombol Keluar Akun | `Keluar Akun` |

### 3.3 Section "Campaign Saya (Sebagai PIC)"
| Elemen | Teks / Template |
|---|---|
| Judul Section | `Campaign Saya (Sebagai PIC)` |
| Nama Target | `{targetName}` |
| Badge Status | `{statusBadge}` |
| Tombol Kelola (Active) | `Kelola` |
| Tombol Hapus (Draft) | `Hapus` |
| Konfirmasi Hapus Draft | `Hapus draft campaign ini? Tindakan ini tidak bisa dibatalkan.` |
| Toast Hapus Draft | `Draft campaign berhasil dihapus.` |

### 3.4 Attention Banner & Deep-Link Campaign
| Elemen | Teks / Template |
|---|---|
| Banner Perlu Perhatian | `{count} pembayaran menunggu. Bayar sebelum deadline agar campaign selesai tepat waktu.` |
| CTA Banner (1 item) | `Lihat tagihan` |
| CTA Banner (>1 item) | `Lihat tagihan gabungan` |
| Heading Undangan Khusus (URL param `#c=`) | `Campaign Undangan` |
| Tombol Kembali Semua Campaign | `Lihat Semua Campaign` |
| Error Campaign Tidak Ditemukan | `Campaign tidak ditemukan atau sudah diarsipkan.` |

### 3.5 Section "Menunggu Pembayaran" & Pembayaran Gabungan
| Elemen | Teks / Template |
|---|---|
| Judul Section Tagihan | `Menunggu Pembayaran` |
| Judul Card Gabungan | `Pembayaran Gabungan ({count} Campaign)` |
| Badge Menunggu Pembayaran | `Menunggu Pembayaran` |
| Deskripsi Gabungan | `Menggabungkan patungan untuk:` |
| Item Rincian Gabungan | `{targetName} ({amountDue})` |
| Label Total Gabungan | `Total nominal gabungan yang harus ditransfer:` |
| Salin Nominal Gabungan | `Salin` |
| Tujuan Rekening Gabungan | `Ke: {bankName} {bankAccount} a.n. {accountHolder}` |
| Salin Nomor Rekening | `Salin` |
| Toast Salin Rekening | `Nomor rekening disalin!` |
| Toast Salin Nominal | `Nominal Rp {formattedText} berhasil disalin untuk m-banking!` |
| Label Upload Bukti Gabungan | `Upload satu bukti transfer untuk semua campaign di atas` |
| Petunjuk Upload Bukti | `Unggah bukti transfer (format JPG, PNG, atau PDF maks 2MB). Bukti hanya digunakan oleh PIC untuk verifikasi.` |
| Tombol Konfirmasi Transfer | `Konfirmasi Transfer` |
| State Tombol Upload | `Mengunggah...` |
| Validasi File Kosong | `Pilih file bukti transfer dulu.` |
| Error Baca PDF | `Gagal membaca file PDF.` |
| Error Baca Gambar | `Gagal membaca file gambar.` / `Gagal membaca gambar, coba file lain.` |
| Toast Sukses Bukti Gabungan | `Bukti transfer gabungan berhasil dikirim.` |

### 3.6 Card Campaign Mandiri (Donor View)
| Elemen / State | Teks / Template |
|---|---|
| Reason / Catatan | `{reason}` |
| Total Hadiah | `Total hadiah: {giftAmount} · {donorCount} donatur · deadline {deadline}` |
| Total Hadiah (Belum ditentukan) | `Total hadiah: Ditentukan nanti · {donorCount} donatur` |
| Link Barang / Hadiah | `Lihat Barang/Hadiah` |
| Link Bukti Harga | `Lihat Screenshot Harga` |
| **State: Open (Sudah Terdaftar)** | `Kamu sudah terdaftar di list ini. Menunggu finalisasi oleh PIC.` |
| Tombol Batal Ikut | `Batal ikut` |
| **State: Open (Belum Terdaftar)** | Form pendaftaran donasi mandiri |
| Checkbox Nominal Khusus | `Saya ingin donasi dengan nominal khusus` |
| Label Nominal Khusus | `Nominal Khusus (IDR)` |
| Placeholder Nominal Khusus | `Contoh: 100.000` |
| Checkbox Alias / Anonim | `Sembunyikan Nama Asli (Gunakan Alias)` |
| Label Input Alias | `Nama Alias / Samaran` |
| Placeholder Alias | `Contoh: Hamba Allah` |
| Tombol Gabung Donasi | `Gabung Donasi untuk {targetName}` |
| State Tombol Gabung | `Memproses...` |
| Validasi Nominal Khusus | InfoModal (`Peringatan`): `Silakan masukkan nominal khusus yang valid.` |
| Validasi Alias Kosong | InfoModal (`Peringatan`): `Silakan isi nama alias.` |
| **State: Closed (Menunggu PIC)** | `List sudah ditutup, menunggu PIC menentukan jumlah & rekening.` |
| **State: Finalized (Belum Bayar)** | Box rincian transfer biru |
| Label Jumlah Transfer | `Jumlah yang harus ditransfer:` |
| Nilai Tagihan | `{amountDue}` |
| Tujuan Transfer | `Ke: {bankName} {bankAccount} a.n. {accountHolder}` |
| Label Upload Bukti | `Upload bukti transfer` |
| Tombol Kirim Bukti | `Sudah transfer, kirim bukti` |
| **State: Finalized (Sudah Bayar)** | `Sudah konfirmasi transfer.` |
| Link Bukti Pembayaran | `Lihat bukti transfer` |
| **State: Finalized (Bukan Peserta)** | `Kamu tidak terdaftar sebagai donatur di campaign ini.` |
| **State: Archived** | `Campaign sudah selesai/diarsipkan.` |

### 3.7 Section "Bisa Diikuti" & Patungan Massal
| Elemen | Teks / Template |
|---|---|
| Judul Section | `Bisa Diikuti` |
| Box Patungan Massal | `Gabung Banyak Campaign` |
| Petunjuk Patungan Massal | `Centang campaign di bawah, lalu klik tombol ini untuk gabung sekaligus.` |
| Checkbox Pilih Semua | `Pilih Semua` |
| Tombol Trigger Modal Massal | `Ikut Patungan Massal` |
| Judul Modal Patungan Massal | `Ikut Patungan Massal` |
| Deskripsi Pilihan Campaign | `Anda memilih untuk bergabung ke {count} campaign sekaligus.` |
| Label Tipe Patungan | `Tipe Patungan:` |
| Pilihan: Patungan Rata | `Patungan Rata (bagi rata tagihan nanti)` |
| Pilihan: Nominal Bebas | `Nominal Bebas (tulis nominal sendiri)` |
| Label Nominal Per Campaign | `Nominal Per Campaign (Rp):` |
| Placeholder Nominal Bebas | `Contoh: 50000` |
| Label Alias (Opsional) | `Nama Alias (Opsional, jika ingin nama disamarkan):` |
| Placeholder Alias Massal | `Contoh: Hamba Allah` |
| Tombol Batal Modal | `Batal` |
| Tombol Submit Massal | `Gabung` |
| State Tombol Submit | `Memproses...` |
| Validasi Campaign Kosong | InfoModal (`Info`): `Pilih minimal satu campaign terlebih dahulu.` |
| Toast Sukses Massal | `Berhasil bergabung di {count} campaign.` |

### 3.8 Section "Campaign yang Diikuti" & "Riwayat Selesai"
| Elemen | Teks / Template |
|---|---|
| Judul Section Diikuti | `Campaign yang Diikuti` |
| Summary Disclosure Riwayat | `Riwayat Campaign Selesai ({count})` |

---

## 4. PIC Dashboard & Campaign Management

### 4.1 Header Form Pembuatan Campaign (`#view-pic-create`)
| Elemen | Teks Antarmuka |
|---|---|
| Judul Form | `Buat campaign donasi baru` |
| Label Nama Target | `Nama target (yang resign)` |
| Placeholder Target | `contoh: Ihsan Wanda` |
| Label Nilai Hadiah | `Total nilai hadiah (IDR)` |
| Placeholder Hadiah | `1.000.000` |
| Label Alasan / Catatan | `Alasan / catatan (opsional)` |
| Placeholder Catatan | `contoh: resign per 1 Juli 2026` |
| Label Tanggal Mulai | `Tanggal mulai (opsional)` |
| Label Deadline Donasi | `Deadline donasi` |
| Tombol Submit | `Buat campaign` |
| State Tombol Submit | `Membuat...` |
| Tombol Keluar / Batal | `Keluar / Batal` |

### 4.2 Dashboard PIC Shell (`#view-pic-dashboard`)
| Elemen | Teks / Template |
|---|---|
| Role Eyebrow | `PIC · CAMPAIGN` |
| Judul Dashboard (Default) | `Dashboard PIC` / `{targetName}` |
| Subjudul Dashboard | `Lihat progres campaign dan tindakan berikutnya.` / `{reason} · deadline {deadline}` |
| Tombol Keluar / Ganti Akun | `Keluar / Ganti Akun` |
| Tombol Kembali ke Admin | `Kembali ke Dashboard Admin` |
| Tombol Kembali ke Member | `Kembali ke Dashboard Member` |

### 4.3 Kartu Progres Campaign (`#pic-campaign-info`)
| Elemen | Teks / Template |
|---|---|
| Eyebrow | `PROGRES CAMPAIGN` |
| Nominal Terkumpul | `{collected} terkumpul` |
| Subtitle Target & Deadline | `Target hadiah {giftAmount} · deadline {deadline}` |
| Target Belum Ditentukan | `Target hadiah Belum ditentukan · deadline {deadline}` |
| Callout Langkah Selanjutnya (Zero State) | `Langkah selanjutnya: Tentukan total hadiah dan rekening sebelum menagih donatur.` |
| Metrik: Pengingat Pembayaran | `Pengingat pembayaran` (`{count}`) |
| Metrik: Bukti Ditinjau | `Bukti Transfer perlu ditinjau` (`{count}`) |
| Metrik: Terverifikasi | `Sudah diverifikasi` (`{count}`) |
| Accessible Progressbar Label | `Progres campaign {percent} persen` |

### 4.4 Antrean Tindakan Cepat PIC (`renderPicActionQueue`)
| Tipe Tindakan | Label Tombol | Deskripsi |
|---|---|---|
| Reminder Pembayaran | `Kirim pengingat WA` | `{count} Donatur belum upload Bukti Transfer.` |
| Tinjau Bukti Transfer | `Tinjau Bukti Transfer` | `{count} Bukti Transfer menunggu verifikasi.` |
| Refund Kelebihan | `Refund` | `{count} Donatur menunggu penyelesaian refund.` |
| Status Semua Selesai (dengan donor) | Status | `Semua pembayaran terverifikasi.` |
| Status Kosong (tanpa donor) | Status | `Belum ada tindakan pembayaran.` |
| Action Button (State Closed) | Tombol CTA | `Input rekening` |
| Action Button (State Open) | Tombol CTA | `Lihat tindakan berikutnya` |

### 4.5 Panel Tindakan PIC (`#pic-actions`)
| Elemen | Teks / Template |
|---|---|
| Heading Section | `Tindakan berikutnya · Prioritaskan tindakan` |
| **Share Box: State Open/Closed** | |
| Judul Box | `Bagikan Undangan Patungan:` |
| Keterangan | `Salin pesan undangan beserta daftar peserta yang sudah bergabung.` |
| Tombol Salin | `Salin Undangan Patungan` |
| **Share Box: State Finalized (Belum Lengkap)** | |
| Judul Box | `Tagihan Patungan (Grup):` |
| Keterangan | `Salin rincian tagihan pro-rata, nominal bebas, dan nomor rekening untuk dibagikan ke grup.` |
| Tombol Salin | `Salin Rincian Tagihan` |
| **Share Box: State Finalized (Semua Terverifikasi)** | |
| Judul Box | `Target Terkumpul!` |
| Keterangan | `Semua pembayaran terverifikasi. Salin pesan terima kasih untuk grup.` |
| Tombol Salin | `Salin Laporan Selesai` |
| **Share Box: State Archived** | `Campaign Selesai: Campaign sudah selesai/diarsipkan.` |
| Tombol Utama (Open/Closed) | `Selesaikan & input rekening` |
| Tombol Tutup Pendaftaran (Open) | `Tutup pendaftaran` |
| Tombol Buka Lagi Pendaftaran (Closed) | `Buka lagi pendaftaran` |
| Progress Upload Bukti (Finalized) | `{paidCount} / {totalDonors} sudah upload bukti` |
| Alert Refund Perlu Diselesaikan | `Total Perlu Refund: {totalRefund}` |
| Tombol Setujui Semua Bukti | `Setujui Semua Bukti` |
| Tombol Ajukan Donatur Susulan | `+ Ajukan Donatur Susulan` |
| Tombol Upload Dokumentasi Hadiah | `Upload Foto & Link Hadiah` |
| Pesan Campaign Nonaktif (Archived) | `Campaign sudah diarsipkan. Token ini sudah tidak aktif.` |

### 4.6 Form Finalisasi Campaign (`#finalize-form`)
| Elemen | Teks / Template |
|---|---|
| Penjelasan Pembulatan Aktif | `Pembulatan AKTIF: tiap orang akan dibulatkan ke atas ke kelipatan {roundTo}.` |
| Penjelasan Pembulatan Nonaktif | `Pembulatan NONAKTIF: nominal dibagi rata (selisih kecil ditanggung sebagian donatur agar totalnya pas).` |
| Label Total Hadiah Akhir | `Total Harga Hadiah Akhir (IDR)` |
| Placeholder Total Hadiah | `Contoh: 1.000.000` |
| Label Nama Bank | `Nama bank` |
| Placeholder Bank | `contoh: BCA` |
| Label Nomor Rekening | `No. rekening` |
| Placeholder Rekening | `1234567890` |
| Label Pemilik Rekening | `Nama pemilik rekening` |
| Placeholder Pemilik Rekening | `Nama PIC` |
| Label Link Hadiah | `Link Barang / Hadiah (Opsional)` |
| Placeholder Link Hadiah | `https://tokopedia.com/...` |
| Label Screenshot Harga | `Screenshot Total Harga (Opsional)` |
| Tombol Konfirmasi Finalisasi | `Konfirmasi & finalisasi` |
| State Tombol Finalisasi | `Memproses...` / `Menyimpan ke server...` |
| Validasi Ukuran Gambar | `Ukuran gambar maksimal 2MB.` |

### 4.7 Form Pengajuan Donatur Susulan (`#late-donor-form`)
| Elemen | Teks / Template |
|---|---|
| Judul Form | `Ajukan Donatur Susulan` |
| Deskripsi Form | `Tambahkan teman yang belum sempat daftar di list sebelumnya.` |
| Label Nama Teman | `Nama Teman:` |
| Placeholder Nama | `cth: Budi Susanto` |
| Label WhatsApp | `No WhatsApp:` |
| Placeholder WhatsApp | `cth: 08123456789` |
| Label Tipe Nominal | `Tipe Nominal:` |
| Pilihan Tipe: Rata | `Ikuti Nominal Rata-rata` |
| Pilihan Tipe: Bebas | `Nominal Bebas (Custom)` |
| Label Nominal Donasi | `Nominal Donasi (Rp):` |
| Placeholder Nominal | `cth: 50000` |
| Tombol Simpan Susulan | `Simpan & Masukkan ke List` |
| Tombol Batal Susulan | `Batal` |
| State Tombol Susulan | `Mengirim...` |
| Validasi Kolom Kosong | `Harap isi semua kolom.` |
| Toast Sukses Susulan | `Pengajuan berhasil dikirim ke Admin!` |

### 4.8 Form Dokumentasi Hadiah (`#gift-proof-form`)
| Elemen | Teks / Template |
|---|---|
| Validasi Input Kosong | `Harap isi link atau upload foto hadiah.` |
| Status Menyimpan | `Menyimpan...` |
| Toast Sukses Hadiah | `Dokumentasi hadiah berhasil disimpan!` |

### 4.9 Tabel & Card Antrean Donatur PIC (`#pic-donor-list`)
| Elemen / Grup Antrean | Teks / Template |
|---|---|
| Heading Antrean Dinamis | `Donatur perlu tindakan · {reminderCount} pengingat · {reviewCount} tinjau · {refundCount} refund · {missingCount} data perlu dicek` |
| Banner Settled Reassurance | `Semua donor selesai · Semua pembayaran terverifikasi dan final. Tidak ada tagihan tertunda.` |
| Reassurance Tanpa Tagihan | `Semua donatur sudah tertata. Tidak ada tindakan pembayaran yang tertunda.` |
| Header Sub-antrean Reminder | `PENGINGAT PEMBAYARAN` |
| Tombol Salin Rekap Pengingat | `Salin Rekap Pengingat ({count})` |
| Header Sub-antrean Review | `BUKTI TRANSFER PERLU DITINJAU` |
| Header Sub-antrean Refund | `REFUND PERLU DISELESAIKAN` |
| Header Sub-antrean Missing Proof | `BUKTI TRANSFER BELUM TERSEDIA` |
| Header Sub-antrean Complete | `TERVERIFIKASI ({count})` |
| **Badge & Label Status Donatur** | |
| Badge Terverifikasi / Terdaftar | `Terverifikasi` / `Terdaftar` |
| Badge Perlu Review Bukti | `Perlu Ditinjau` |
| Badge Bukti Belum Diupload | `Bukti Belum Diunggah` |
| Badge Belum Bayar | `Belum Bayar` |
| Badge Refund Selesai | `Dikembalikan` (Kelebihan: `{amount}`) |
| Badge Refund Pending | `Refund perlu diselesaikan: {amount}` |
| Tombol Tandai Refund | `Tandai Dikembalikan` |
| Konfirmasi Tandai Refund | `Tandai refund sebagai sudah dikembalikan?` |
| Toast Sukses Refund | `Refund berhasil ditandai selesai.` |
| **Aksi & Timeline Donatur** | |
| Label Milestone | `Daftar: {time}` · `Bayar: {time}` · `Verif ({picName}): {time}` · `Refund ({picName}): {time}` |
| Link Bukti Transfer | `Lihat Bukti` |
| Peringatan Refund Sebelum Verif | `Selesaikan refund dulu sebelum verifikasi.` |
| Tombol Konfirmasi Pembayaran | `Konfirmasi` |
| Tombol Tolak Pembayaran | `Tolak` |
| Label Bukti Dikonfirmasi | `Sudah dikonfirmasi` |
| Callout Missing Proof | `Bukti Transfer belum tersedia · Minta Donatur upload ulang sebelum verifikasi.` |
| Tombol Reminder Personal WA | `Kirim pengingat WA` |
| Selesai (Final Settled Card) | `Selesai · Tidak ada tindakan lanjutan untuk donatur ini.` |
| Label Card & Footer Total | `Total Tagihan: {totalTagihan}` / `Total Keseluruhan Tagihan:` |
| Konfirmasi Verifikasi Single | `Yakin ingin {konfirmasi/tolak} bukti transfer donatur ini?` |
| Toast Verifikasi Single | `Bukti transfer berhasil di{konfirmasi/tolak}.` |
| Konfirmasi Verifikasi Massal | `Yakin ingin menyetujui/mengonfirmasi SEMUA bukti transfer yang sudah diupload?` |
| Toast Verifikasi Massal | `Berhasil mengonfirmasi {count} bukti transfer.` |

### 4.10 Zona Berbahaya PIC (`#pic-danger-zone`)
| Elemen | Teks / Template |
|---|---|
| Judul Section | `Zona Berbahaya` |
| Tombol Hapus Campaign | `Hapus campaign` |
| Konfirmasi Hapus Campaign | `Hapus campaign ini? Semua data campaign dan donatur akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.` |
| Toast Hapus Campaign | `Campaign berhasil dihapus.` |
| Tombol Arsipkan Campaign | `Arsipkan campaign` |
| Konfirmasi Arsipkan Campaign | `Arsipkan campaign ini? Token PIC akan nonaktif.` |
| Toast Arsipkan Campaign | `Campaign berhasil diarsipkan.` |

---

## 5. Admin Dashboard (`#view-admin-dashboard`)

### 5.1 Navigasi Sticky Admin
| Item Navigasi | Teks Antarmuka |
|---|---|
| Link Ringkasan | `Ringkasan` |
| Link Campaign | `Campaign` |
| Link Members | `Members` |
| Link Tools PIC | `Tools PIC` |
| Link Keluar | `Keluar` |

### 5.2 Header & Antrean Tindakan Admin (`#admin-action-queue`)
| Elemen | Teks / Template |
|---|---|
| Role Eyebrow | `ADMIN · OPERATIONS` |
| Judul Halaman | `Perlu ditinjau` |
| Subjudul Halaman | `Persetujuan dan pengecualian campaign berada di urutan teratas.` |
| Judul Antrean | `Perlu ditinjau` |
| Subjudul Antrean | `Persetujuan dan pengecualian tampil lebih dulu supaya tindakan berikutnya selalu jelas.` |
| Status Antrean Loading | `Memuat antrean...` |
| Status Antrean Parsial | `Antrean belum lengkap` |
| Status Antrean Berisi | `{total} item perlu tindakan` |
| Status Antrean Kosong (Total) | `0 item perlu tindakan` |
| Banner Notifikasi Polling | `Ada {count} pendaftaran member baru yang memerlukan persetujuan!` |
| Tombol Lihat Detail Banner | `Lihat Detail` |
| **Row Antrean Pendaftaran Member** | |
| Judul Row | `{count} pendaftaran member` |
| Deskripsi Row | `Periksa status Active atau Ex sebelum menyetujui.` |
| Tombol Review Row | `Tinjau` |
| **Row Antrean Donatur Susulan** | |
| Judul Row | `{count} donatur susulan` |
| Deskripsi Row | `Persetujuan akan menghitung ulang tagihan campaign.` |
| Tombol Review Row | `Tinjau` |
| Keterangan Antrean Kosong | `Tidak ada item yang perlu ditinjau.` |

### 5.3 Persetujuan Member Baru (`#admin-pending-card`)
| Elemen | Teks / Template |
|---|---|
| Judul Card | `Menunggu Persetujuan Member` |
| Checkbox Pilih Semua | `Pilih Semua` |
| Tombol Setujui Terpilih | `Setujui Terpilih` |
| Tombol Tolak Terpilih | `Tolak Terpilih` |
| Label Status Karyawan | `Active (Karyawan)` |
| Label Status Alumni | `Ex (Alumni)` |
| Tombol Aksi Single | `Setujui` / `Tolak` |
| Accessible Label Tombol | `Setujui pendaftaran {name}` / `Tolak pendaftaran {name}` |
| Header Tabel Desktop | `Nama` \| `WhatsApp` \| `Status Awal` \| `Aksi` |
| Validasi Member Terpilih Kosong | InfoModal (`Info`): `Pilih minimal satu member terlebih dahulu.` |
| Toast Sukses Bulk Approve | `Status member terpilih berhasil diperbarui.` |
| Error Gagal Memuat | `Pendaftaran belum dapat dimuat. Coba lagi` |

### 5.4 Persetujuan Donatur Susulan (`#admin-late-card`)
| Elemen | Teks / Template |
|---|---|
| Judul Card | `Persetujuan Donatur Susulan` |
| Header Tabel Desktop | `Campaign (PIC)` \| `Donatur Susulan` \| `Nominal` \| `Alasan` \| `Aksi` |
| Badge Nominal Khusus | `Khusus: {amount}` |
| Badge Patungan Rata | `Patungan Rata` |
| Status Card | `Perlu ditinjau` |
| Tombol Aksi | `Setujui` / `Tolak` |
| Accessible Label | `Setujui pengajuan {donorName}` / `Tolak pengajuan {donorName}` |
| Konfirmasi Setujui Susulan | `Peringatan: Menyetujui ini akan langsung mendaftarkan member (jika baru) dan MENGHITUNG ULANG tagihan donatur lain di campaign tersebut. Lanjutkan?` |
| State Kosong | `Tidak ada pengajuan donatur susulan.` |
| Error Gagal Memuat | `Gagal memuat pengajuan. Coba lagi` |

### 5.5 Ringkasan Operasional (`#admin-summary`)
| Metrik | Label Antarmuka |
|---|---|
| Judul Card | `Ringkasan Operasional` |
| Status Campaign | `Campaign Terbuka` (`{count}`) |
| Status Campaign | `Menunggu Finalisasi` (`{count}`) |
| Status Campaign | `Final` (`{count}`) |
| Total Donatur | `Total donatur` (`{count}`) |
| Total Belum Dibayar | `Belum dibayar` (`{totalPending}`) |
| Total Terkumpul | `Terkumpul` (`{totalCollected}`) |
| Token PIC Summary | `Token PIC: {unused} belum dipakai, {active} aktif, {expired} kedaluwarsa.` |
| Member Summary | `Members: {total} total di database ({active} aktif).` |
| Loading State | `Memuat ringkasan...` |
| Error State | `Ringkasan belum dapat dimuat. Coba lagi` |

### 5.6 Manajemen Campaign Admin (`#admin-section-campaigns`)
| Elemen | Teks / Template |
|---|---|
| Judul Section | `Semua campaign` |
| Label Cari Campaign | `Cari campaign` |
| Placeholder Cari | `Target atau nama PIC...` |
| Label Filter Status | `Filter status` |
| Opsi Status Filter | `Semua status` \| `Terbuka` \| `Ditutup` \| `Final` \| `Selesai` |
| Petunjuk Toolbar | `Cari dan filter tersedia sebelum data ditampilkan.` |
| Summary Filter | `Memuat campaign...` / `{visibleCount} dari {totalCount} campaign ditampilkan.` |
| Loading Daftar | `Memuat daftar campaign...` |
| State Kosong Total | `Belum ada campaign.` |
| State Kosong Terfilter | `Tidak ada campaign yang sesuai filter.` |
| **Metrik & Callout Card Campaign** | |
| Header Label Card | `Target` (`{targetName}`) |
| Donatur Terkumpul Count | `{paidCount}/{donorCount} sudah bayar` |
| Callout Overdue Campaign | `Campaign terlewat: Hubungi PIC untuk menutup pendaftaran atau perbarui deadline.` |
| Toggle Detail Info PIC & Log | `Info PIC & Log` |
| Info PIC | `PIC: {picName}` |
| Info Terakhir Diupdate | `Terakhir diupdate: {time} oleh {modifiedBy}` |
| Tombol Aksi Card | `Lihat detail` \| `Arsipkan` \| `Hapus campaign` |
| Konfirmasi Arsipkan Admin | `Arsipkan campaign ini?` |
| Konfirmasi Hapus Admin (SA) | `Hapus campaign ini secara permanen? Tidak bisa dibatalkan.` |

### 5.7 Modal Detail Campaign Admin (`adminView`)
| Elemen | Teks / Template |
|---|---|
| Judul Modal | `Detail Campaign` |
| Tombol Tinjau PIC | `Tinjau sebagai PIC` |
| Tombol Hitung Ulang Split | `Hitung Ulang Tagihan Donatur` |
| Konfirmasi Hitung Ulang Split | `Yakin ingin menghitung ulang pembagian donasi? Ini akan memperbarui nominal tagihan seluruh donatur pada campaign ini.` |
| Toast Sukses Hitung Ulang | `Kalkulasi ulang berhasil.` |
| Label Total Hadiah | `Total Hadiah: {giftAmount}` |
| Tombol Edit Hadiah | `Edit` |
| Alert Refund Diperlukan | `Total Perlu Refund: {totalRefund}` |
| Header Tabel Donatur Detail | `Nama` \| `WA` \| `Tagihan` \| `Nominal Transfer` \| `Terakhir Diupdate` \| `Aksi` |
| Status Pembayaran | `Lunas` / `Belum` |
| Aksi Tandai Lunas | `Tandai lunas` / `Tandai belum lunas` |
| Konfirmasi Toggle Status Bayar | `Yakin ingin mengubah status pembayaran donatur ini?` |
| Toast Toggle Status Bayar | `Status pembayaran berhasil diubah.` |
| Aksi Edit Nominal Transfer | `Edit nominal transfer` / `Edit` |
| Aksi Hapus Donatur | `Hapus donatur` |
| Konfirmasi Hapus Donatur | `Yakin ingin menghapus donatur ini?` |
| Toast Hapus Donatur | `Donatur berhasil dihapus.` |
| State Donatur Kosong | `Belum ada donatur.` |
| **Transfer Kepemilikan Campaign** | |
| Judul Form Transfer | `Transfer Kepemilikan Campaign` |
| Keterangan Transfer | `Pindahkan hak PIC campaign ini ke member lain. Token PIC lama akan kedaluwarsa secara otomatis.` |
| Pilihan Default Target PIC | `-- Pilih PIC Baru --` |
| Tombol Transfer PIC | `Transfer` |
| Validasi PIC Target Kosong | InfoModal (`Info`): `Pilih member target terlebih dahulu.` |
| Konfirmasi Transfer PIC | `Yakin ingin mentransfer kepemilikan campaign ini? PIC lama akan kehilangan akses dan campaign akan dipindahkan ke PIC baru.` |
| Sukses Transfer PIC | InfoModal (`Sukses`): `Transfer kepemilikan berhasil!\nToken PIC Baru: {newToken}\n\nCampaign ini otomatis muncul di dashboard member yang bersangkutan.` |

### 5.8 Modal Edit Hadiah & Edit Transfer (`adminEditGiftAmountUI`, `editAmountPaid`)
| Elemen | Teks / Template |
|---|---|
| **Modal Edit Hadiah** | |
| Judul Modal | `Edit Total Hadiah` |
| Petunjuk Modal | `Masukkan nominal Total Hadiah baru (IDR):` |
| Label Input Hadiah | `Total Hadiah` |
| Placeholder Hadiah | `Contoh: 1.000.000` |
| Tombol Batal & Simpan | `Batal` \| `Simpan` |
| Validasi Nominal Salah | InfoModal (`Kendala Sistem`): `Nominal tidak valid.` |
| Konfirmasi Ubah Hadiah | `Yakin ingin mengubah Total Hadiah menjadi {newVal}? (Jangan lupa Hitung Ulang Tagihan Donatur setelah ini!)` |
| Toast Sukses Ubah Hadiah | `Total Hadiah berhasil diperbarui.` |
| **Modal Edit Nominal Transfer** | |
| Judul Modal | `Edit Nominal Transfer` |
| Petunjuk Modal | `Masukkan nominal yang benar untuk {whatsapp}:` |
| Label Input Nominal Aktual | `Nominal Aktual (IDR)` |
| Placeholder Nominal | `Contoh: 1.000.000` |
| Tombol Batal & Simpan | `Batal` \| `Simpan` |
| Validasi Nominal Salah | InfoModal (`Peringatan`): `Nominal tidak valid.` |
| Toast Sukses Edit Transfer | `Data berhasil diperbarui!` |

### 5.9 Manajemen Member & Paginasi (`#admin-section-members`)
| Elemen | Teks / Template |
|---|---|
| Judul Section | `Daftar Members` |
| Label Cari Member | `Cari member` |
| Placeholder Cari | `Nama atau nomor WhatsApp...` |
| Label Filter Status | `Filter status` |
| Opsi Filter Status | `Semua status` \| `Active` \| `Ex` \| `Pending` |
| Petunjuk Toolbar | `Cari dan filter tersedia sebelum data ditampilkan.` |
| Summary Status | `Memuat member...` / `Menampilkan {displayedCount} dari {total} member.` |
| Header Tabel Desktop | `Nama` \| `WA` \| `Role` \| `Status` \| `Terakhir Diupdate` \| `Aksi` |
| Dropdown Status Member Inline | `Active` \| `Ex` \| `Pending` |
| Toast Update Status Member | `Status berhasil diupdate.` |
| Tombol Paginasi | `Muat lebih banyak` |
| Ringkasan Counter Paginasi | `Menampilkan {displayedCount} dari {total} member` |
| State Kosong Member Total | `Belum ada member terdaftar.` |
| State Kosong Terfilter | `Tidak ada member yang sesuai filter.` |
| Error Gagal Memuat | `Gagal memuat member. Coba lagi` |

### 5.10 Tools PIC Admin (`#admin-section-tools`)
| Elemen | Teks / Template |
|---|---|
| Judul Section | `Tools PIC` |
| Keterangan Section | `Gunakan untuk membuat akses token PIC baru secara manual.` |
| Tombol Generate Token | `+ Buat token PIC baru` |
| Hasil Generate Token | `Token PIC baru (bagikan ke 1 orang saja):` (`{token}`) |

---

## 6. SuperAdmin Dashboard (`#view-superadmin-dashboard`)

### 6.1 Header & Overview
| Elemen | Teks Antarmuka |
|---|---|
| Judul Dashboard | `Dashboard Super Admin` |
| Polling Notifikasi Banner | `Ada {count} pendaftaran member baru yang memerlukan persetujuan!` |

### 6.2 Manajemen Akun Admin (`#sa-admin-list`)
| Elemen | Teks / Template |
|---|---|
| Judul Section | `Daftar Admin` |
| Tombol Tambah Token Admin | `+ Token Admin Baru` |
| Form Label Alias | `Alias Admin` |
| Placeholder Alias | `contoh: Bela EE` |
| Tombol Generate Token Admin | `Buat token Admin baru` |
| Validasi Alias Kosong | InfoModal (`Peringatan`): `Silakan isi Alias Admin terlebih dahulu.` |
| Sukses Generate Token Admin | `Token Admin ({alias}) berhasil dibuat:` (`{token}`) |
| Label Cari Admin | `Cari admin` |
| Placeholder Cari Admin | `Alias atau nomor WhatsApp...` |
| Label Filter Status Admin | `Filter status` |
| Opsi Status Admin | `Semua status` \| `Aktif` \| `Nonaktif` |
| Summary Toolbar Admin | `Memuat admin...` / `{visibleCount} dari {totalCount} admin ditampilkan.` |
| Header Tabel Admin | `Alias` \| `WhatsApp` \| `Token` \| `Status` \| `Aksi` |
| Tombol Nonaktifkan Admin | `Nonaktifkan` |
| Konfirmasi Nonaktifkan Admin | `Nonaktifkan Admin ini? Mereka tidak akan bisa login lagi.` |
| Tombol Aktifkan Admin | `Aktifkan` |
| Konfirmasi Aktifkan Admin | `Aktifkan kembali Admin ini?` |
| Toast Aktifkan Admin | `Admin berhasil diaktifkan kembali.` |
| Tombol Hapus Admin | `Hapus` |
| Konfirmasi Hapus Admin | `Hapus Admin ini secara permanen dari database?` |
| Toast Hapus Admin | `Admin berhasil dihapus permanen.` |
| State Kosong Admin Total | `Belum ada Admin terdaftar.` |
| State Kosong Terfilter | `Tidak ada admin yang sesuai filter.` |

### 6.3 Manajemen Member & Tambah Manual SuperAdmin
| Elemen | Teks / Template |
|---|---|
| Judul Section | `Daftar Members` |
| Tombol Tambah Member Manual | `+ Tambah Member` |
| Form Judul Tambah Member | `Tambah member manual` |
| Label & Placeholder Nama | `Nama` (`Nama`) |
| Label & Placeholder WhatsApp | `No. WhatsApp` (`08xxxxxxxxxx`) |
| Label Status | `Status` (`active` / `ex`) |
| Tombol Submit Tambah Member | `Tambah member` |
| Tombol Role Admin | `+ Admin` / `Jadikan Admin` |
| Konfirmasi Role Admin | `Jadikan member ini sebagai Admin?` |
| Tombol Role PIC | `+ PIC` / `Jadikan PIC` |
| Konfirmasi Role PIC | `Jadikan member ini sebagai PIC?` |
| Tombol Hapus Member | `Hapus` / `Hapus member` |
| Konfirmasi Hapus Member | `Hapus member ini?` |
| Toast Hapus Member | `Member berhasil dihapus.` |

### 6.4 Pengaturan Sistem (`#sa-rounding`, `#sa-validation`, etc.)
| Elemen | Teks / Template |
|---|---|
| Judul Section | `Pengaturan` |
| Checkbox Pembulatan | `Aktifkan pembulatan nominal donasi` |
| Label Kelipatan Pembulatan | `Bulatkan ke kelipatan (IDR)` |
| Placeholder Kelipatan | `500` |
| Checkbox Validasi Anggota | `Wajib cocok dengan daftar Members (validasi WhatsApp)` |
| Label Email Notifikasi | `Email Notifikasi Pendaftaran (pisahkan dengan koma)` |
| Placeholder Email | `admin1@example.com, admin2@example.com` |
| Label URL Aplikasi | `URL Aplikasi (untuk link di email reminder)` |
| Placeholder URL | `https://don4pro.com` |
| Tombol Simpan Pengaturan | `Simpan pengaturan` |
| Pesan Sukses Pengaturan | `Pengaturan disimpan.` |
| Pesan Error Pengaturan | `Pengaturan belum dapat dimuat. Coba lagi` |

### 6.5 Database Maintenance / Bersihkan Arsip Data
| Elemen | Teks / Template |
|---|---|
| Judul Section | `Database Maintenance` |
| Penjelasan Sweep | `Pindahkan data campaign yang sudah diarsipkan ke penyimpanan dingin untuk menjaga kecepatan sistem.` |
| Tombol Eksekusi Sweep | `Bersihkan Arsip Data` |
| State Menjalankan Sweep | `Membersihkan data arsip...` |
| Pesan Sukses Sweep Backend | `Berhasil membersihkan {count} baris data arsip.` / `Tidak ada data arsip untuk dibersihkan.` |

---

## 7. Empty States Matrix

| Halaman / Komponen | Kondisi Data | Teks & Panduan UI | CTA Tindakan |
|---|---|---|---|
| Donor Tagihan | 0 tagihan tertunda | `Tidak ada tagihan tertunda. Semua partisipasi donasi Anda sudah beres.` | `Lihat campaign yang masih terbuka` |
| Donor Campaign | 0 campaign diikuti | `Anda belum bergabung di campaign donasi mana pun.` | `Gabung donasi sekarang` |
| PIC Action Queue | 0 tindakan tertunda | `Semua donatur sudah tertata. Tidak ada tindakan pembayaran yang tertunda.` | `-` |
| PIC Settled Banner | Semua donatur terverifikasi | `Semua donatur selesai · Semua pembayaran terverifikasi dan final. Tidak ada tagihan tertunda.` | `Salin Laporan Selesai` |
| Admin Action Queue | 0 item pending | `Tidak ada item yang perlu ditinjau.` | `-` |
| Admin Member List | 0 member terdaftar | `Belum ada member terdaftar.` | `+ Tambah Member` |
| Admin Member Filter | Filter tidak cocok | `Tidak ada member yang sesuai filter.` | `Reset filter` |
| Admin Campaign List | 0 campaign | `Belum ada campaign.` | `+ Buat Campaign` |
| Admin Campaign Filter | Filter tidak cocok | `Tidak ada campaign yang sesuai filter.` | `Reset filter` |
| SuperAdmin Admin List | 0 admin | `Belum ada Admin terdaftar.` | `+ Token Admin Baru` |

---

## 8. Loading States Matrix

| Komponen / Aksi | Teks Loading |
|---|---|
| Login Member | `Memeriksa nomor...` |
| Registrasi Member | `Memproses pendaftaran...` |
| Simpan Profil | `Menyimpan...` |
| Gabung Donasi | `Memproses...` |
| Upload Bukti Transfer | `Mengunggah...` |
| Finalisasi Campaign | `Menyimpan ke server...` |
| Ajukan Donatur Susulan | `Mengirim...` |
| Bersihkan Arsip Data | `Membersihkan data arsip...` |
| Memuat Antrean Admin | `Memuat antrean...` |
| Memuat Daftar Campaign | `Memuat daftar campaign...` |
| Memuat Daftar Member | `Memuat member...` |
| Memuat Ringkasan | `Memuat ringkasan...` |

---

## 9. Error States & Friendly Exception Matrix

| Skenario Kendala | Pesan Ramah Pengguna (`formatUserErrorMessage`) |
|---|---|
| Koneksi Terputus / Network Drop | `Koneksi terputus. Periksa jaringan internet Anda dan coba lagi.` |
| Permintaan Timeout | `Waktu permintaan habis. Silakan coba beberapa saat lagi.` |
| Sesi Berakhir / Token Invalid | `Sesi akses Anda telah berakhir. Silakan masuk kembali.` |
| Nomor WhatsApp Kosong | `Harap isi Nomor WhatsApp.` |
| Nama Lengkap Kosong | `Harap isi Nama Lengkap.` |
| Status Karyawan Kosong | `Harap pilih Status Karyawan.` |
| Nominal Tidak Valid | `Silakan masukkan nominal yang valid.` |
| File Bukti Kosong | `Pilih file bukti transfer terlebih dahulu.` |
| File Bukti Rusak / Tidak Terbaca | `Gagal membaca file gambar atau dokumen. Silakan coba file lain.` |
| Ukuran File > 2MB | `Ukuran file maksimal 2MB. Silakan kompres foto bukti transfer.` |
| Gagal Memuat Data | `Gagal memuat data dari server. Silakan coba lagi.` |

---

## 10. Success States & Notification Matrix

| Aksi Pengguna | Pesan Notifikasi / Toast Sukses |
|---|---|
| Salin Nomor Rekening | `Nomor rekening disalin!` |
| Salin Nominal Transfer | `Nominal Rp {amount} berhasil disalin untuk m-banking!` |
| Salin Teks / Pesan | `Pesan berhasil disalin!` |
| Salin Undangan Patungan | `Pesan undangan berhasil disalin! Tempel ke grup WhatsApp.` |
| Salin Rekap Pengingat | `Rekap {count} pengingat berhasil disalin!` |
| Salin Laporan Selesai | `Laporan selesai berhasil disalin!` |
| Kirim Bukti Transfer | `Bukti transfer berhasil dikirim.` |
| Kirim Bukti Gabungan | `Bukti transfer gabungan berhasil dikirim.` |
| Simpan Profil | `Profil berhasil diperbarui.` |
| Gabung Campaign Massal | `Berhasil bergabung di {count} campaign.` |
| Verifikasi Bukti Single | `Bukti transfer berhasil dikonfirmasi.` |
| Verifikasi Bukti Massal | `Berhasil mengonfirmasi {count} bukti transfer.` |
| Tandai Refund Selesai | `Refund berhasil ditandai selesai.` |
| Update Status Member | `Status member berhasil diperbarui.` |
| Hitung Ulang Tagihan | `Kalkulasi ulang berhasil.` |
| Update Total Hadiah | `Total Hadiah berhasil diperbarui.` |
| Hapus Draft Campaign | `Draft campaign berhasil dihapus.` |
| Arsipkan Campaign | `Campaign berhasil diarsipkan.` |

---

## 11. Confirmation Dialogs Matrix

| Tindakan | Judul Modal | Pesan Konfirmasi |
|---|---|---|
| Hapus Draft Campaign | `Konfirmasi` | `Hapus draft campaign ini? Tindakan ini tidak bisa dibatalkan.` |
| Arsipkan Campaign | `Konfirmasi` | `Arsipkan campaign ini? Token PIC akan dinonaktifkan.` |
| Hapus Campaign Permanen | `Konfirmasi` | `Hapus campaign ini secara permanen? Semua data donatur akan dihapus.` |
| Konfirmasi Verifikasi Single | `Konfirmasi` | `Yakin ingin mengonfirmasi bukti transfer donatur ini?` |
| Tolak Verifikasi Single | `Konfirmasi` | `Yakin ingin menolak bukti transfer donatur ini?` |
| Konfirmasi Semua Bukti | `Konfirmasi` | `Yakin ingin menyetujui semua bukti transfer yang sudah diunggah?` |
| Tandai Refund Selesai | `Konfirmasi` | `Tandai refund sebagai sudah dikembalikan?` |
| Setujui Donatur Susulan | `Konfirmasi` | `Menyetujui ini akan mendaftarkan donatur dan menghitung ulang tagihan donatur lain. Lanjutkan?` |
| Hitung Ulang Split Tagihan | `Konfirmasi` | `Yakin ingin menghitung ulang pembagian donasi? Ini akan memperbarui tagihan seluruh donatur.` |
| Transfer Kepemilikan PIC | `Konfirmasi` | `Yakin ingin mentransfer kepemilikan campaign ini? PIC lama akan kehilangan akses.` |
| Nonaktifkan Akun Admin | `Konfirmasi` | `Nonaktifkan Admin ini? Mereka tidak akan bisa login lagi.` |
| Hapus Akun Admin | `Konfirmasi` | `Hapus Admin ini secara permanen dari database?` |

---

## 12. Buttons & Action CTAs Matrix

| Kategori | Label Tombol / CTA | Peran & Konteks |
|---|---|---|
| Primary Auth | `Saya mau donasi` | Landing Page |
| Secondary Auth | `Saya punya token (PIC / Admin / Super Admin)` | Landing Page |
| Primary Form | `Lanjut` / `Selesaikan Pendaftaran` | Login / Registrasi |
| Primary Donor | `Gabung Donasi untuk {targetName}` | Donor Detail Card |
| Secondary Donor | `Batal ikut` | Donor Detail Card |
| Primary Proof | `Sudah transfer, kirim bukti` | Donor Finalized Bill |
| Mass Donor Action | `Ikut Patungan Massal` | Donor Dashboard |
| Primary PIC Open/Closed | `Selesaikan & input rekening` | PIC Panel Tindakan |
| Secondary PIC Open | `Tutup pendaftaran` | PIC Panel Tindakan |
| Secondary PIC Closed | `Buka lagi pendaftaran` | PIC Panel Tindakan |
| Bulk Proof Action | `Setujui Semua Bukti` | PIC Panel Tindakan |
| Reminder Action | `Kirim pengingat WA` | PIC Antrean Donatur |
| Bulk Reminder Action | `Salin Rekap Pengingat ({count})` | PIC Antrean Header |
| Primary Admin Action | `Tinjau` / `Lihat detail` | Admin Dashboard |
| Bulk Admin Approve | `Setujui Terpilih` | Admin Pending Card |
| Token Action | `+ Buat token PIC baru` | Admin Tools |
| Token Admin Action | `Buat token Admin baru` | SuperAdmin Tools |
| Maintenance Action | `Bersihkan Arsip Data` | SuperAdmin Settings |

---

## 13. Status Labels, Urgency & Badges

### 13.1 Status Campaign
| Status Data | Label Tampilan UI | Deskripsi |
|---|---|---|
| `Open` | `Terbuka` | Pendaftaran donatur masih dibuka |
| `Closed` | `Menunggu finalisasi` | Pendaftaran ditutup, menunggu input rekening & harga |
| `Finalized` | `Final` | Nominal pro-rata dihitung, pembayaran berjalan |
| `Archived` | `Selesai` | Seluruh proses selesai dan diarsipkan |

### 13.2 Status Urgensi Deadline (`getDeadlineBadge` & `renderAdminCampaignDeadline`)
| Kondisi Waktu | Label Badge Donor | Label Status Admin |
|---|---|---|
| Tanpa Deadline | `Deadline belum ditentukan` | `-` |
| Overdue (< 0 hari) | `Deadline terlewat` | `Terlewat {days} hari ({absDate})` |
| Hari H (0 hari) | `Hari ini!` | `Hari ini ({absDate})` |
| Kritis (1-2 hari) | `{days} hari lagi` | `{days} hari lagi ({absDate})` |
| Sedang (3-5 hari) | `{days} hari lagi` | `{days} hari lagi ({absDate})` |
| Aman (> 5 hari) | `Aman` | `{days} hari lagi ({absDate})` |

### 13.3 Status Donatur & Verifikasi Pembayaran
| Status Data | Label Tampilan UI | Keterangan |
|---|---|---|
| Verified = TRUE | `Terverifikasi` / `Lunas` | Pembayaran sah & disetujui PIC |
| Paid = TRUE, ProofLink Ada, Verified != TRUE | `Perlu Ditinjau` | Bukti transfer telah diunggah, menunggu verifikasi PIC |
| Paid = TRUE, ProofLink Kosong | `Bukti Belum Diunggah` | Donatur konfirmasi bayar tanpa bukti transfer |
| Paid = FALSE, Campaign Finalized | `Belum Bayar` | Menunggu pembayaran donatur |
| Refunded = TRUE | `Dikembalikan` | Kelebihan dana donatur telah dikembalikan |
| Refunded = FALSE, Overpaid | `Refund perlu diselesaikan: {amount}` | Donatur bayar melebihi tagihan |

---

## 14. Overdue Messages & Callouts

| Area / Surface | Skenario | Format Teks |
|---|---|---|
| Admin Campaign Card | Campaign Open tapi melewati deadline | `Campaign terlewat: Hubungi PIC untuk menutup pendaftaran atau perbarui deadline.` |
| Admin Deadline Column | Melewati deadline | `Terlewat {days} hari ({absDate})` |
| PIC Progress Card | Campaign Open melewati deadline | `Deadline patungan telah terlewat pada {absDate}. Segera tutup pendaftaran dan input rekening.` |
| Donor Dashboard Banner | Tagihan melewati deadline | `{count} pembayaran menunggu. Bayar sebelum deadline agar campaign selesai tepat waktu.` |

---

## 15. Final & Settled State Messages

| Area / Surface | Kondisi | Format Pesan Reassurance |
|---|---|---|
| Donor Bill Box | Selesai bayar & verif | `Sudah konfirmasi transfer.` / `Selesai · Tidak ada tindakan lanjutan.` |
| PIC Donor Queue | Semua donatur terverifikasi | `Semua donor selesai · Semua pembayaran terverifikasi dan final. Tidak ada tagihan tertunda.` |
| PIC Donor Card | Donatur lunas & verif | `Selesai · Tidak ada tindakan lanjutan untuk donatur ini.` |
| PIC Share Box | Semua donatur terverifikasi | `Target Terkumpul! Semua pembayaran terverifikasi. Salin pesan terima kasih untuk grup.` |

---

## 16. Templat Pesan Eksternal & WhatsApp

### 16.1 Undangan Patungan Awal (`copyShareLink` & `generatePreRegistrationMessage_`)
```text
🎁 *Yuk Patungan Donasi!*

👤 Untuk: *{targetName}*
💬 Alasan: {reason}
💰 Total hadiah: {giftAmount}
📅 Batas akhir pendaftaran / Deadline: {deadline}

Yuk, segera gabung melalui tautan dashboard ini:
{shareUrl}

Rekan-rekan yang sudah bergabung ({donorCount} orang):
- {donorName1}
- {donorName2}
```

### 16.2 Rekap Pengingat Donatur Belum Bayar (`copyUnpaidDonorsRecap`)
```text
*Pengingat Patungan: {targetName}*
Berikut daftar donatur yang belum transfer/upload bukti pembayaran:

1. {displayName1} - {amountDue1}
2. {displayName2} - {amountDue2}

Mohon segera konfirmasi atau upload bukti transfer melalui tautan:
{shareUrl}
```

### 16.3 Pengingat Personal WhatsApp (`renderDonorTable`)
```text
Halo {name}, ini pengingat untuk patungan *{targetName}*. Tagihan Anda: {amountDue}.

Bisa cek rincian dan unggah bukti transfer di sini ya: {shareUrl}
```

### 16.4 Pengingat Tagihan Grup (`generateGroupBillingReminder_`)
```text
Halo semua, pengingat transfer donasi untuk "{targetName}" ({reason}).

Rekan-rekan yang belum konfirmasi transfer ({unpaidCount} orang):
* {displayName1}
* {displayName2}

Rincian Patungan:
* Total Nilai Hadiah: Rp{totalGift}
* Total Donatur: {totalDonors} orang
  (Terdapat {customCount} donatur nominal bebas dengan total Rp{customSum})
* Sisa target patungan: Rp{remainingGoal}
* Tagihan per orang: Rp{standardAmount}

Silakan transfer ke rekening target:
👉 {bankName} {bankAccount} a.n. {accountHolder}

Setelah transfer, mohon unggah bukti di web:
{shareUrl}

Terima kasih!
```

### 16.5 Laporan Selesai & Ucapan Terima Kasih (`copyLaporanSelesai` & `generateGratitudeMessage_`)
```text
🎉 *Laporan Selesai: Patungan untuk {targetName}*

Terima kasih banyak untuk teman-teman yang sudah berpartisipasi! Total partisipan : {totalDonors} orang dengan total donasi {totalGift}, {customCount} donasi nominal khusus dan pro-rata sebanyak {proRata}.

Daftar Donatur:
1. {displayName1} ✅
2. {displayName2} ({customAmount}) ✅
```
atau templat ucapan resmi:
```text
Alhamdulillah! Kegiatan donasi untuk "{targetName}" ({reason}) dengan total nilai hadiah Rp{totalGift} telah selesai dan semua pembayaran telah diverifikasi.

*Catatan: Termasuk total donasi nominal bebas sebesar Rp{customSum} dari {customCount} donatur.*

Terima kasih banyak atas ketulusan dan partisipasi dari {totalDonors} rekan-rekan donatur:
- {donorName1}
- {donorName2}

Semoga kebaikan rekan-rekan dibalas dengan kelimpahan. Hadiah akan segera diserahkan oleh PIC.
```
