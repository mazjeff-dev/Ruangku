# Panduan menjalankan dan deploy

## Docker Compose

1. Salin `.env.example` di root menjadi `.env`, lalu isi password MySQL, `JWT_SECRET` acak minimal 32 karakter, `CORS_ORIGIN`, serta `VITE_API_URL`. Untuk email reset password dan notifikasi booking, isi `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, dan `APP_WEB_URL` dengan nilai deployment. Gunakan password MySQL URL-safe (huruf, angka, underscore) agar URL koneksi tidak perlu encoding.
2. Jalankan `docker compose up --build -d`.
3. Backend menunggu healthcheck MySQL, menerapkan migration dengan `prisma migrate deploy`, lalu mulai melayani API pada port 3000. Admin web tersedia pada port 4173.
4. Periksa `http://localhost:3000/api/v1/health`, `http://localhost:3000/api/v1/health/db`, dan `http://localhost:4173`.

Volume `mysql_data` menyimpan database dan `room_uploads` menyimpan foto. Jangan menjalankan `docker compose down -v` pada lingkungan yang berisi data yang ingin dipertahankan. Untuk menghentikan stack tanpa menghapus volume, jalankan `docker compose down`.

Atur `CORS_ORIGIN` ke origin browser yang benar. Di balik reverse proxy, set `TRUST_PROXY` sesuai jumlah hop atau subnet proxy yang dipercaya; jangan mempercayai semua proxy tanpa kebutuhan. `JWT_SECRET` wajib rahasia dan berbeda di setiap lingkungan.

## Instalasi lokal

Gunakan Node.js 20+, MySQL 8/MariaDB 10.6+, Flutter 3.22+ dan Android SDK bila membangun mobile.

```sh
cd backend
cp .env.example .env
# Isi DATABASE_URL dan JWT_SECRET yang acak (minimal 32 karakter).
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
npm start
```

Untuk development gunakan `npm run dev`. Server memvalidasi konfigurasi saat startup, menambahkan header keamanan Helmet, mensyaratkan `CORS_ORIGIN` di production, serta menutup HTTP server, scheduler pengingat, dan koneksi Prisma saat menerima SIGINT/SIGTERM.

```sh
cd admin-web
cp .env.example .env
npm ci
npm run dev
```

Atur `VITE_API_URL` ke API yang dapat dijangkau browser, bukan nama service internal Docker.

Untuk menyiapkan project Android jalankan `mobile/setup_android.bat` di Windows atau `mobile/setup_android.sh` pada shell POSIX. Skrip membuat scaffolding Android, menambal manifest aplikasi, dan mengambil dependency Flutter.

## Environment dan secrets

- Jangan menyalin `.env` ke arsip distribusi atau image. File `.env` dikecualikan dari Git dan konteks Docker; gunakan secret manager CI/hosting.
- `DATABASE_URL` dan `JWT_SECRET` wajib untuk backend; secret JWT minimal 32 karakter.
- `CORS_ORIGIN` wajib saat `NODE_ENV=production`.
- `TRUST_PROXY` default `0`. Gunakan nilai yang sesuai konfigurasi reverse proxy agar `req.ip` dan rate limit merepresentasikan IP klien.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, dan `APP_WEB_URL` opsional. Tanpa SMTP, development mencatat tautan reset untuk debugging; production tidak pernah mencatat token reset dan memberi peringatan konfigurasi sekali saat startup. Kegagalan SMTP tidak menggagalkan operasi booking.
- `SEED_DEMO` default `false`; lihat [akun demo](demo-accounts.md). Jangan aktifkan data demo di production.

Migration dijalankan secara aditif oleh `prisma migrate deploy`. Migration booking menambah peserta nullable agar booking lama tetap valid, preferensi email dengan default aktif, jam global awal 07:00–21:00 WIB (Senin–Sabtu), override ruangan, dan penutupan. Jangan gunakan perintah reset database pada deployment. Zona bisnis jam dan tanggal adalah Asia/Jakarta; timestamp disimpan UTC.
