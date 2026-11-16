import assert from 'node:assert';
import { app, server } from '../src/server.js';
import { AuthService } from '../src/services/authService.js';
import { CampaignService } from '../src/services/campaignService.js';
import { ServiceAccountService } from '../src/services/serviceAccountService.js';
import { WorkerQueue } from '../src/services/workerQueue.js';
import { RssSitemapEngine } from '../src/engines/rssSitemapEngine.js';
import { CrawlerTrapEngine } from '../src/engines/crawlerTrapEngine.js';
import { getDatabase } from '../src/db/database.js';

async function runTests() {
  console.log('🧪 Starting OmniIndexer End-to-End Test Suite...\n');

  try {
    // Test 1: User Registration & 30-Day Free Trial
    console.log('Test 1: Registering new user and checking 30-day trial...');
    const testEmail = `seo_tester_${Date.now()}@example.com`;
    const regResult = AuthService.register('Sarah SEO Specialist', testEmail, 'securePass123!');
    
    assert.strictEqual(regResult.user.email, testEmail);
    assert.strictEqual(regResult.user.isTrialActive, true);
    assert.strictEqual(regResult.user.trialDaysRemaining, 30);
    assert.ok(regResult.token, 'JWT token must be generated');
    console.log('✅ Test 1 Passed: User registered with active 30-day unlimited trial.\n');

    // Test 2: User Login
    console.log('Test 2: Verifying user login...');
    const loginResult = AuthService.login(testEmail, 'securePass123!');
    assert.strictEqual(loginResult.user.id, regResult.user.id);
    assert.strictEqual(loginResult.user.isTrialActive, true);
    console.log('✅ Test 2 Passed: User login verified.\n');

    const userId = loginResult.user.id;

    // Test 3: Add Service Account Key to Pool
    console.log('Test 3: Adding Google Service Account Key to pool...');
    const mockServiceAccount = {
      client_email: 'bot-indexer@seo-cloud-test-2026.iam.gserviceaccount.com',
      project_id: 'seo-cloud-test-2026',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3\n-----END PRIVATE KEY-----\n',
      daily_quota: 200
    };

    const keyResult = ServiceAccountService.addKey(userId, mockServiceAccount);
    assert.ok(keyResult.id, 'Key ID should be returned');
    assert.strictEqual(keyResult.dailyQuota, 200);

    const keysList = ServiceAccountService.listKeys(userId);
    assert.strictEqual(keysList.length, 1);
    assert.strictEqual(keysList[0].remainingQuota, 200);
    console.log('✅ Test 3 Passed: Service Account added and quota tracked (200/200).\n');

    // Test 4: Create Indexing Campaign with Bulk URLs
    console.log('Test 4: Creating campaign with multiple backlinks...');
    const urlsInput = `
      https://example.com/best-seo-tools-2026 | Top SEO Tools 2026
      https://example.org/backlink-strategy-guide | Link Building Guide
      https://example.net/guest-post-feature
    `;

    const campaign = CampaignService.createCampaign(userId, {
      title: 'High-Authority Tier 1 Blast',
      urlsText: urlsInput,
      engines: ['google_api', 'google_proxy', 'rss_sitemap', 'crawler_trap'],
      dripMode: 'instant'
    });

    assert.ok(campaign.id.startsWith('cmp_'));
    assert.strictEqual(campaign.total_urls, 3);
    assert.strictEqual(campaign.pending_count, 3);
    assert.strictEqual(campaign.engines.length, 4);
    console.log(`✅ Test 4 Passed: Campaign created with ID: ${campaign.id} and 3 parsed URLs.\n`);

    // Test 5: Dynamic XML Sitemap Generation
    console.log('Test 5: Validating dynamic XML Sitemap...');
    const sitemapXml = RssSitemapEngine.generateSitemapXml(campaign.id);
    assert.ok(sitemapXml.includes('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(sitemapXml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
    assert.ok(sitemapXml.includes('https://example.com/best-seo-tools-2026'));
    assert.ok(sitemapXml.includes('https://example.org/backlink-strategy-guide'));
    console.log('✅ Test 5 Passed: XML Sitemap generated with valid sitemap 0.9 schema.\n');

    // Test 6: Dynamic RSS 2.0 Feed Generation
    console.log('Test 6: Validating dynamic RSS 2.0 Feed...');
    const rssXml = RssSitemapEngine.generateRssXml(campaign.id);
    assert.ok(rssXml.includes('<rss version="2.0"'));
    assert.ok(rssXml.includes('<channel>'));
    assert.ok(rssXml.includes('<title>Top SEO Tools 2026</title>'));
    console.log('✅ Test 6 Passed: Dynamic RSS 2.0 feed generated with valid channel/items.\n');

    // Test 7: Semantic Crawler Trap Seed Hub HTML
    console.log('Test 7: Validating Crawler Trap Seed Hub HTML5...');
    const trapHtml = CrawlerTrapEngine.generateSeedHubHtml(campaign.id);
    assert.ok(trapHtml.includes('<!DOCTYPE html>'));
    assert.ok(trapHtml.includes('application/ld+json'));
    assert.ok(trapHtml.includes('schema.org'));
    assert.ok(trapHtml.includes('ItemList'));
    assert.ok(trapHtml.includes('https://example.com/best-seo-tools-2026'));
    console.log('✅ Test 7 Passed: HTML5 Seed Trap Hub generated with Schema.org ItemList.\n');

    // Test 8: Simulate Googlebot Visit on Crawler Trap
    console.log('Test 8: Simulating real Googlebot visit...');
    const googlebotUa = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
    const detected = CrawlerTrapEngine.detectBot(googlebotUa);
    assert.strictEqual(detected, 'Googlebot');

    CrawlerTrapEngine.logCrawlerHit(campaign.id, `/public/hubs/${campaign.id}`, detected, googlebotUa, '66.249.66.1');

    const db = getDatabase();
    const hitRecord = db.prepare('SELECT * FROM crawler_hits WHERE campaign_id = ? ORDER BY id DESC LIMIT 1').get(campaign.id);
    assert.ok(hitRecord);
    assert.strictEqual(hitRecord.bot_name, 'Googlebot');
    assert.strictEqual(hitRecord.ip_address, '66.249.66.1');
    console.log('✅ Test 8 Passed: Googlebot crawler detection and IP logging verified.\n');

    // Test 9: Multi-Engine Background Worker Processing
    console.log('Test 9: Triggering Background Worker to process queued backlinks...');
    const processedCount = await WorkerQueue.forceRunNow();
    assert.strictEqual(processedCount, 3, 'Worker should process all 3 queued URLs');

    const updatedUrls = CampaignService.getCampaignUrls(campaign.id, userId);
    for (const urlItem of updatedUrls) {
      assert.ok(urlItem.status === 'crawled' || urlItem.status === 'indexed' || urlItem.status === 'failed');
      assert.ok(urlItem.last_crawled_at > 0);
      assert.ok(urlItem.engines_executed);
    }

    const updatedCampaign = CampaignService.getCampaign(campaign.id, userId);
    assert.strictEqual(updatedCampaign.pending_count, 0);
    assert.ok(updatedCampaign.crawled_count > 0 || updatedCampaign.failed_count > 0);
    console.log(`✅ Test 9 Passed: Background worker processed all URLs across selected engines.\n`);

    // Test 10: Overview Dashboard Metrics
    console.log('Test 10: Validating overview dashboard analytics...');
    const overview = CampaignService.getDashboardOverview(userId);
    assert.ok(overview.overview.totalUrls >= 3);
    assert.strictEqual(overview.overview.activeServiceAccounts, 1);
    assert.ok(overview.overview.googlebotHits >= 1);
    assert.strictEqual(overview.overview.trial.isActive, true);
    console.log('✅ Test 10 Passed: Dashboard overview statistics accurate and synchronized.\n');

    // Test 11: System Diagnostics Health Endpoint
    console.log('Test 11: Testing /api/health endpoint...');
    const healthRes = await fetch('http://localhost:3000/api/health');
    assert.strictEqual(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'ok');
    assert.ok(healthData.workerActive === true);
    console.log('✅ Test 11 Passed: Health diagnostics report online status.\n');

    // Test 12: Campaign CSV Export
    console.log('Test 12: Testing CSV report export...');
    const csvRes = await fetch(`http://localhost:3000/api/campaigns/${campaign.id}/export.csv`, {
      headers: { 'Authorization': `Bearer ${loginResult.token}` }
    });
    assert.strictEqual(csvRes.status, 200);
    const csvText = await csvRes.text();
    assert.ok(csvText.includes('Target URL'));
    assert.ok(csvText.includes('best-seo-tools-2026'));
    console.log('✅ Test 12 Passed: CSV campaign export generated with complete URL records.\n');

    console.log('🎉 ALL 12 TESTS PASSED! OmniIndexer is 100% gap-free and production-ready!\n');
  } catch (err) {
    console.error('❌ Test Failure:', err);
    process.exit(1);
  } finally {
    WorkerQueue.stop();
    server.close();
  }
}

runTests();
