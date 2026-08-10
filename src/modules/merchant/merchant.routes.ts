import { Router } from 'express';
import { register, login, me, updateDomains, logout } from './merchant.controller';
import { authenticateDashboard } from '../../middleware/authenticateDashboard';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);

router.get('/me', authenticateDashboard as any, me as any);
router.patch('/domains', authenticateDashboard as any, updateDomains as any);

export default router;
