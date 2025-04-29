/**
 * API routes for GitHub RAG system
 */

import { Router } from 'express';
import type { Router as RouterType } from 'express';
import { processRepository, search } from './controllers';

const router: RouterType = Router();

// Repository processing endpoint
router.post('/repository/process', processRepository);

// Search endpoint
router.post('/search', search);

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default router;