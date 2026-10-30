// Mengatur ulang password akun admin (atau membuat akunnya bila belum ada).
//
// Cara pakai (jalankan dari folder backend):
//   node reset-admin-password.cjs "PasswordBaru"
//   npm run admin:reset -- "PasswordBaru"
//   node reset-admin-password.cjs        (password akan ditanyakan)
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const readline = require("readline");

const ADMIN_EMAIL = "admin@ruangku.local";
const ADMIN_NAME = "Admin RuangKu";

const prisma = new PrismaClient();

function askPassword() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("Masukkan password admin baru: ", (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const password = process.argv[2] ?? (await askPassword());

  if (password.length < 8) {
    throw new Error("Password minimal 8 karakter.");
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { password: hashedPassword, role: "ADMIN" },
    create: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: "ADMIN",
    },
    select: { id: true, createdAt: true, updatedAt: true },
  });

  const baru = admin.createdAt.getTime() === admin.updatedAt.getTime();
  console.log(
    baru
      ? `Akun admin dibuat: ${ADMIN_EMAIL}`
      : `Password admin diperbarui: ${ADMIN_EMAIL}`
  );
}

main()
  .catch((error) => {
    console.error("Gagal:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
