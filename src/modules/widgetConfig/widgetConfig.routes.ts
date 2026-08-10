import { Router } from 'express';
import { getConfig, updateConfig } from './widgetConfig.controller';
import { authenticateDashboard } from '../../middleware/authenticateDashboard';

const router = Router();

router.use(authenticateDashboard as any);

router.get('/', getConfig as any);
router.patch('/', updateConfig as any);

export default router;
