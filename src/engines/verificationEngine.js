import { getDatabase } from '../db/database.js';

export class VerificationEngine {
  /**
   * Inspects a backlink URL to verify host accessibility, noindex directives, and canonical integrity.
   */
  static async checkUrlStatus(url) {
    const result = {
      isAccessible: false,
      statusCode: null,
      hasNoIndex: false,
      hasCanonical: false,
      canonicalUrl: null,
      pageTitle: null,
      error: null
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      result.statusCode = res.status;
      result.isAccessible = res.status >= 200 && res.status < 400;

      // Check X-Robots-Tag header
      const xRobots = res.headers.get('x-robots-tag');
      if (xRobots && xRobots.toLowerCase().includes('noindex')) {
        result.hasNoIndex = true;
      }

      const html = await res.text();

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        result.pageTitle = titleMatch[1].trim();
      }

      // Check meta robots tag
      const metaRobotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i);
      if (metaRobotsMatch && metaRobotsMatch[1].toLowerCase().includes('noindex')) {
        result.hasNoIndex = true;
      }

      // Check canonical tag
      const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
      if (canonicalMatch) {
        result.hasCanonical = true;
        result.canonicalUrl = canonicalMatch[1];
      }
    } catch (err) {
      result.error = err.name === 'AbortError' ? 'Target connection timed out' : err.message;
    }

    return result;
  }

  /**
   * Recalculates and synchronizes campaign aggregate statistics.
   */
  static syncCampaignStats(campaignId) {
    const db = getDatabase();
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'indexed' THEN 1 ELSE 0 END) as indexed_count,
        SUM(CASE WHEN status = 'crawled' THEN 1 ELSE 0 END) as crawled_count,
        SUM(CASE WHEN status = 'queued' OR status = 'processing' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count
      FROM urls 
      WHERE campaign_id = ?
    `).get(campaignId);

    if (stats) {
      db.prepare(`
        UPDATE campaigns 
        SET total_urls = ?,
            indexed_count = ?,
            crawled_count = ?,
            pending_count = ?,
            failed_count = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        stats.total || 0,
        stats.indexed_count || 0,
        stats.crawled_count || 0,
        stats.pending_count || 0,
        stats.failed_count || 0,
        Date.now(),
        campaignId
      );
    }
  }
}
