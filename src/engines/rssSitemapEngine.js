import { ENV } from '../config/env.js';
import { getDatabase } from '../db/database.js';

export class RssSitemapEngine {
  /**
   * Generates a valid XML Sitemap 0.9 for a campaign.
   */
  static generateSitemapXml(campaignId) {
    const db = getDatabase();
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) return null;

    const urls = db.prepare('SELECT url, created_at FROM urls WHERE campaign_id = ?').all(campaignId);
    const nowIso = new Date().toISOString();

    const urlElements = urls.map(row => {
      const date = row.created_at ? new Date(row.created_at).toISOString() : nowIso;
      return `  <url>
    <loc>${this.escapeXml(row.url)}</loc>
    <lastmod>${date}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlElements}
</urlset>`;
  }

  /**
   * Generates a valid RSS 2.0 XML feed for a campaign.
   */
  static generateRssXml(campaignId) {
    const db = getDatabase();
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) return null;

    const urls = db.prepare('SELECT url, anchor_text, created_at FROM urls WHERE campaign_id = ?').all(campaignId);
    const nowRss = new Date().toUTCString();

    const items = urls.map((row, idx) => {
      const pubDate = row.created_at ? new Date(row.created_at).toUTCString() : nowRss;
      const title = row.anchor_text || `Backlink Resource #${idx + 1}`;
      return `    <item>
      <title>${this.escapeXml(title)}</title>
      <link>${this.escapeXml(row.url)}</link>
      <guid isPermaLink="true">${this.escapeXml(row.url)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${this.escapeXml(`Discover content and contextual references for ${row.url}`)}</description>
    </item>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${this.escapeXml(campaign.title)} - OmniIndexer Feed</title>
    <link>${this.escapeXml(ENV.BASE_URL)}</link>
    <description>Fast discovery RSS feed for campaign ${this.escapeXml(campaign.title)}</description>
    <lastBuildDate>${nowRss}</lastBuildDate>
    <language>en-us</language>
${items}
  </channel>
</rss>`;
  }

  /**
   * Pings search engines (Google, Bing) with the dynamic sitemap URL.
   */
  static async pingSearchEngines(campaignId) {
    const sitemapUrl = `${ENV.BASE_URL}/public/sitemaps/${campaignId}.xml`;
    const results = {
      google: null,
      bing: null
    };

    // 1. Google Ping
    try {
      const googlePingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(googlePingUrl, { signal: controller.signal });
      clearTimeout(timeout);
      results.google = { success: res.status >= 200 && res.status < 400, status: res.status };
    } catch (err) {
      results.google = { success: false, error: err.name === 'AbortError' ? 'Timeout (Ping Dispatched)' : err.message };
    }

    // 2. Bing Ping
    try {
      const bingPingUrl = `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(bingPingUrl, { signal: controller.signal });
      clearTimeout(timeout);
      results.bing = { success: res.status >= 200 && res.status < 400, status: res.status };
    } catch (err) {
      results.bing = { success: false, error: err.name === 'AbortError' ? 'Timeout (Ping Dispatched)' : err.message };
    }

    return results;
  }

  static escapeXml(unsafe) {
    return String(unsafe).replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
  }
}
