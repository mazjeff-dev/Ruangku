
import { Router } from "express";
import { getProfile } from "../controllers/user.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

router.get("/profile", authenticateToken, getProfile);

export default router;
