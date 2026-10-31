import { Router } from "express";
import {
  reviewBooking,
  getAllBookings,
  getBookingDetail,
  cancelBookingByAdmin,
} from "../controllers/admin.controller";
import { getDashboard } from "../controllers/dashboard.controller";
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
import { roomPhotoUpload } from "../lib/upload";
import { authenticateToken } from "../middleware/auth.middleware";
import { authorizeAdmin } from "../middleware/admin.middleware";

const router = Router();

// Semua route di bawah ini hanya untuk ADMIN.
router.use(authenticateToken, authorizeAdmin);

router.get("/dashboard", getDashboard);
router.get("/app-info", getAppInfo);

router.get("/bookings", getAllBookings);
router.get("/bookings/:id", getBookingDetail);
router.patch("/bookings/:id/review", reviewBooking);
router.patch("/bookings/:id/cancel", cancelBookingByAdmin);

router.get("/rooms", adminListRooms);
router.post("/rooms", adminCreateRoom);
router.get("/rooms/:id", adminGetRoom);
router.patch("/rooms/:id", adminUpdateRoom);
router.delete("/rooms/:id", adminDeleteRoom);
router.post("/rooms/:id/photo", roomPhotoUpload.single("photo"), adminUploadRoomPhoto);
router.delete("/rooms/:id/photo", adminDeleteRoomPhoto);

router.get("/students", listStudents);
router.get("/students/:id", getStudent);
router.patch("/students/:id/status", setStudentStatus);

router.get("/schedule", getSchedule);

export default router;
