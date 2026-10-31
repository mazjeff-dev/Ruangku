import "dotenv/config";
import { prisma } from "./lib/prisma";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import roomRoutes from "./routes/room.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import { errorHandler, notFoundHandler } from "./lib/http";
import { UPLOAD_ROOT } from "./lib/upload";
import { startReminderScheduler } from "./lib/reminders";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Zona waktu proses: Asia/Jakarta (database tetap menyimpan UTC).
process.env.TZ = process.env.TZ || "Asia/Jakarta";

// CORS_ORIGIN opsional, contoh: "http://localhost:5173,https://admin.kampus.ac.id". Kosong = semua origin.
const allowedOrigins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins?.length ? { origin: allowedOrigins } : undefined));
app.use(express.json({ limit: "100kb" }));

// Foto ruangan (file statis). nosniff mencegah browser menebak tipe file.
app.use(
  "/uploads",
  express.static(UPLOAD_ROOT, {
    maxAge: "7d",
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Selamat datang di RuangKu API",
    version: "1.1.0",
  });
});

app.get("/api/v1/health", (_req, res) => {
  res.json({
    success: true,
    message: "Server RuangKu berjalan",
    timestamp: new Date().toISOString(),
  });
});


app.get("/api/v1/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      success: true,
      message: "Koneksi database RuangKu berhasil",
    });
  } catch (error) {
    console.error("Database connection error:", error);

    res.status(500).json({
      success: false,
      message: "Koneksi database gagal",
    });
  }
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/rooms", roomRoutes);
app.use("/api/v1/bookings", bookingRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/admin", adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`RuangKu API berjalan di http://localhost:${PORT}`);
  startReminderScheduler();
});
