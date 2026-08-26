import { Router } from 'express';
import { authenticateDashboard, requireAdmin } from '../../middleware/authenticateDashboard';
import { getAdminOverview, getAdminSubscriptions } from './admin.controller';
import {
  getAdminMerchants,
  getAdminMerchantDetails,
  updateMerchantPlan,
  updateMerchantCredits,
  toggleMerchantRole,
} from './adminUsers.controller';
import { getAdminTokenUsage, getAdminKeyPoolsHealth } from './adminTokens.controller';
import { getAdminScraperOverview, triggerAdminForceScrape } from './adminScraper.controller';
import { getAdminInquiries, updateInquiryStatus, deleteInquiry } from './adminInquiries.controller';
import { getAdminBugReports, updateBugStatus, deleteBugReport } from './adminBugs.controller';
import { getAdminPlatformSettings, updateAdminPlatformSetting } from './adminSettings.controller';

export const adminRouter = Router();

// Protect all admin routes
adminRouter.use(authenticateDashboard);
adminRouter.use(requireAdmin);

// 1. Overview & Subscriptions
adminRouter.get('/overview', getAdminOverview);
adminRouter.get('/subscriptions', getAdminSubscriptions);

// 2. Users & Merchants
adminRouter.get('/merchants', getAdminMerchants);
adminRouter.get('/merchants/:merchantId', getAdminMerchantDetails);
adminRouter.patch('/merchants/:merchantId/plan', updateMerchantPlan);
adminRouter.patch('/merchants/:merchantId/credits', updateMerchantCredits);
adminRouter.patch('/merchants/:merchantId/role', toggleMerchantRole);

// 3. AI Tokens & Key Pools Health
adminRouter.get('/token-usage', getAdminTokenUsage);
adminRouter.get('/key-pools', getAdminKeyPoolsHealth);

// 4. Scraper & Crawler Jobs
adminRouter.get('/scraper/overview', getAdminScraperOverview);
adminRouter.post('/scraper/trigger', triggerAdminForceScrape);

// 5. Inquiries
adminRouter.get('/inquiries', getAdminInquiries);
adminRouter.patch('/inquiries/:inquiryId/status', updateInquiryStatus);
adminRouter.delete('/inquiries/:inquiryId', deleteInquiry);

// 6. Bug Reports
adminRouter.get('/bugs', getAdminBugReports);
adminRouter.patch('/bugs/:bugId/status', updateBugStatus);
adminRouter.delete('/bugs/:bugId', deleteBugReport);

// 7. Platform Settings
adminRouter.get('/settings', getAdminPlatformSettings);
adminRouter.post('/settings', updateAdminPlatformSetting);
