import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

export const ENV = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  BASE_URL: process.env.BASE_URL || `http://localhost:${process.env.PORT || '3000'}`,
  JWT_SECRET: process.env.JWT_SECRET || 'omni_indexer_ultra_secure_jwt_secret_key_2026',
  DB_PATH: process.env.DB_PATH || path.join(projectRoot, 'omni_indexer.sqlite'),
  TRIAL_DAYS: 30,
  WORKER_INTERVAL_MS: parseInt(process.env.WORKER_INTERVAL_MS || '1000', 10),
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || '50', 10)
};
