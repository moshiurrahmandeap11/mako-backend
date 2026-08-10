import { Router } from 'express';
import { createSession, getWidgetConfigPublic, chat } from './chat.controller';
import { authenticateWidget } from '../../middleware/authenticateWidget';

const router = Router();

router.use(authenticateWidget as any);

router.post('/session', createSession as any);
router.get('/config', getWidgetConfigPublic as any);
router.post('/chat', chat as any);

export default router;
