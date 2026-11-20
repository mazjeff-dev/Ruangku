import { Router } from "express";
import { getProfile, updateProfile, changePassword } from "../controllers/user.controller";
import { authenticateToken } from "../middleware/auth.middleware";
import { rateLimit } from "../lib/rateLimit";

const router = Router();

router.get("/profile", authenticateToken, getProfile);
router.patch("/profile", authenticateToken, updateProfile);
router.put("/profile", authenticateToken, updateProfile);
router.patch(
  "/password",
  authenticateToken,
  rateLimit({ windowMs: 15 * 60_000, max: 20, keyPrefix: "password" }),
  changePassword
);

export default router;
