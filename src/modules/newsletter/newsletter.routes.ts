import { Router } from 'express';
import { subscribeNewsletter } from './newsletter.controller';

const router = Router();

// Support both POST / and POST /subscribe for maximum compatibility with external callers
router.post('/', subscribeNewsletter);
router.post('/subscribe', subscribeNewsletter);

export default router;
export { router as newsletterRouter };
