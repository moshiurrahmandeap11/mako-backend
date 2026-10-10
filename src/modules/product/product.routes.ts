import { Router } from 'express';
import {
  createProduct,
  listProducts,
  updateProduct,
  deleteProduct,
  deleteBulkProducts,
  clearAllProducts,
  importProducts,
} from './product.controller';
import { authenticateDashboard } from '../../middleware/authenticateDashboard';

const router = Router();

router.use(authenticateDashboard as any);

router.get('/', listProducts as any);
router.post('/', createProduct as any);
router.delete('/bulk', deleteBulkProducts as any);
router.post('/bulk-delete', deleteBulkProducts as any);
router.delete('/clear-all', clearAllProducts as any);
router.patch('/:id', updateProduct as any);
router.delete('/:id', deleteProduct as any);
router.post('/import', importProducts as any);

export default router;
