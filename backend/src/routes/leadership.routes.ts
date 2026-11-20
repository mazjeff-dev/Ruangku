import { Router } from "express";
import { getLeadershipOverview, exportLeadershipOverviewCsv } from "../controllers/leadership.controller";
import { authenticateToken } from "../middleware/auth.middleware";
import { authorizeLeadership } from "../middleware/leadership.middleware";

const router = Router();

router.use(authenticateToken, authorizeLeadership);
router.get("/overview", getLeadershipOverview);
router.get("/overview/export", exportLeadershipOverviewCsv);

export default router;
