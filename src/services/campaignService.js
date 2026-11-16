import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { RssSitemapEngine } from '../engines/rssSitemapEngine.js';
import { VerificationEngine } from '../engines/verificationEngine.js';

export class CampaignService {
  /**
   * Creates a new campaign, parses URLs, applies drip schedule, and queues them.
   */
  static createCampaign(userId, { title, urlsText, engines = [], dripMode = 'instant' }) {
    const db = getDatabase();

    if (!title || !title.trim()) {
      throw new Error('Campaign title is required.');
    }

    if (!urlsText || !urlsText.trim()) {
      throw new Error('Please provide at least one valid URL to index.');
    }

    // Parse and sanitize URLs
    const rawLines = urlsText.split(/[\r\n,]+/);
    const parsedUrls = [];
    const seen = new Set();

    for (const line of rawLines) {
      let raw = line.trim();
      if (!raw) continue;

      // Handle "URL | Anchor Text" or plain "URL"
      let url = raw;
      let anchor = '';
      if (raw.includes('|')) {
        const parts = raw.split('|');
        url = parts[0].trim();
        anchor = parts[1].trim();
      }

      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }

      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          const normalized = parsed.href;
          if (!seen.has(normalized)) {
            seen.add(normalized);
            parsedUrls.push({ url: normalized, anchor: anchor || parsed.hostname });
          }
        }
      } catch (e) {
        // Skip malformed URLs
      }
    }

    if (parsedUrls.length === 0) {
      throw new Error('No valid HTTP/HTTPS URLs were found in your submission.');
    }

    const campaignId = 'cmp_' + crypto.randomBytes(6).toString('hex');
    const now = Date.now();
    const defaultEngines = engines.length > 0 ? engines : ['google_api', 'google_proxy', 'rss_sitemap', 'crawler_trap'];

    // Drip schedule durations in milliseconds
    const dripDurations = {
      instant: 0,
      drip_3d: 3 * 24 * 60 * 60 * 1000,
      drip_7d: 7 * 24 * 60 * 60 * 1000,
      drip_14d: 14 * 24 * 60 * 60 * 1000
    };
    const maxDripSpan = dripDurations[dripMode] || 0;

    // Insert Campaign
    db.prepare(`
      INSERT INTO campaigns (
        id, user_id, title, total_urls, indexed_count, crawled_count, 
        pending_count, failed_count, engines, drip_mode, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 0, ?, 0, ?, ?, ?, ?)
    `).run(
      campaignId,
      userId,
      title.trim(),
      parsedUrls.length,
      parsedUrls.length,
      JSON.stringify(defaultEngines),
      dripMode,
      now,
      now
    );

    // Insert URLs
    const insertStmt = db.prepare(`
      INSERT INTO urls (
        campaign_id, user_id, url, anchor_text, status, engines_executed, scheduled_at, created_at
      ) VALUES (?, ?, ?, ?, 'queued', '{}', ?, ?)
    `);

    for (let i = 0; i < parsedUrls.length; i++) {
      const item = parsedUrls[i];
      let scheduledAt = now;
      if (maxDripSpan > 0 && parsedUrls.length > 1) {
        scheduledAt = now + Math.floor((i / (parsedUrls.length - 1)) * maxDripSpan);
      }
      insertStmt.run(campaignId, userId, item.url, item.anchor, scheduledAt, now);
    }

    // Trigger initial search engine ping for dynamic sitemap/RSS if selected
    if (defaultEngines.includes('rss_sitemap')) {
      RssSitemapEngine.pingSearchEngines(campaignId).catch(() => {});
    }

    // Log Activity
    db.prepare(`
      INSERT INTO activity_logs (user_id, campaign_id, action, message, created_at)
      VALUES (?, ?, 'CAMPAIGN_CREATED', ?, ?)
    `).run(userId, campaignId, `Campaign "${title}" created with ${parsedUrls.length} URLs in ${dripMode} mode.`, now);

    return this.getCampaign(campaignId, userId);
  }

  static getCampaign(campaignId, userId) {
    const db = getDatabase();
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?').get(campaignId, userId);
    if (!campaign) return null;

    return {
      ...campaign,
      engines: JSON.parse(campaign.engines)
    };
  }

  static listCampaigns(userId) {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM campaigns WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    return rows.map(r => ({
      ...r,
      engines: JSON.parse(r.engines)
    }));
  }

  static getCampaignUrls(campaignId, userId, limit = 100, offset = 0) {
    const db = getDatabase();
    const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ? AND user_id = ?').get(campaignId, userId);
    if (!campaign) return null;

    const urls = db.prepare(`
      SELECT * FROM urls 
      WHERE campaign_id = ? 
      ORDER BY id ASC 
      LIMIT ? OFFSET ?
    `).all(campaignId, limit, offset);

    return urls.map(u => ({
      ...u,
      engines_executed: JSON.parse(u.engines_executed || '{}')
    }));
  }

  static deleteCampaign(campaignId, userId) {
    const db = getDatabase();
    const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ? AND user_id = ?').get(campaignId, userId);
    if (!campaign) return false;

    db.prepare('DELETE FROM urls WHERE campaign_id = ?').run(campaignId);
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(campaignId);
    return true;
  }

  static getDashboardOverview(userId) {
    const db = getDatabase();

    const user = db.prepare('SELECT trial_ends_at FROM users WHERE id = ?').get(userId);
    const now = Date.now();
    const isTrialActive = user ? user.trial_ends_at > now : false;
    const trialDaysRemaining = isTrialActive 
      ? Math.max(0, Math.ceil((user.trial_ends_at - now) / (1000 * 60 * 60 * 24))) 
      : 0;

    const stats = db.prepare(`
      SELECT 
        COUNT(DISTINCT c.id) as totalCampaigns,
        COALESCE(SUM(c.total_urls), 0) as totalUrls,
        COALESCE(SUM(c.crawled_count), 0) as totalCrawled,
        COALESCE(SUM(c.indexed_count), 0) as totalIndexed,
        COALESCE(SUM(c.pending_count), 0) as totalPending,
        COALESCE(SUM(c.failed_count), 0) as totalFailed
      FROM campaigns c
      WHERE c.user_id = ?
    `).get(userId);

    const keysCount = db.prepare(`
      SELECT COUNT(*) as activeKeys, COALESCE(SUM(quota_used_today), 0) as usedQuota
      FROM service_accounts 
      WHERE user_id = ? AND is_active = 1
    `).get(userId);

    const botHits = db.prepare(`
      SELECT COUNT(*) as totalHits
      FROM crawler_hits ch
      JOIN campaigns c ON ch.campaign_id = c.id
      WHERE c.user_id = ?
    `).get(userId);

    return {
      overview: {
        campaigns: stats.totalCampaigns || 0,
        totalUrls: stats.totalUrls || 0,
        crawled: stats.totalCrawled || 0,
        indexed: stats.totalIndexed || 0,
        pending: stats.totalPending || 0,
        failed: stats.totalFailed || 0,
        activeServiceAccounts: keysCount.activeKeys || 0,
        googlebotHits: botHits.totalHits || 0,
        trial: {
          isActive: isTrialActive,
          daysRemaining: trialDaysRemaining,
          plan: '30-Day Unlimited Free Trial'
        }
      }
    };
  }
}
