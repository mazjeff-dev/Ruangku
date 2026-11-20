import { Router } from "express";
import {
  getRooms,
  getRoomById,
  getAvailableRooms,
  getRoomCategories,
  getRoomSchedule,
} from "../controllers/room.controller";
import { optionalAuthenticateToken } from "../middleware/auth.middleware";

const router = Router();

router.get("/", optionalAuthenticateToken, getRooms);
router.get("/available", optionalAuthenticateToken, getAvailableRooms);
router.get("/categories", getRoomCategories);
router.get("/:id", optionalAuthenticateToken, getRoomById);
router.get("/:id/schedule", getRoomSchedule);

export default router;
