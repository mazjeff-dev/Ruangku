import { Router } from "express";
import { getRooms, getRoomSchedule } from "../controllers/room.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

router.get("/", getRooms);
router.get("/:id/schedule", authenticateToken, getRoomSchedule);

export default router;
