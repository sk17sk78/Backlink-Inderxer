import express from 'express';
import { RssSitemapEngine } from '../engines/rssSitemapEngine.js';
import { CrawlerTrapEngine } from '../engines/crawlerTrapEngine.js';

const router = express.Router();

// Middleware to detect bots and log crawler hits
function botTrackingMiddleware(req, res, next) {
  const ua = req.headers['user-agent'] || '';
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const detectedBot = CrawlerTrapEngine.detectBot(ua, ip);
  const campaignId = req.params.campaignId;

  if (detectedBot) {
    CrawlerTrapEngine.logCrawlerHit(campaignId, req.originalUrl, detectedBot, ua, ip);
  }

  next();
}

// 1. Dynamic XML Sitemap Endpoint
router.get('/sitemaps/:campaignId.xml', botTrackingMiddleware, (req, res) => {
  const xml = RssSitemapEngine.generateSitemapXml(req.params.campaignId);
  if (!xml) {
    return res.status(404).send('<!-- Campaign sitemap not found -->');
  }
  res.header('Content-Type', 'application/xml');
  res.send(xml);
});

// 2. Dynamic RSS 2.0 Feed Endpoint
router.get('/feeds/:campaignId.xml', botTrackingMiddleware, (req, res) => {
  const xml = RssSitemapEngine.generateRssXml(req.params.campaignId);
  if (!xml) {
    return res.status(404).send('<!-- Campaign RSS feed not found -->');
  }
  res.header('Content-Type', 'application/rss+xml');
  res.send(xml);
});

// 3. Dynamic Crawler Trap Seed Hub
router.get('/hubs/:campaignId', botTrackingMiddleware, (req, res) => {
  const html = CrawlerTrapEngine.generateSeedHubHtml(req.params.campaignId);
  if (!html) {
    return res.status(404).send('<h1>Seed hub not found</h1>');
  }
  res.header('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

export default router;
