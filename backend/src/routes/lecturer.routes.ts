import { Router } from "express";
import { getAssignedBookingDetail, listAssignedBookings, listAssignedRooms, getLecturerDashboard } from "../controllers/lecturer.controller";
import { getReports, exportReportCsv } from "../controllers/report.controller";
import { listBookingExtensions, reviewBookingExtension } from "../controllers/booking-extension.controller";
import { reviewBooking } from "../controllers/admin.controller";
import { getAssignedUserViolations } from "../controllers/booking-attendance.controller";
import { cancelBookingQueueByStaff, listAssignedBookingQueue } from "../controllers/booking-queue-management.controller";
import { authenticateToken } from "../middleware/auth.middleware";
import { authorizeLecturer } from "../middleware/lecturer.middleware";

const router = Router();

router.use(authenticateToken, authorizeLecturer);
router.get("/dashboard", getLecturerDashboard);
router.get("/rooms", listAssignedRooms);
router.get("/bookings", listAssignedBookings);
router.get("/waitlist", listAssignedBookingQueue);
router.patch("/waitlist/:id/cancel", cancelBookingQueueByStaff);
router.get("/bookings/:id", getAssignedBookingDetail);
router.get("/students/:userId/violations", getAssignedUserViolations);
router.patch("/bookings/:id/review", reviewBooking);
router.get("/extensions", listBookingExtensions);
router.patch("/extensions/:id/review", reviewBookingExtension);
router.get("/reports", getReports);
router.get("/reports/export", exportReportCsv);

export default router;
