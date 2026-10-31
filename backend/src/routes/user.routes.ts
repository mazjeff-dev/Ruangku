import { Router } from "express";
import { getProfile, updateProfile, changePassword } from "../controllers/user.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

router.get("/profile", authenticateToken, getProfile);
router.patch("/profile", authenticateToken, updateProfile);
router.patch("/password", authenticateToken, changePassword);

export default router;
