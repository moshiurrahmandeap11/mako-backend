import { Router } from 'express';
import { register, login, me, updateDomains, logout, scrapeUrl, rescrapeDomain } from './merchant.controller';
import { authenticateDashboard } from '../../middleware/authenticateDashboard';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);

router.get('/me', authenticateDashboard as any, me as any);
router.patch('/domains', authenticateDashboard as any, updateDomains as any);
router.post('/domains/rescrape', authenticateDashboard as any, rescrapeDomain as any);
router.post('/scrape', authenticateDashboard as any, scrapeUrl as any);

export default router;
