
import { Router } from "express";
import {
  reviewBooking,
  getAllBookings,
} from "../controllers/admin.controller";
import { authenticateToken } from "../middleware/auth.middleware";
import { authorizeAdmin } from "../middleware/admin.middleware";

const router = Router();

router.patch(
  "/bookings/:id/review",
  authenticateToken,
  authorizeAdmin,
  reviewBooking
);

router.get(
  "/bookings",
  authenticateToken,
  authorizeAdmin,
  getAllBookings
);

export default router;
