import { Router } from 'express';
import { getSummary, listConversations } from './analytics.controller';
import { authenticateDashboard } from '../../middleware/authenticateDashboard';

const router = Router();

router.use(authenticateDashboard as any);

router.get('/summary', getSummary as any);
router.get('/conversations', listConversations as any);

export default router;
