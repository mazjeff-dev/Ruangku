import "dotenv/config";
import { prisma } from "./lib/prisma";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import roomRoutes from "./routes/room.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import studentRoutes from "./routes/student.routes.js";
import lecturerRoutes from "./routes/lecturer.routes.js";
import leadershipRoutes from "./routes/leadership.routes.js";
import { errorHandler, notFoundHandler } from "./lib/http";
import { UPLOAD_ROOT } from "./lib/upload";
import { startReminderScheduler, stopReminderScheduler } from "./lib/reminders";
import { validateEnvironment } from "./lib/env";
import { warnMissingSmtpConfiguration } from "./lib/mailer";
import { enforceLeadershipReadOnly } from "./middleware/auth.middleware";

let serverEnvironment: ReturnType<typeof validateEnvironment>;
try {
  serverEnvironment = validateEnvironment(process.env);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Konfigurasi environment tidak valid: ${message}`);
  process.exit(1);
}

const app = express();
const { port: PORT, corsOrigins, trustProxy } = serverEnvironment;
if (serverEnvironment.nodeEnv === "production" && !serverEnvironment.smtpHost) {
  warnMissingSmtpConfiguration();
}

// Zona waktu proses: Asia/Jakarta (database tetap menyimpan UTC).
process.env.TZ = process.env.TZ || "Asia/Jakarta";

app.set("trust proxy", trustProxy);
app.use(helmet());
app.use(cors(corsOrigins.length ? { origin: corsOrigins } : undefined));
app.use(express.json({ limit: "100kb" }));
app.use("/api/v1", enforceLeadershipReadOnly);

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
app.use("/api/v1/students", studentRoutes);
app.use("/api/v1/lecturer", lecturerRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/leadership", leadershipRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`RuangKu API berjalan di http://localhost:${PORT}`);
  reminderTimer = startReminderScheduler();
});

let reminderTimer: ReturnType<typeof setInterval> | undefined;
let shuttingDown = false;

function shutdown(signal: "SIGINT" | "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Menerima ${signal}; menutup server RuangKu...`);
  server.close((error) => {
    if (error) {
      console.error("Gagal menutup server HTTP:", error);
      process.exitCode = 1;
    }
    if (reminderTimer) stopReminderScheduler(reminderTimer);
    prisma.$disconnect()
      .then(() => console.log("Server RuangKu berhenti dengan aman."))
      .catch((disconnectError: unknown) => {
        console.error("Gagal memutus koneksi database:", disconnectError);
        process.exitCode = 1;
      });
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
