import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { ENV } from './config/env.js';
import { getDatabase } from './db/database.js';
import { WorkerQueue } from './services/workerQueue.js';
import apiRoutes from './routes/api.js';
import publicRoutes from './routes/publicRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Initialize database
getDatabase();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Public crawlers & sitemaps
app.use('/public', publicRoutes);

// Protected REST API
app.use('/api', apiRoutes);

// SPA fallback
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/public')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start background worker
WorkerQueue.start();

// Start Server
const server = app.listen(ENV.PORT, ENV.HOST, () => {
  console.log(`====================================================`);
  console.log(`🚀 OmniIndexer Server running at ${ENV.BASE_URL}`);
  console.log(`📡 Multi-Engine Backlink Pipeline Active`);
  console.log(`🎁 30-Day Unlimited Free Trial Enabled`);
  console.log(`====================================================`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down OmniIndexer...');
  WorkerQueue.stop();
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Shutting down OmniIndexer...');
  WorkerQueue.stop();
  server.close(() => {
    process.exit(0);
  });
});

export { app, server };
