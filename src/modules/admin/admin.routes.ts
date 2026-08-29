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
import { getAdminSubscribers, toggleSubscriberStatus, deleteSubscriber } from './adminSubscribers.controller';
import {
  getAdminBlogs,
  getAdminBlogById,
  createAdminBlog,
  updateAdminBlog,
  toggleAdminBlogStatus,
  deleteAdminBlog,
} from './adminBlog.controller';

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

// 3. Subscribers / Waitlist
adminRouter.get('/subscribers', getAdminSubscribers);
adminRouter.patch('/subscribers/:subscriberId/status', toggleSubscriberStatus);
adminRouter.delete('/subscribers/:subscriberId', deleteSubscriber);

// 4. AI Tokens & Key Pools Health
adminRouter.get('/token-usage', getAdminTokenUsage);
adminRouter.get('/key-pools', getAdminKeyPoolsHealth);

// 5. Scraper & Crawler Jobs
adminRouter.get('/scraper/overview', getAdminScraperOverview);
adminRouter.post('/scraper/trigger', triggerAdminForceScrape);

// 6. Inquiries
adminRouter.get('/inquiries', getAdminInquiries);
adminRouter.patch('/inquiries/:inquiryId/status', updateInquiryStatus);
adminRouter.delete('/inquiries/:inquiryId', deleteInquiry);

// 7. Bug Reports
adminRouter.get('/bugs', getAdminBugReports);
adminRouter.patch('/bugs/:bugId/status', updateBugStatus);
adminRouter.delete('/bugs/:bugId', deleteBugReport);

// 8. Platform Settings
adminRouter.get('/settings', getAdminPlatformSettings);
adminRouter.post('/settings', updateAdminPlatformSetting);


// 9. Blog Management
adminRouter.get('/blogs', getAdminBlogs);
adminRouter.get('/blogs/:id', getAdminBlogById);
adminRouter.post('/blogs', createAdminBlog);
adminRouter.put('/blogs/:id', updateAdminBlog);
adminRouter.patch('/blogs/:id/status', toggleAdminBlogStatus);
adminRouter.delete('/blogs/:id', deleteAdminBlog);
