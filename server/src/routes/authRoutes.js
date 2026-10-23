import { Router } from 'express';
import { register, login, googleLogin, getGoogleConfig, logout, getProfile, updateProfile, forgotPassword, resetPassword } from '../controllers/authController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { authLimiter, strictAuthLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', strictAuthLimiter, login);
router.post('/google', authLimiter, googleLogin);
router.get('/google/config', getGoogleConfig);
router.post('/logout', logout);
router.get('/profile', authMiddleware, getProfile);
router.get('/me', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.put('/me', authMiddleware, updateProfile);
router.post('/forgot-password', strictAuthLimiter, forgotPassword);
router.post('/reset-password', strictAuthLimiter, resetPassword);

export default router;