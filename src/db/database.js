import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { ENV } from '../config/env.js';

let dbInstance = null;

export function getDatabase() {
  if (dbInstance) return dbInstance;

  dbInstance = new DatabaseSync(ENV.DB_PATH);
  
  // Performance optimizations for SQLite
  dbInstance.exec('PRAGMA journal_mode = WAL;');
  dbInstance.exec('PRAGMA synchronous = NORMAL;');
  dbInstance.exec('PRAGMA foreign_keys = ON;');

  initSchema(dbInstance);
  return dbInstance;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      trial_ends_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      client_email TEXT NOT NULL,
      project_id TEXT NOT NULL,
      private_key TEXT NOT NULL,
      daily_quota INTEGER DEFAULT 200,
      quota_used_today INTEGER DEFAULT 0,
      quota_reset_date TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      total_urls INTEGER DEFAULT 0,
      indexed_count INTEGER DEFAULT 0,
      crawled_count INTEGER DEFAULT 0,
      pending_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      engines TEXT NOT NULL,
      drip_mode TEXT DEFAULT 'instant',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      anchor_text TEXT,
      status TEXT DEFAULT 'queued',
      engines_executed TEXT DEFAULT '{}',
      scheduled_at INTEGER NOT NULL,
      last_crawled_at INTEGER,
      last_checked_at INTEGER,
      index_details TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS crawler_hits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT,
      url_path TEXT NOT NULL,
      bot_name TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      ip_address TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      campaign_id TEXT,
      action TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      otp_code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      verified_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_urls_status ON urls (status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_urls_campaign ON urls (campaign_id);
    CREATE INDEX IF NOT EXISTS idx_crawler_hits_time ON crawler_hits (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_email_verif ON email_verifications (email);
  `);

  seedDefaultAdmin(db);
}

function seedDefaultAdmin(db) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@omniindexer.com');
  if (!existing) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('admin123456', salt);
    const now = Date.now();
    const tenYears = now + (3650 * 24 * 60 * 60 * 1000);

    db.prepare(`
      INSERT INTO users (name, email, password_hash, role, trial_ends_at, created_at)
      VALUES ('Super Admin', 'admin@omniindexer.com', ?, 'admin', ?, ?)
    `).run(hash, tenYears, now);
  }
}
