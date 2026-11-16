# OmniIndexer (v2.0 Pro)
### The Enterprise Multi-Engine Backlink Indexer & Googlebot Discovery Platform

OmniIndexer is a unified, high-performance backlink indexing system engineered to combine all leading indexing methodologies (IndexMeNow, Rapid URL Indexer, OneHourIndexing, OmegaIndexer, and SpeedyIndex) into a single self-hosted architecture.

---

## ⚡ The 5-Engine Core Pipeline

OmniIndexer operates on a parallel multi-layer delivery framework:

```
[Target Backlinks]
        │
        ├──► 1. Google Indexing API Pool (Service Account OAuth2 JWT Rotator)
        │       • 200 URLs/day per key, auto-rotation across account pool
        │
        ├──► 2. Google Proxy & WebSub Trigger Engine
        │       • Google Translate crawler ping (`translate.google.com`)
        │       • WebSub / PubSubHubbub hub notification
        │
        ├──► 3. Dynamic XML Sitemaps & RSS 2.0 Feeds
        │       • Real-time `/public/sitemaps/:id.xml` and `/public/feeds/:id.xml`
        │       • Automated search engine pinging (Google Ping, Bing Ping)
        │
        ├──► 4. Crawler Trap Seed Network Hubs
        │       • Contextual HTML5 seed pages with Schema.org `ItemList` JSON-LD
        │       • Real-time Googlebot / search crawler detection & IP logging
        │
        └──► 5. Automated Verification & Inspection Engine
                • HTTP status checks, canonical verification, X-Robots-Tag audits
                • Drip schedule pacing (Instant, 3-Day, 7-Day, 14-Day)
```

---

## 🎁 30-Day Unlimited Free Trial Engine

* **Instant Activation:** Every new registered user automatically receives a **30-Day Unlimited Free Trial** (`trial_ends_at = now + 30 days`).
* **Zero Limits:** Users can create unlimited campaigns, submit thousands of backlinks, configure rotating Google Cloud keys, and access real-time crawler logs during their trial.
* **Trial Countdown:** The UI displays a live remaining days badge with countdown notifications.

---

## 🛠 Tech Stack

* **Runtime:** Node.js (v20+ / v22+ / v24+) ES Modules
* **Database:** Native `node:sqlite` (`DatabaseSync` with Write-Ahead Logging `WAL` mode) — zero native C++ compilation dependencies, zero external database setup required.
* **Backend:** Express, JWT Authentication, Bcrypt password hashing, native `node:crypto` RS256 token generation.
* **Frontend:** Clean single-page application built to Hallmark & Impeccable design standards (Dark slate palette, accessible design tokens, zero external CDN dependencies, fully responsive).
* **Worker:** In-memory queue processor with configurable batching and drip feeding.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Test Suite
```bash
npm test
```
All 10 integration tests will verify authentication, trial status, key pool rotation, campaign creation, dynamic XML generation, Googlebot detection, and worker processing.

### 3. Start the Server
```bash
npm start
```
Open **`http://localhost:3000`** in your browser.

---

## 🔑 Adding Google Service Account Keys (Engine 1)

1. Go to **Google Cloud Console** (`console.cloud.google.com`).
2. Create or select a project, then enable the **Web Search Indexing API**.
3. Create a **Service Account** with the `Owner` or `Editor` role.
4. Generate and download a **JSON Key**.
5. In OmniIndexer, navigate to the **Google API Pool** tab and paste the JSON content.
6. The system will automatically rotate keys and track daily quotas (200 URLs/day per key).

---

## 📁 Project Structure

```
omni-indexer/
├── .env
├── .env.example
├── package.json
├── README.md
├── src/
│   ├── config/
│   │   └── env.js
│   ├── db/
│   │   └── database.js             # Native SQLite with schema & indexes
│   ├── engines/
│   │   ├── googleApiEngine.js       # OAuth2 JWT & Indexing API publish
│   │   ├── googleProxyEngine.js     # Translate & WebSub pingers
│   │   ├── rssSitemapEngine.js      # Dynamic XML sitemap & RSS feeds
│   │   ├── crawlerTrapEngine.js     # Seed hubs & Googlebot detector
│   │   └── verificationEngine.js    # Link health & status sync
│   ├── middleware/
│   │   └── authMiddleware.js        # JWT verify & 30-day trial guard
│   ├── public/
│   │   ├── app.js                   # Client SPA logic
│   │   ├── index.html               # Hallmark dark-mode UI
│   │   └── style.css                # Design tokens & responsive styles
│   ├── routes/
│   │   ├── api.js                   # REST API routes
│   │   └── publicRoutes.js          # Public sitemaps, feeds, seed hubs
│   ├── services/
│   │   ├── authService.js           # Auth & trial calculator
│   │   ├── campaignService.js       # Campaign management & drip schedule
│   │   ├── serviceAccountService.js # Key pool manager
│   │   └── workerQueue.js           # Background job scheduler
│   └── server.js                    # Server bootstrap
└── tests/
    └── test_indexer.js              # Comprehensive E2E test suite
```
