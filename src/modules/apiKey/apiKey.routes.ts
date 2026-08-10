import { Router } from 'express';
import { createKey, listKeys, revokeKey } from './apiKey.controller';
import { authenticateDashboard } from '../../middleware/authenticateDashboard';

const router = Router();

router.use(authenticateDashboard as any);

router.post('/', createKey as any);
router.get('/', listKeys as any);
router.delete('/:id', revokeKey as any);

export default router;
