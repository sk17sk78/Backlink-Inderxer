import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';

export class GoogleApiEngine {
  /**
   * Generates a signed OAuth2 JWT for Google Service Account without external dependencies.
   */
  static generateServiceAccountJwt(clientEmail, privateKey) {
    const now = Math.floor(Date.now() / 1000);
    const header = {
      alg: 'RS256',
      typ: 'JWT'
    };

    const payload = {
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/indexing',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };

    const base64UrlEncode = (str) => Buffer.from(str).toString('base64url');

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsignedToken);
    const signature = signer.sign(privateKey, 'base64url');

    return `${unsignedToken}.${signature}`;
  }

  /**
   * Exchanges Service Account JWT for a bearer access token.
   */
  static async getAccessToken(clientEmail, privateKey) {
    const jwt = this.generateServiceAccountJwt(clientEmail, privateKey);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google OAuth Token Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data.access_token;
  }

  /**
   * Fetches an active service account key with available daily quota.
   */
  static getAvailableKey(userId) {
    const db = getDatabase();
    const today = new Date().toISOString().slice(0, 10);

    // Reset quotas for keys whose reset date is older than today
    db.prepare(`
      UPDATE service_accounts 
      SET quota_used_today = 0, quota_reset_date = ? 
      WHERE quota_reset_date != ?
    `).run(today, today);

    // Get key belonging to user (or any system key) with quota left
    const key = db.prepare(`
      SELECT * FROM service_accounts 
      WHERE is_active = 1 
        AND (user_id = ? OR user_id = 1)
        AND quota_used_today < daily_quota
      ORDER BY quota_used_today ASC 
      LIMIT 1
    `).get(userId);

    return key || null;
  }

  /**
   * Submits a URL to Google Indexing API.
   */
  static async submitUrl(url, userId) {
    const key = this.getAvailableKey(userId);
    if (!key) {
      return {
        success: false,
        skipped: true,
        reason: 'No active Google Service Account key with available daily quota found.'
      };
    }

    try {
      const accessToken = await this.getAccessToken(key.client_email, key.private_key);
      const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url,
          type: 'URL_UPDATED'
        })
      });

      const db = getDatabase();
      db.prepare(`
        UPDATE service_accounts 
        SET quota_used_today = quota_used_today + 1 
        WHERE id = ?
      `).run(key.id);

      if (!res.ok) {
        const errorData = await res.text();
        return {
          success: false,
          keyId: key.id,
          status: res.status,
          error: errorData
        };
      }

      const responseData = await res.json();
      return {
        success: true,
        keyId: key.id,
        clientEmail: key.client_email,
        response: responseData
      };
    } catch (err) {
      return {
        success: false,
        keyId: key.id,
        error: err.message
      };
    }
  }
}
