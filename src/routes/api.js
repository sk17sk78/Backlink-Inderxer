import express from 'express';
import { AuthService } from '../services/authService.js';
import { CampaignService } from '../services/campaignService.js';
import { ServiceAccountService } from '../services/serviceAccountService.js';
import { WorkerQueue } from '../services/workerQueue.js';
import { authenticate, requireActiveTrial } from '../middleware/authMiddleware.js';
import { getDatabase } from '../db/database.js';

const router = express.Router();

// ================= AUTH ROUTES =================
router.post('/auth/register', (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    const result = AuthService.register(name, email, password);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const result = AuthService.login(email, password);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

router.get('/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// ================= HEALTH & DIAGNOSTICS =================
router.get('/health', (req, res) => {
  const db = getDatabase();
  const queueStats = db.prepare(`
    SELECT 
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing
    FROM urls
  `).get();

  res.json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    workerActive: Boolean(WorkerQueue.timer),
    queue: {
      queued: queueStats.queued || 0,
      processing: queueStats.processing || 0
    },
    timestamp: Date.now()
  });
});

// ================= STATS OVERVIEW =================
router.get('/stats/overview', authenticate, (req, res) => {
  try {
    const overview = CampaignService.getDashboardOverview(req.user.id);
    res.json(overview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= CAMPAIGN ROUTES =================
router.get('/campaigns', authenticate, (req, res) => {
  try {
    const campaigns = CampaignService.listCampaigns(req.user.id);
    res.json({ campaigns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/campaigns', authenticate, requireActiveTrial, (req, res) => {
  try {
    const { title, urls, engines, dripMode } = req.body;
    const campaign = CampaignService.createCampaign(req.user.id, {
      title,
      urlsText: urls,
      engines,
      dripMode
    });
    res.status(201).json({ campaign });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/campaigns/:id', authenticate, (req, res) => {
  try {
    const campaign = CampaignService.getCampaign(req.params.id, req.user.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    res.json({ campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/campaigns/:id', authenticate, (req, res) => {
  try {
    const ok = CampaignService.deleteCampaign(req.params.id, req.user.id);
    if (!ok) {
      return res.status(404).json({ error: 'Campaign not found or unauthorized.' });
    }
    res.json({ success: true, message: 'Campaign deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/campaigns/:id/urls', authenticate, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const offset = parseInt(req.query.offset || '0', 10);
    const urls = CampaignService.getCampaignUrls(req.params.id, req.user.id, limit, offset);
    if (!urls) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }
    res.json({ urls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/campaigns/:id/export.csv', authenticate, (req, res) => {
  try {
    const campaign = CampaignService.getCampaign(req.params.id, req.user.id);
    if (!campaign) {
      return res.status(404).send('Campaign not found.');
    }

    const urls = CampaignService.getCampaignUrls(req.params.id, req.user.id, 10000, 0);
    const header = ['ID', 'Target URL', 'Anchor Text', 'Status', 'Scheduled At', 'Last Crawled At', 'Engines Executed', 'Page Title', 'Canonical URL'];
    
    const rows = (urls || []).map(u => {
      let title = '';
      let canonical = '';
      try {
        const details = JSON.parse(u.index_details || '{}');
        title = (details.pageTitle || '').replace(/"/g, '""');
        canonical = (details.canonicalUrl || '').replace(/"/g, '""');
      } catch (e) {}

      const cleanUrl = u.url.replace(/"/g, '""');
      const cleanAnchor = (u.anchor_text || '').replace(/"/g, '""');
      const engines = Object.keys(u.engines_executed || {}).join(' | ').replace(/"/g, '""');
      const sched = u.scheduled_at ? new Date(u.scheduled_at).toISOString() : '';
      const crawled = u.last_crawled_at ? new Date(u.last_crawled_at).toISOString() : '';

      return `"${u.id}","${cleanUrl}","${cleanAnchor}","${u.status}","${sched}","${crawled}","${engines}","${title}","${canonical}"`;
    });

    const csvContent = [header.join(','), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="campaign-${req.params.id}-report.csv"`);
    res.status(200).send(csvContent);
  } catch (err) {
    res.status(500).send('Error generating CSV report.');
  }
});

// ================= SERVICE ACCOUNT KEYS =================
router.get('/service-accounts', authenticate, (req, res) => {
  try {
    const keys = ServiceAccountService.listKeys(req.user.id);
    res.json({ keys });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/service-accounts', authenticate, requireActiveTrial, (req, res) => {
  try {
    const result = ServiceAccountService.addKey(req.user.id, req.body);
    res.status(201).json({ key: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/service-accounts/demo-key', authenticate, requireActiveTrial, (req, res) => {
  try {
    const randomHex = Math.random().toString(36).substring(2, 8);
    const demoPayload = {
      client_email: `demo-indexer-${randomHex}@omni-sandbox-project.iam.gserviceaccount.com`,
      project_id: `omni-sandbox-${randomHex}`,
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3\n-----END PRIVATE KEY-----\n',
      daily_quota: 200
    };
    const result = ServiceAccountService.addKey(req.user.id, demoPayload);
    res.status(201).json({ key: result, message: 'Demo Sandbox Key generated.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/service-accounts/:id', authenticate, (req, res) => {
  try {
    const ok = ServiceAccountService.deleteKey(parseInt(req.params.id, 10), req.user.id);
    if (!ok) {
      return res.status(404).json({ error: 'Key not found.' });
    }
    res.json({ success: true, message: 'Service Account key removed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= CRAWLER HITS & LOGS =================
router.get('/crawler-hits', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const hits = db.prepare(`
      SELECT ch.*, c.title as campaign_title 
      FROM crawler_hits ch
      LEFT JOIN campaigns c ON ch.campaign_id = c.id
      ORDER BY ch.created_at DESC 
      LIMIT 100
    `).all();
    res.json({ hits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= WORKER MANUAL TRIGGER =================
router.post('/worker/run-now', authenticate, async (req, res) => {
  try {
    const processed = await WorkerQueue.forceRunNow();
    res.json({ success: true, processedCount: processed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
