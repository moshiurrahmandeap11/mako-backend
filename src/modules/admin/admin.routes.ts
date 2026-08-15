import { Router } from 'express';
import { authenticateDashboard, requireAdmin } from '../../middleware/authenticateDashboard';
import {
  getAdminOverview,
  getAdminMerchants,
  updateMerchantPlan,
} from './admin.controller';

export const adminRouter = Router();

// Protect all admin routes
adminRouter.use(authenticateDashboard);
adminRouter.use(requireAdmin);

adminRouter.get('/overview', getAdminOverview);
adminRouter.get('/merchants', getAdminMerchants);
adminRouter.patch('/merchants/:merchantId/plan', updateMerchantPlan);
