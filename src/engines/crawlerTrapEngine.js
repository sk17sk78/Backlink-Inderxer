import { getDatabase } from '../db/database.js';

export class CrawlerTrapEngine {
  /**
   * Detects if an incoming request is from a known search engine crawler.
   */
  static detectBot(userAgent, ipAddress = '') {
    if (!userAgent) return null;
    const ua = userAgent.toLowerCase();

    // Check if IP is in known Googlebot range (66.249.*)
    const isGoogleIp = ipAddress.startsWith('66.249.') || ipAddress.includes('googlebot');

    if (ua.includes('googlebot-mobile')) {
      return isGoogleIp ? 'Googlebot-Mobile (Verified)' : 'Googlebot-Mobile';
    }
    if (ua.includes('googlebot')) {
      return isGoogleIp ? 'Googlebot (Verified)' : 'Googlebot';
    }
    if (ua.includes('bingbot')) return 'Bingbot';
    if (ua.includes('yandexbot')) return 'YandexBot';
    if (ua.includes('baiduspider')) return 'Baiduspider';
    if (ua.includes('duckduckbot')) return 'DuckDuckBot';
    if (ua.includes('slurp')) return 'Yahoo Slurp';
    if (ua.includes('applebot')) return 'Applebot';
    if (ua.includes('semrushbot')) return 'SemrushBot';
    if (ua.includes('ahrefsbot')) return 'AhrefsBot';

    return null;
  }

  /**
   * Logs bot visits and updates crawler hit statistics.
   */
  static logCrawlerHit(campaignId, urlPath, botName, userAgent, ipAddress) {
    const db = getDatabase();
    const now = Date.now();

    db.prepare(`
      INSERT INTO crawler_hits (campaign_id, url_path, bot_name, user_agent, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(campaignId || null, urlPath, botName, userAgent, ipAddress || 'unknown', now);

    if (campaignId) {
      db.prepare(`
        UPDATE campaigns 
        SET crawled_count = crawled_count + 1, updated_at = ? 
        WHERE id = ?
      `).run(now, campaignId);
    }
  }

  /**
   * Generates a semantic, fast-loading HTML5 seed hub page.
   */
  static generateSeedHubHtml(campaignId) {
    const db = getDatabase();
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) return null;

    const urls = db.prepare('SELECT url, anchor_text, created_at FROM urls WHERE campaign_id = ? LIMIT 500').all(campaignId);

    const itemListSchema = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      'name': `${campaign.title} Resources`,
      'description': `Contextual web resource index for ${campaign.title}`,
      'itemListElement': urls.map((row, idx) => ({
        '@type': 'ListItem',
        'position': idx + 1,
        'url': row.url,
        'name': row.anchor_text || `Resource #${idx + 1}`
      }))
    };

    const linkItemsHtml = urls.map((row, idx) => {
      const anchor = row.anchor_text || row.url;
      return `
        <article class="resource-card">
          <h3><a href="${this.escapeHtml(row.url)}" rel="dofollow" target="_blank">${this.escapeHtml(anchor)}</a></h3>
          <p class="resource-url">${this.escapeHtml(row.url)}</p>
          <p class="resource-desc">Verified contextual reference node index #${idx + 1}. Discovered via OmniIndexer seed network.</p>
        </article>
      `;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(campaign.title)} | Web Resource Index</title>
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
  <meta name="description" content="Verified web index and reference directory for ${this.escapeHtml(campaign.title)}.">
  <script type="application/ld+json">
    ${JSON.stringify(itemListSchema, null, 2)}
  </script>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --link: #60a5fa;
      --border: #1f2937;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      margin: 0;
      padding: 2rem 1rem;
      overflow-x: clip;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin: 0 0 0.5rem 0;
    }
    .meta {
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1.25rem;
    }
    .resource-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      transition: border-color 0.2s ease;
    }
    .resource-card h3 {
      margin: 0 0 0.5rem 0;
      font-size: 1.1rem;
    }
    .resource-card a {
      color: var(--link);
      text-decoration: none;
      word-break: break-word;
    }
    .resource-card a:hover {
      text-decoration: underline;
    }
    .resource-url {
      font-family: monospace;
      font-size: 0.8rem;
      color: var(--text-muted);
      word-break: break-all;
      margin: 0.25rem 0 0.5rem 0;
    }
    .resource-desc {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${this.escapeHtml(campaign.title)}</h1>
      <p class="meta">OmniIndexer Public Discovery Hub &bull; ${urls.length} Contextual Entries</p>
    </header>
    <main class="grid">
      ${linkItemsHtml}
    </main>
  </div>
</body>
</html>`;
  }

  static escapeHtml(unsafe) {
    return String(unsafe).replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&#39;';
        case '"': return '&quot;';
      }
    });
  }
}
