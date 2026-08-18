import { Router } from 'express';
import { getSummary, listConversations, exportConversationPdf } from './analytics.controller';
import { authenticateDashboard } from '../../middleware/authenticateDashboard';

const router = Router();

router.use(authenticateDashboard as any);

router.get('/summary', getSummary as any);
router.get('/conversations', listConversations as any);
router.get('/conversations/:sessionId/pdf', exportConversationPdf as any);

export default router;
