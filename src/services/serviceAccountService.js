import { getDatabase } from '../db/database.js';

export class ServiceAccountService {
  /**
   * Adds a Google Cloud Service Account JSON key to the user's pool.
   */
  static addKey(userId, keyPayload) {
    const db = getDatabase();

    let clientEmail = keyPayload.client_email;
    let projectId = keyPayload.project_id;
    let privateKey = keyPayload.private_key;
    const dailyQuota = parseInt(keyPayload.daily_quota || '200', 10);

    // If whole raw JSON was pasted
    if (keyPayload.rawJson) {
      try {
        const parsed = JSON.parse(keyPayload.rawJson);
        clientEmail = parsed.client_email;
        projectId = parsed.project_id;
        privateKey = parsed.private_key;
      } catch (e) {
        throw new Error('Invalid Google Service Account JSON formatting.');
      }
    }

    if (!clientEmail || !projectId || !privateKey) {
      throw new Error('Missing client_email, project_id, or private_key.');
    }

    const today = new Date().toISOString().slice(0, 10);
    const now = Date.now();

    const result = db.prepare(`
      INSERT INTO service_accounts (
        user_id, client_email, project_id, private_key, 
        daily_quota, quota_used_today, quota_reset_date, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, 1, ?)
    `).run(userId, clientEmail.trim(), projectId.trim(), privateKey.trim(), dailyQuota, today, now);

    return {
      id: Number(result.lastInsertRowid),
      clientEmail,
      projectId,
      dailyQuota,
      quotaUsedToday: 0,
      isActive: 1,
      createdAt: now
    };
  }

  static listKeys(userId) {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT id, client_email, project_id, daily_quota, quota_used_today, quota_reset_date, is_active, created_at
      FROM service_accounts 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `).all(userId);

    return rows.map(r => ({
      id: r.id,
      clientEmail: r.client_email,
      projectId: r.project_id,
      dailyQuota: r.daily_quota,
      quotaUsedToday: r.quota_used_today,
      remainingQuota: Math.max(0, r.daily_quota - r.quota_used_today),
      isActive: Boolean(r.is_active),
      createdAt: r.created_at
    }));
  }

  static deleteKey(id, userId) {
    const db = getDatabase();
    const res = db.prepare('DELETE FROM service_accounts WHERE id = ? AND user_id = ?').run(id, userId);
    return res.changes > 0;
  }

  static toggleKey(id, userId, isActive) {
    const db = getDatabase();
    const res = db.prepare('UPDATE service_accounts SET is_active = ? WHERE id = ? AND user_id = ?').run(isActive ? 1 : 0, id, userId);
    return res.changes > 0;
  }
}
