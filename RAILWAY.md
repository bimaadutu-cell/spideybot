# SpideyBot di Railway

SpideyBot ini memakai Next.js untuk control plane dan Baileys untuk koneksi WhatsApp nyata. QR dibuat dari event `connection.update` Baileys, sedangkan pairing code diminta melalui `sock.requestPairingCode(phone)`. Tidak ada QR, pairing code, atau koneksi dummy di UI.

## Konfigurasi service

Buat satu service aplikasi dari repository ini dan tambahkan PostgreSQL pada project Railway. Isi variabel berikut pada environment aplikasi:

| Variabel | Nilai | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | Reference PostgreSQL Railway | Wajib untuk akun, bot, command, log, dan statistik. |
| `SESSION_SECRET` | Random string minimal 64 karakter | Wajib agar cookie sesi konsisten antar-restart. |
| `APP_URL` | URL publik Railway, misalnya `https://spideybot.up.railway.app` | Dipakai untuk diagnostics dan callback-compatible URL. |
| `NODE_ENV` | `production` | Mengaktifkan mode produksi Next.js. |
| `SPIDEY_DATA_DIR` | `/app/.data` | Menentukan lokasi sesi Baileys dan workspace. |

Pasang **Railway Volume** pada service aplikasi dengan mount path `/app/.data`. Railway menyediakan volume sebagai direktori baca/tulis pada runtime; untuk aplikasi yang menulis `./data`, dokumentasinya menjelaskan bahwa mount path harus memasukkan prefix `/app`, misalnya `/app/data`.[1] Karena SpideyBot menggunakan `.data`, mount `/app/.data` menjaga session credentials WhatsApp tetap ada setelah restart atau redeploy.

> Volume hanya tersedia ketika container berjalan, bukan pada fase build atau pre-deploy. Oleh karena itu, migrasi database pada `preDeployCommand` tidak bergantung pada volume, sedangkan folder sesi dibuat saat start atau ketika bot dijalankan.[1]

## Command Railway

Konfigurasi `railway.toml` sudah menetapkan command berikut:

| Tahap | Command |
| --- | --- |
| Build | RAILPACK mendeteksi `package-lock.json` dan menjalankan build Next.js dengan npm |
| Pre-deploy | Tidak digunakan — sengaja dikosongkan agar service boot lebih dulu |
| Start | `npm run start` (migrasi SQL versioned non-interaktif dengan retry, lalu Next.js start) |
| Health check | `GET /api/health` |

Railway akan menyediakan `RAILWAY_VOLUME_MOUNT_PATH` secara otomatis ketika volume dipasang; kode juga dapat memakainya sebagai fallback untuk direktori data.[1]

> Startup tidak lagi menjalankan `drizzle-kit push`, karena command tersebut dapat meminta pilihan rename/drop interaktif dan gagal pada container Railway yang tidak memiliki TTY. Schema sekarang dikunci dalam `drizzle/0000_small_beyonder.sql` dan dijalankan melalui `drizzle-kit migrate`, sehingga proses deploy tidak membutuhkan input terminal. Jangan menghapus folder `drizzle/` dari repository.

## Alur koneksi WhatsApp

Buka **Connection**, pilih bot, lalu tekan **START / SHOW QR**. QR akan tampil setelah server menerima QR dari WhatsApp. Untuk pairing code, masukkan nomor internasional tanpa tanda `+`, lalu tekan **USE PAIRING CODE**. Setelah code muncul, pada WhatsApp buka **Linked devices → Link with phone number** dan masukkan code tersebut.

Status, QR, pairing code, log Baileys, dan event command dikirim melalui realtime event bus. Ketika sesi sudah tersimpan di volume, tombol **START / SHOW QR** akan melanjutkan sesi yang sama tanpa pairing ulang. Jika perangkat logout, auth state dihapus oleh runtime dan QR baru memang diperlukan.

## Jika deploy lama masih memakai konfigurasi cache

Setelah mengunggah perubahan ini, lakukan **Redeploy** terbaru pada service aplikasi. Pastikan source deploy memang commit/arsip yang berisi `drizzle/0000_small_beyonder.sql`, package script `db:migrate`, dan startup yang memanggil `db:migrate`. Variabel `DATABASE_URL` tetap harus berada pada service aplikasi, bukan hanya pada service PostgreSQL.

## Validasi setelah deploy

1. Buka `https://<domain-railway>/api/health`. Pastikan `status` bernilai `ok`, `database` bernilai `true`, `storage.writable` bernilai `true`, dan `auth.mode` bernilai `random-math`.
2. Buka `/dashboard` secara langsung; halaman login sudah dinonaktifkan pada build publik ini.
3. Buat bot, buka **Connection**, uji QR atau pairing code dengan perangkat WhatsApp yang memang akan ditautkan.
4. Kirim `.menu` atau command yang terdaftar melalui WhatsApp. Command diproses oleh handler runtime dan usage-nya masuk ke halaman **Commands**.
5. Restart service Railway. Pastikan sesi WhatsApp masih dapat dipulihkan dari volume dan tidak meminta QR baru kecuali perangkat telah logout.

## Keamanan dependency

Dependency Baileys dinaikkan ke rentang patched `6.7.22`. Advisori resmi menyatakan versi di bawah `6.7.22` terdampak spoofing `messages.upsert`, sedangkan `6.7.22` adalah versi patched.[2] Runtime juga menonaktifkan automatic history sync dan mengabaikan payload protocol mencurigakan yang memiliki `requestId`.

## Referensi

[1]: https://docs.railway.com/volumes "Railway Docs — Using Volumes"

[2]: https://github.com/WhiskeySockets/Baileys/security/advisories/GHSA-qvv5-jq5g-4cgg "Baileys Security Advisory GHSA-qvv5-jq5g-4cgg"
