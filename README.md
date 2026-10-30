# RuangKu

Sistem peminjaman ruangan kampus. *Find Your Space. Make It Happen.*

```
ruangku/
├── backend/      Node.js + Express + TypeScript + Prisma (MySQL)
├── admin-web/    SvelteKit + TypeScript (dashboard admin)
├── mobile/       Flutter (mahasiswa)
└── docs/
```

## Menjalankan backend

1. Nyalakan MySQL (XAMPP/Laragon), lalu buat database `ruangku_db`.
2. Salin `backend/.env.example` menjadi `backend/.env`, sesuaikan isinya.
3. Jalankan:

```sh
cd backend
npm install
npx prisma migrate deploy
npm run admin:reset -- "PasswordAdminBaru"   # membuat / mengatur ulang akun admin
npm run dev                                  # http://localhost:3000
```

Akun admin: `admin@ruangku.local`

## Menjalankan dashboard admin

```sh
cd admin-web
npm install
npm run dev                                  # http://localhost:5173
```

Alamat API bisa diubah lewat variabel `VITE_API_URL` (bawaan: `http://localhost:3000/api/v1`).

## Endpoint utama (`/api/v1`)

| Method | Path | Akses |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login` | publik |
| GET | `/rooms` | publik |
| GET | `/users/profile` | login |
| POST | `/bookings`, GET `/bookings/my`, PATCH `/bookings/:id/cancel` | login |
| GET | `/admin/bookings`, PATCH `/admin/bookings/:id/review` | admin |
