# RuangKu Web

Web RuangKu memakai login bersama untuk administrator, dosen, dan mahasiswa. Administrator mengelola akun, ruangan, penugasan dosen, peminjaman, laporan, serta aturan durasi dan horizon booking (dengan opsi kembali ke nilai environment). Dosen melihat statistik serta meninjau pengajuan dan perpanjangan hanya pada ruangan yang ditugaskan kepadanya. Mahasiswa dapat mencari dan melihat jadwal ruangan, mengajukan booking, mengelola booking miliknya sesuai aturan, dan membaca notifikasi.

## Menjalankan

```sh
npm install
npm run dev
```

Alamat backend dapat diatur melalui `VITE_API_URL` (default `http://localhost:3000/api/v1`).

## Validasi

```sh
npm run check
npm run build
npm run test:auth-routing
```
