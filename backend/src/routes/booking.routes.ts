
import { Router } from "express";
import {
  createBooking,
  getMyBookings,
  cancelBooking,
} from "../controllers/booking.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

router.post("/", authenticateToken, createBooking);
router.get("/my", authenticateToken, getMyBookings);
router.patch("/:id/cancel", authenticateToken, cancelBooking);

export default router;
