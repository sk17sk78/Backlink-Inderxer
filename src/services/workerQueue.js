import { ENV } from '../config/env.js';
import { getDatabase } from '../db/database.js';
import { GoogleApiEngine } from '../engines/googleApiEngine.js';
import { GoogleProxyEngine } from '../engines/googleProxyEngine.js';
import { VerificationEngine } from '../engines/verificationEngine.js';

export class WorkerQueue {
  static timer = null;
  static isProcessing = false;

  static start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.processNextBatch().catch(err => {
        console.error('[WorkerQueue Error]:', err.message);
      });
    }, ENV.WORKER_INTERVAL_MS);
    console.log(`[WorkerQueue] Engine started. Polling every ${ENV.WORKER_INTERVAL_MS}ms.`);
  }

  static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  static async processNextBatch() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const db = getDatabase();
      const now = Date.now();

      // Fetch batch of queued URLs due for execution
      const dueUrls = db.prepare(`
        SELECT u.*, c.engines as campaign_engines 
        FROM urls u
        JOIN campaigns c ON u.campaign_id = c.id
        WHERE u.status = 'queued' AND u.scheduled_at <= ?
        LIMIT ?
      `).all(now, ENV.BATCH_SIZE);

      if (dueUrls.length === 0) {
        this.isProcessing = false;
        return 0;
      }

      // Concurrent multi-engine processing for maximum speed (Full Power)
      await Promise.allSettled(dueUrls.map(item => this.processSingleUrl(item)));

      // Group affected campaigns and sync stats
      const campaignIds = [...new Set(dueUrls.map(u => u.campaign_id))];
      for (const cid of campaignIds) {
        VerificationEngine.syncCampaignStats(cid);
      }

      return dueUrls.length;
    } finally {
      this.isProcessing = false;
    }
  }

  static async processSingleUrl(item) {
    const db = getDatabase();
    const now = Date.now();

    try {
      // Mark processing
      db.prepare(`UPDATE urls SET status = 'processing' WHERE id = ?`).run(item.id);

      const engines = JSON.parse(item.campaign_engines || '[]');
      const enginesLog = {};

      // 1. Google Indexing API Engine
      if (engines.includes('google_api')) {
        const apiResult = await GoogleApiEngine.submitUrl(item.url, item.user_id);
        enginesLog.google_api = apiResult;
      } else {
        enginesLog.google_api = { skipped: true };
      }

      // 2. Google Proxy & WebSub Engine
      if (engines.includes('google_proxy')) {
        const proxyResult = await GoogleProxyEngine.triggerGoogleCrawlers(item.url);
        enginesLog.google_proxy = proxyResult;
      } else {
        enginesLog.google_proxy = { skipped: true };
      }

      // 3. RSS & Sitemap Engine
      if (engines.includes('rss_sitemap')) {
        enginesLog.rss_sitemap = {
          active: true,
          sitemapUrl: `${ENV.BASE_URL}/public/sitemaps/${item.campaign_id}.xml`,
          rssFeedUrl: `${ENV.BASE_URL}/public/feeds/${item.campaign_id}.xml`
        };
      }

      // 4. Crawler Trap Hub
      if (engines.includes('crawler_trap')) {
        enginesLog.crawler_trap = {
          active: true,
          hubUrl: `${ENV.BASE_URL}/public/hubs/${item.campaign_id}`
        };
      }

      // 5. Verification & Target Inspection
      const checkResult = await VerificationEngine.checkUrlStatus(item.url);
      const finalStatus = checkResult.isAccessible ? 'crawled' : 'failed';

      db.prepare(`
        UPDATE urls 
        SET status = ?,
            engines_executed = ?,
            last_crawled_at = ?,
            last_checked_at = ?,
            index_details = ?
        WHERE id = ?
      `).run(
        finalStatus,
        JSON.stringify(enginesLog),
        now,
        now,
        JSON.stringify(checkResult),
        item.id
      );
    } catch (err) {
      db.prepare(`
        UPDATE urls 
        SET status = 'failed',
            last_checked_at = ?,
            index_details = ?
        WHERE id = ?
      `).run(
        now,
        JSON.stringify({ error: err.message, isAccessible: false }),
        item.id
      );
    }
  }

  static async forceRunNow() {
    return await this.processNextBatch();
  }
}
