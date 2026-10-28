import { prisma } from "./lib/prisma";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import roomRoutes from "./routes/room.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import adminRoutes from "./routes/admin.routes.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Selamat datang di RuangKu API",
    version: "1.0.0",
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
app.use("/api/v1/admin", adminRoutes);

app.listen(PORT, () => {
  console.log(`RuangKu API berjalan di http://localhost:${PORT}`);
});
