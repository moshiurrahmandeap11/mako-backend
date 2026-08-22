import { Router } from 'express';
import {
  listKnowledge,
  scrapeUrl,
  addCustomKnowledge,
  deleteKnowledge,
  deleteAllKnowledge,
  rescrapeAll,
  getScrapeStatusHandler,
} from './knowledge.controller';
import { authenticateDashboard } from '../../middleware/authenticateDashboard';

const router = Router();

router.use(authenticateDashboard as any);

router.get('/', listKnowledge as any);
router.get('/scrape-status', getScrapeStatusHandler as any);
router.post('/scrape-url', scrapeUrl as any);
router.post('/custom', addCustomKnowledge as any);
router.delete('/clear-all', deleteAllKnowledge as any);
router.delete('/:id', deleteKnowledge as any);
router.post('/rescrape-all', rescrapeAll as any);

export default router;
