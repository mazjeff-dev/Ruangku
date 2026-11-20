import { Router } from "express";
import {
  reviewBooking,
  getAllBookings,
  getBookingDetail,
  cancelBookingByAdmin,
  approveBooking,
  rejectBooking,
} from "../controllers/admin.controller";
import { getDashboard } from "../controllers/dashboard.controller";
import { getReports, exportReportCsv } from "../controllers/report.controller";
import {
  adminListRooms,
  adminGetRoom,
  adminCreateRoom,
  adminUpdateRoom,
  adminDeleteRoom,
  adminUploadRoomPhoto,
  adminDeleteRoomPhoto,
} from "../controllers/room.controller";
import { listStudents, getStudent, setStudentStatus } from "../controllers/student.controller";
import { getSchedule } from "../controllers/schedule.controller";
import { getAppInfo } from "../controllers/appinfo.controller";
import {
  getBookingRuleSettings,
  resetBookingRuleSettings,
  updateBookingRuleSettings,
  getGlobalOperatingHours,
  updateGlobalOperatingHours,
} from "../controllers/system-settings.controller";
import { createLecturer, listLecturers, setLecturerRooms, setLecturerStatus } from "../controllers/lecturer.controller";
import { listBookingExtensions, reviewBookingExtension } from "../controllers/booking-extension.controller";
import { roomPhotoUpload } from "../lib/upload";
import { authenticateToken } from "../middleware/auth.middleware";
import { authorizeAdmin } from "../middleware/admin.middleware";
import {
  createRoomClosure,
  deleteRoomClosure,
  getRoomOperatingHours,
  listRoomClosures,
  replaceRoomOperatingHours,
  resetRoomOperatingHours,
  updateRoomClosure,
} from "../controllers/room-schedule.controller";
import { getUserViolationsForAdmin, waiveViolation } from "../controllers/booking-attendance.controller";
import { cancelBookingQueueByStaff, listAllBookingQueue } from "../controllers/booking-queue-management.controller";
import { createLeadershipAccount, listLeadershipAccounts } from "../controllers/leadership-users.controller";

import { verifyBookingReceipt } from "../controllers/booking-download.controller";
const router = Router();

// Semua route di bawah ini hanya untuk ADMIN.
router.use(authenticateToken, authorizeAdmin);

router.get("/dashboard", getDashboard);
router.get("/app-info", getAppInfo);
router.get("/settings/booking-rules", getBookingRuleSettings);
router.put("/settings/booking-rules", updateBookingRuleSettings);
router.delete("/settings/booking-rules", resetBookingRuleSettings);
router.get("/settings/operating-hours", getGlobalOperatingHours);
router.put("/settings/operating-hours", updateGlobalOperatingHours);
router.get("/closures", listRoomClosures);
router.post("/closures", createRoomClosure);
router.patch("/closures/:id", updateRoomClosure);
router.delete("/closures/:id", deleteRoomClosure);

router.get("/bookings/verify", verifyBookingReceipt);
router.get("/bookings", getAllBookings);
router.get("/waitlist", listAllBookingQueue);
router.patch("/waitlist/:id/cancel", cancelBookingQueueByStaff);
router.get("/bookings/:id", getBookingDetail);
router.patch("/bookings/:id/review", reviewBooking);
router.patch("/bookings/:id/approve", approveBooking);
router.patch("/bookings/:id/reject", rejectBooking);
router.patch("/bookings/:id/cancel", cancelBookingByAdmin);
router.get("/extensions", listBookingExtensions);
router.patch("/extensions/:id/review", reviewBookingExtension);

router.get("/rooms", adminListRooms);
router.post("/rooms", adminCreateRoom);
router.get("/rooms/:id", adminGetRoom);
router.patch("/rooms/:id", adminUpdateRoom);
router.delete("/rooms/:id", adminDeleteRoom);
router.get("/rooms/:id/operating-hours", getRoomOperatingHours);
router.put("/rooms/:id/operating-hours", replaceRoomOperatingHours);
router.delete("/rooms/:id/operating-hours", resetRoomOperatingHours);
router.post("/rooms/:id/photo", roomPhotoUpload.single("photo"), adminUploadRoomPhoto);
router.delete("/rooms/:id/photo", adminDeleteRoomPhoto);

router.get("/students", listStudents);
router.get("/students/:id", getStudent);
router.get("/students/:userId/violations", getUserViolationsForAdmin);
router.patch("/students/:id/status", setStudentStatus);
router.patch("/violations/:id/waive", waiveViolation);

router.get("/lecturers", listLecturers);
router.post("/lecturers", createLecturer);
router.patch("/lecturers/:id/status", setLecturerStatus);
router.put("/lecturers/:id/rooms", setLecturerRooms);
router.get("/leaders", listLeadershipAccounts);
router.post("/leaders", createLeadershipAccount);

router.get("/schedule", getSchedule);

router.get("/reports", getReports);
router.get("/reports/export", exportReportCsv);

export default router;
