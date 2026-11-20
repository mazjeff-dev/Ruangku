# Akun dan data demo

Seed tidak membuat password bawaan. Akun administrator hanya dibuat dari `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD`. Akun dan data demo tambahan hanya dibuat jika `SEED_DEMO=true`.

Atur variabel berikut di `backend/.env` untuk demonstrasi lokal:

```dotenv
SEED_ADMIN_EMAIL=admin@ruangku.test
SEED_ADMIN_PASSWORD=<password pilihan Anda, minimal 8 karakter>
SEED_DEMO=true
SEED_DEMO_STUDENT_PASSWORD=<password mahasiswa pilihan Anda>
SEED_DEMO_LECTURER_PASSWORD=<password dosen pilihan Anda>
SEED_DEMO_LEADERSHIP_PASSWORD=<password pimpinan pilihan Anda>
```

Kemudian, dari folder `backend`, jalankan `npm run db:seed`. Semua password demo wajib minimal 8 karakter; seed tidak mencetak password.

| Peran | Email demo | Variabel password |
| --- | --- | --- |
| Admin | Nilai `SEED_ADMIN_EMAIL` | `SEED_ADMIN_PASSWORD` |
| Mahasiswa | `mahasiswa@ruangku.test` | `SEED_DEMO_STUDENT_PASSWORD` |
| Mahasiswa | `sinta@ruangku.test` | `SEED_DEMO_STUDENT_PASSWORD` |
| Mahasiswa | `bagas@ruangku.test` | `SEED_DEMO_STUDENT_PASSWORD` |
| Dosen | `dosen@ruangku.test` | `SEED_DEMO_LECTURER_PASSWORD` |
| PIMPINAN | `pimpinan@ruangku.test` | `SEED_DEMO_LEADERSHIP_PASSWORD` |

Seed juga menyediakan lima ruangan, penugasan dosen ke Ruang Rapat dan Ruang Seminar, dan booking contoh. Jalankan hanya pada database lokal/demo, bukan produksi. Seed bersifat aditif: data yang sudah ada tidak diubah; jika email sudah digunakan oleh role berbeda, proses berhenti dengan pesan jelas.

Jika `SEED_DEMO` tidak bernilai `true`, seed demo dilewati. Menonaktifkan flag atau menghapus environment seed tidak menghapus akun atau data yang pernah dibuat.

Admin dapat membuat akun PIMPINAN nyata dari menu **Akun Pimpinan**. PIMPINAN hanya memiliki akses baca ke dasbor pengadaan.
