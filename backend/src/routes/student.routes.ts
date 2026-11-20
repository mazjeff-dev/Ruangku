import { Router } from "express";
import { getProfile, updateProfile } from "../controllers/user.controller";
import { listMyBookings } from "../controllers/booking.controller";
import { listNotifications } from "../controllers/notification.controller";
import { authenticateToken } from "../middleware/auth.middleware";
import { authorizeStudent } from "../middleware/student.middleware";

// Endpoint fitur pengguna mahasiswa/dosen (alias dari /users, /bookings, /notifications).
const router = Router();

router.use(authenticateToken, authorizeStudent);

router.get("/profile", getProfile);
router.put("/profile", updateProfile);
router.get("/bookings", listMyBookings);
router.get("/notifications", listNotifications);

export default router;
