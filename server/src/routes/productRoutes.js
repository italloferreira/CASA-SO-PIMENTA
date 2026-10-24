import { Router } from 'express';
import { authMiddleware, adminMiddleware, optionalAuth } from '../middlewares/authMiddleware.js';

import {
  listProducts,
  getProductById,
  getSimilarProducts,
  searchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductsStatus
} from '../controllers/productController.js';
import { adminLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

router.get('/', optionalAuth, listProducts);
router.get('/search', searchProducts);
router.get('/status', getProductsStatus);
router.get('/:id/similar', getSimilarProducts);
router.get('/:id', getProductById);
router.post('/', authMiddleware, adminMiddleware, adminLimiter, createProduct);
router.put('/:id', authMiddleware, adminMiddleware, adminLimiter, updateProduct);
router.delete('/:id', authMiddleware, adminMiddleware, adminLimiter, deleteProduct);

export default router;