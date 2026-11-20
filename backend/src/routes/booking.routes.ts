import { Router } from "express";
import {
  createBooking,
  getMyBookings,
  cancelBooking,
  listMyBookings,
  getMyBookingDetail,
  getBookingRules,
  getMyBookingQuota,
} from "../controllers/booking.controller";
import { authenticateToken } from "../middleware/auth.middleware";
import { rateLimit } from "../lib/rateLimit";
import { cancelBookingQueueEntry, joinBookingQueue, listMyBookingQueue } from "../controllers/booking-queue.controller";
import { requestBookingExtension } from "../controllers/booking-extension.controller";
import { checkInBooking, checkOutBooking, getMyViolations } from "../controllers/booking-attendance.controller";
import { exportMyBookingsCsv, getBookingCalendarIcs, getBookingReceiptPdf } from "../controllers/booking-download.controller";

const router = Router();

const downloadLimiter = rateLimit({ windowMs: 10 * 60_000, max: 120, keyPrefix: "booking-download" });
const createLimiter = rateLimit({ windowMs: 10 * 60_000, max: 60, keyPrefix: "booking" });

router.get("/rules", getBookingRules);
router.get("/quota", authenticateToken, getMyBookingQuota);
router.get("/violations", authenticateToken, getMyViolations);
router.get("/waitlist", authenticateToken, listMyBookingQueue);
router.post("/waitlist", authenticateToken, createLimiter, joinBookingQueue);
router.delete("/waitlist/:id", authenticateToken, cancelBookingQueueEntry);
router.post("/", authenticateToken, createLimiter, createBooking);
router.get("/", authenticateToken, listMyBookings);
router.get("/my", authenticateToken, getMyBookings);
router.get("/my/export", authenticateToken, downloadLimiter, exportMyBookingsCsv);
router.post("/:id/extensions", authenticateToken, createLimiter, requestBookingExtension);
router.post("/:id/check-in", authenticateToken, checkInBooking);
router.post("/:id/check-out", authenticateToken, checkOutBooking);
router.get("/:id/receipt", authenticateToken, downloadLimiter, getBookingReceiptPdf);
router.get("/:id/calendar.ics", authenticateToken, downloadLimiter, getBookingCalendarIcs);
router.get("/:id", authenticateToken, getMyBookingDetail);
router.patch("/:id/cancel", authenticateToken, cancelBooking);

export default router;
