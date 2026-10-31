import { Router } from "express";
import {
  register,
  login,
} from "../controllers/auth.controller";
import { rateLimit } from "../lib/rateLimit";

const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 60, keyPrefix: "auth" });

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);

export default router;
