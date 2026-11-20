import { Router } from "express";
import {
  forgotPassword,
  login,
  logout,
  me,
  register,
  resetPassword,
} from "../controllers/auth.controller";
import { authenticateToken } from "../middleware/auth.middleware";
import { rateLimit } from "../lib/rateLimit";

const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 60, keyPrefix: "auth" });
const forgotPasswordIpLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  keyPrefix: "forgot-password-ip",
});
const forgotPasswordEmailLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 3,
  keyPrefix: "forgot-password-email",
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 150) : "";
    return email || req.ip;
  },
});

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/forgot-password", forgotPasswordIpLimiter, forgotPasswordEmailLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);
router.get("/me", authenticateToken, me);
router.post("/logout", authenticateToken, logout);

export default router;
