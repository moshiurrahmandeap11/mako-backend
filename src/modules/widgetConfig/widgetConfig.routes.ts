import { Router } from "express";
import { authenticateDashboard } from "../../middleware/authenticateDashboard";
import {
  getConfig,
  resetConfig,
  updateConfig,
  uploadAvatar,
} from "./widgetConfig.controller";

const router = Router();

router.use(authenticateDashboard as any);

router.get("/", getConfig as any);
router.patch("/", updateConfig as any);
router.post("/upload-avatar", uploadAvatar as any);
router.post("/reset", resetConfig as any);

export default router;
