// OmniIndexer Client Application Logic

let currentUser = null;
let currentToken = localStorage.getItem('omni_token') || null;
let currentTabId = 'tab-overview';
let autoPollTimer = null;
let currentModalUrls = [];
let activeModalCampaignId = null;
let activeModalFilter = 'all';
let modalSearchTerm = '';

// DOM Ready - Opens directly with ZERO login wall
document.addEventListener('DOMContentLoaded', () => {
  initAuthUI();
  initNavigation();
  initCampaignForm();
  initKeyModal();
  initModalFilters();

  if (currentToken) {
    verifySession();
  } else {
    initDirectGuestSession();
  }
});

// ================= AUTHENTICATION & DIRECT ACCESS =================
function initAuthUI() {
  const toggleToReg = document.getElementById('toggle-to-register');
  const toggleToLogin = document.getElementById('toggle-to-login');
  const loginForm = document.getElementById('login-form');
  const regForm = document.getElementById('register-form');
  const openAuthModalBtn = document.getElementById('btn-open-auth-modal');
  const forceWorkerBtn = document.getElementById('btn-force-worker');
  const btnSendOtp = document.getElementById('btn-send-otp');
  const regEmailInput = document.getElementById('reg-email');
  const emailValStatus = document.getElementById('email-val-status');
  const otpGroup = document.getElementById('otp-group');
  const submitRegisterBtn = document.getElementById('btn-submit-register');

  if (openAuthModalBtn) {
    openAuthModalBtn.addEventListener('click', () => {
      openAuthModal();
    });
  }

  toggleToReg.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    regForm.style.display = 'block';
    clearAuthAlert();
  });

  toggleToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    regForm.style.display = 'none';
    loginForm.style.display = 'block';
    clearAuthAlert();
  });

  // Login handler
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
      const res = await apiRequest('/api/auth/login', 'POST', { email, password }, false);
      setSession(res.token, res.user);
      closeAuthModal();
      alert(`Welcome back, ${res.user.name || res.user.email}!`);
    } catch (err) {
      showAuthAlert(err.message, 'danger');
    }
  });

  // Send 6-Digit Verification Code to Real Gmail / MX Domain
  btnSendOtp.addEventListener('click', async () => {
    const email = regEmailInput.value.trim();
    if (!email) {
      showAuthAlert('Please enter your email address first.', 'danger');
      return;
    }

    btnSendOtp.disabled = true;
    btnSendOtp.textContent = 'Verifying MX...';
    emailValStatus.textContent = 'Verifying domain mail servers (DNS MX) & Gmail syntax...';
    emailValStatus.style.color = 'var(--status-info)';

    try {
      const res = await apiRequest('/api/auth/send-otp', 'POST', { email }, false);
      
      otpGroup.style.display = 'block';
      submitRegisterBtn.disabled = false;
      btnSendOtp.textContent = 'Code Sent ✓';
      emailValStatus.textContent = `✓ Active mail servers verified for ${email}.`;
      emailValStatus.style.color = 'var(--status-success)';

      showAuthAlert(`Verification code generated: ${res.debugOtp}. Enter this 6-digit code below to verify your email.`, 'success');
      document.getElementById('reg-otp').focus();
    } catch (err) {
      emailValStatus.textContent = `✗ ${err.message}`;
      emailValStatus.style.color = 'var(--status-danger)';
      showAuthAlert(err.message, 'danger');
      btnSendOtp.disabled = false;
      btnSendOtp.textContent = 'Send Code';
    }
  });

  // Register with verified OTP
  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const otp = document.getElementById('reg-otp').value;

    if (!otp) {
      showAuthAlert('Please enter the 6-digit verification code.', 'danger');
      return;
    }

    submitRegisterBtn.disabled = true;
    submitRegisterBtn.textContent = 'Verifying & Creating Account...';

    try {
      const res = await apiRequest('/api/auth/verify-and-register', 'POST', { name, email, password, otp }, false);
      setSession(res.token, res.user);
      closeAuthModal();
      alert(`Account verified and activated successfully! You have a 30-day unlimited trial.`);
    } catch (err) {
      showAuthAlert(err.message, 'danger');
      submitRegisterBtn.disabled = false;
      submitRegisterBtn.textContent = 'Verify Code & Create Account';
    }
  });

  forceWorkerBtn.addEventListener('click', async () => {
    forceWorkerBtn.disabled = true;
    forceWorkerBtn.textContent = '⏳ Processing...';
    try {
      const res = await apiRequest('/api/worker/run-now', 'POST');
      alert(`Worker triggered! Processed ${res.processedCount} queued URLs.`);
      loadDashboardOverview();
      loadCampaigns();
    } catch (err) {
      alert(`Worker trigger error: ${err.message}`);
    } finally {
      forceWorkerBtn.disabled = false;
      forceWorkerBtn.textContent = '⚡ Run Worker';
    }
  });
}

window.openAuthModal = function() {
  document.getElementById('auth-modal').classList.add('open');
  clearAuthAlert();
};

window.closeAuthModal = function() {
  document.getElementById('auth-modal').classList.remove('open');
};

function showAuthAlert(msg, type = 'danger') {
  const alertEl = document.getElementById('auth-alert');
  alertEl.style.display = 'block';
  alertEl.textContent = msg;
  if (type === 'danger') {
    alertEl.style.background = 'var(--status-danger-bg)';
    alertEl.style.color = 'var(--status-danger)';
    alertEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
  } else if (type === 'success') {
    alertEl.style.background = 'var(--status-success-bg)';
    alertEl.style.color = 'var(--status-success)';
    alertEl.style.border = '1px solid rgba(16, 185, 129, 0.3)';
  }
}

function clearAuthAlert() {
  const alertEl = document.getElementById('auth-alert');
  alertEl.style.display = 'none';
  alertEl.textContent = '';
}

function setSession(token, user) {
  currentToken = token;
  currentUser = user;
  localStorage.setItem('omni_token', token);
  localStorage.setItem('omni_user', JSON.stringify(user));
  showAppScreen();
}

function clearSession() {
  if (autoPollTimer) clearInterval(autoPollTimer);
  currentToken = null;
  currentUser = null;
  localStorage.removeItem('omni_token');
  localStorage.removeItem('omni_user');
  initDirectGuestSession();
}

async function verifySession() {
  try {
    const res = await apiRequest('/api/auth/me', 'GET');
    currentUser = res.user;
    showAppScreen();
  } catch (err) {
    initDirectGuestSession();
  }
}

async function initDirectGuestSession() {
  try {
    const res = await apiRequest('/api/auth/guest-session', 'POST', null, false);
    currentToken = res.token;
    currentUser = res.user;
    localStorage.setItem('omni_token', res.token);
    localStorage.setItem('omni_user', JSON.stringify(res.user));
    showAppScreen();
  } catch (err) {
    console.error('Guest session init error:', err);
    showAppScreen();
  }
}

function showAppScreen() {
  document.getElementById('app-screen').style.display = 'block';

  // Update trial indicator
  const trialText = document.getElementById('trial-text');
  const userDisplay = document.getElementById('user-display-name');

  if (currentUser) {
    userDisplay.textContent = currentUser.name || currentUser.email;
    if (currentUser.isTrialActive) {
      trialText.textContent = `${currentUser.trialDaysRemaining} Days Left in Free Trial (Unlimited)`;
    } else {
      trialText.textContent = `Trial Expired`;
      trialText.parentElement.style.background = 'var(--status-danger-bg)';
      trialText.parentElement.style.color = 'var(--status-danger)';
    }
  }

  loadDashboardOverview();
  loadCampaigns();
  loadServiceAccounts();
  loadCrawlerHits();

  // Start background auto-poll every 8 seconds
  if (autoPollTimer) clearInterval(autoPollTimer);
  autoPollTimer = setInterval(() => {
    if (currentTabId === 'tab-overview') loadDashboardOverview();
    if (currentTabId === 'tab-campaigns') loadCampaigns(true);
    if (currentTabId === 'tab-googlebot-live') loadCrawlerHits();
  }, 8000);
}
  const trialText = document.getElementById('trial-text');
  const userDisplay = document.getElementById('user-display-name');

  if (currentUser) {
    userDisplay.textContent = currentUser.name || currentUser.email;
    if (currentUser.isTrialActive) {
      trialText.textContent = `${currentUser.trialDaysRemaining} Days Left in Free Trial (Unlimited)`;
    } else {
      trialText.textContent = `Trial Expired`;
      trialText.parentElement.style.background = 'var(--status-danger-bg)';
      trialText.parentElement.style.color = 'var(--status-danger)';
    }
  }

  loadDashboardOverview();
  loadCampaigns();
  loadServiceAccounts();
  loadCrawlerHits();

  // Start background auto-poll every 8 seconds
  if (autoPollTimer) clearInterval(autoPollTimer);
  autoPollTimer = setInterval(() => {
    if (currentTabId === 'tab-overview') loadDashboardOverview();
    if (currentTabId === 'tab-campaigns') loadCampaigns(true);
    if (currentTabId === 'tab-googlebot-live') loadCrawlerHits();
  }, 8000);
}

// ================= NAVIGATION =================
function initNavigation() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
}

window.switchTab = function(tabId) {
  currentTabId = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  document.querySelectorAll('.tab-content').forEach(section => {
    section.classList.toggle('active', section.id === tabId);
  });

  if (tabId === 'tab-overview') loadDashboardOverview();
  if (tabId === 'tab-campaigns') loadCampaigns();
  if (tabId === 'tab-service-accounts') loadServiceAccounts();
  if (tabId === 'tab-googlebot-live') loadCrawlerHits();
  if (tabId === 'tab-discovery-hubs') renderDiscoveryHubs();
};

// ================= DASHBOARD OVERVIEW =================
async function loadDashboardOverview() {
  try {
    const res = await apiRequest('/api/stats/overview', 'GET');
    const o = res.overview;
    document.getElementById('kpi-total-urls').textContent = o.totalUrls.toLocaleString();
    document.getElementById('kpi-crawled').textContent = o.crawled.toLocaleString();
    document.getElementById('kpi-indexed').textContent = o.indexed.toLocaleString();
    document.getElementById('kpi-pending').textContent = o.pending.toLocaleString();
    document.getElementById('kpi-bot-hits').textContent = o.googlebotHits.toLocaleString();
    document.getElementById('kpi-service-keys').textContent = o.activeServiceAccounts.toLocaleString();
  } catch (err) {
    console.error('Failed to load overview:', err);
  }
}

// ================= CAMPAIGN FORM =================
function initCampaignForm() {
  const form = document.getElementById('create-campaign-form');
  const urlsTextarea = document.getElementById('campaign-urls');
  const countPreview = document.getElementById('urls-count-preview');
  const fileInput = document.getElementById('file-input');
  const fileDropzone = document.getElementById('file-dropzone');

  // File Upload & Drag-Drop Handling
  if (fileInput && fileDropzone) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleFileImport(file);
    });

    fileDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileDropzone.classList.add('dragover');
    });

    fileDropzone.addEventListener('dragleave', () => {
      fileDropzone.classList.remove('dragover');
    });

    fileDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      fileDropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        handleFileImport(e.dataTransfer.files[0]);
      }
    });
  }

  function handleFileImport(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      urlsTextarea.value = content;
      const lines = content.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
      countPreview.textContent = `${lines.length} valid URL${lines.length === 1 ? '' : 's'} imported from "${file.name}"`;
    };
    reader.readAsText(file);
  }

  // URL count preview
  urlsTextarea.addEventListener('input', () => {
    const lines = urlsTextarea.value.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
    countPreview.textContent = `${lines.length} valid URL${lines.length === 1 ? '' : 's'} detected`;
  });

  // Drip feed card toggles
  document.querySelectorAll('.drip-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.drip-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('campaign-title').value;
    const urls = urlsTextarea.value;

    const checkedEngines = Array.from(document.querySelectorAll('input[name="engine"]:checked'))
      .map(cb => cb.value);

    const selectedDrip = document.querySelector('input[name="dripMode"]:checked')?.value || 'instant';

    if (checkedEngines.length === 0) {
      alert('Please select at least one indexing engine.');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = '🚀 Ingesting & Generating Feeds...';

    try {
      const res = await apiRequest('/api/campaigns', 'POST', {
        title,
        urls,
        engines: checkedEngines,
        dripMode: selectedDrip
      });

      alert(`Campaign "${res.campaign.title}" created with ${res.campaign.total_urls} URLs!`);
      form.reset();
      countPreview.textContent = '0 valid URLs detected';
      switchTab('tab-campaigns');
    } catch (err) {
      alert(`Error creating campaign: ${err.message}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '🚀 Start Indexing Campaign';
    }
  });
}

// ================= CAMPAIGN LIST =================
async function loadCampaigns(silent = false) {
  const tbody = document.getElementById('campaigns-table-body');
  try {
    const res = await apiRequest('/api/campaigns', 'GET');
    const campaigns = res.campaigns;

    if (!campaigns || campaigns.length === 0) {
      if (!silent) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No campaigns found. Create your first campaign!</td></tr>`;
      }
      return;
    }

    tbody.innerHTML = campaigns.map(c => {
      const completed = (c.indexed_count || 0) + (c.crawled_count || 0);
      const total = c.total_urls || 1;
      const pct = Math.min(100, Math.round((completed / total) * 100));
      const createdDate = new Date(c.created_at).toLocaleDateString();

      return `
        <tr>
          <td>
            <strong>${escapeHtml(c.title)}</strong>
            <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);">${c.id}</div>
          </td>
          <td><strong>${c.total_urls}</strong> URLs</td>
          <td style="min-width: 140px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
              <span>${completed}/${c.total_urls} done</span>
              <span>${pct}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${pct}%;"></div>
            </div>
          </td>
          <td>
            <span class="badge badge-queued">${c.drip_mode}</span>
          </td>
          <td style="font-size: 0.85rem; color: var(--text-secondary);">${createdDate}</td>
          <td>
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
              <a href="/public/sitemaps/${c.id}.xml" target="_blank" class="badge badge-crawled">XML</a>
              <a href="/public/feeds/${c.id}.xml" target="_blank" class="badge badge-crawled">RSS</a>
              <a href="/public/hubs/${c.id}" target="_blank" class="badge badge-indexed">Trap Hub</a>
            </div>
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="openCampaignUrls('${c.id}', '${escapeHtml(c.title)}')">Inspect</button>
            <button class="btn btn-secondary btn-sm" onclick="downloadCampaignCsv('${c.id}')" title="Export CSV Report">📥 CSV</button>
            <button class="btn btn-danger btn-sm" onclick="deleteCampaign('${c.id}')">Delete</button>
          </td>
        </tr>
      `;
    }).join('');

    renderDiscoveryHubs(campaigns);
  } catch (err) {
    if (!silent) {
      tbody.innerHTML = `<tr><td colspan="7" style="color: var(--status-danger); text-align: center;">Error loading campaigns: ${err.message}</td></tr>`;
    }
  }
}

window.downloadCampaignCsv = function(id) {
  const url = `/api/campaigns/${id}/export.csv`;
  const token = currentToken;
  fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.blob())
  .then(blob => {
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = `campaign-${id}-report.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  })
  .catch(err => alert('CSV download failed: ' + err.message));
};

window.deleteCampaign = async function(id) {
  if (!confirm('Are you sure you want to delete this campaign and all associated URL queue records?')) {
    return;
  }
  try {
    await apiRequest(`/api/campaigns/${id}`, 'DELETE');
    loadCampaigns();
    loadDashboardOverview();
  } catch (err) {
    alert(`Delete failed: ${err.message}`);
  }
};

window.openCampaignUrls = async function(id, title) {
  activeModalCampaignId = id;
  activeModalFilter = 'all';
  modalSearchTerm = '';

  const modal = document.getElementById('urls-modal');
  const titleEl = document.getElementById('urls-modal-title');
  const subtitleEl = document.getElementById('urls-modal-subtitle');
  const tbody = document.getElementById('urls-modal-table-body');
  const searchInput = document.getElementById('url-search-input');

  if (searchInput) searchInput.value = '';

  // Reset filter chip UI
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c.getAttribute('data-filter') === 'all');
  });

  titleEl.textContent = `Campaign: ${title}`;
  subtitleEl.textContent = `Campaign ID: ${id}`;
  tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem;">Loading URL records...</td></tr>`;
  modal.classList.add('open');

  try {
    const res = await apiRequest(`/api/campaigns/${id}/urls?limit=500`, 'GET');
    currentModalUrls = res.urls || [];
    updateModalFilterCounts(currentModalUrls);
    renderModalUrlsTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color: var(--status-danger); text-align: center;">Error: ${err.message}</td></tr>`;
  }
};

function initModalFilters() {
  const searchInput = document.getElementById('url-search-input');
  const chips = document.querySelectorAll('.filter-chip');
  const exportBtn = document.getElementById('btn-modal-export-csv');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      modalSearchTerm = e.target.value.toLowerCase().trim();
      renderModalUrlsTable();
    });
  }

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeModalFilter = chip.getAttribute('data-filter');
      renderModalUrlsTable();
    });
  });

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (activeModalCampaignId) {
        downloadCampaignCsv(activeModalCampaignId);
      }
    });
  }
}

function updateModalFilterCounts(urls) {
  const counts = { all: urls.length, indexed: 0, crawled: 0, queued: 0, failed: 0 };
  urls.forEach(u => {
    if (counts[u.status] !== undefined) {
      counts[u.status]++;
    }
  });

  document.getElementById('count-all').textContent = counts.all;
  document.getElementById('count-indexed').textContent = counts.indexed;
  document.getElementById('count-crawled').textContent = counts.crawled;
  document.getElementById('count-queued').textContent = counts.queued;
  document.getElementById('count-failed').textContent = counts.failed;
}

function renderModalUrlsTable() {
  const tbody = document.getElementById('urls-modal-table-body');
  if (!currentModalUrls || currentModalUrls.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">No URLs found in this campaign.</td></tr>`;
    return;
  }

  const filtered = currentModalUrls.filter(u => {
    const matchesFilter = activeModalFilter === 'all' || u.status === activeModalFilter;
    const matchesSearch = !modalSearchTerm || 
      u.url.toLowerCase().includes(modalSearchTerm) || 
      (u.anchor_text && u.anchor_text.toLowerCase().includes(modalSearchTerm));
    return matchesFilter && matchesSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">No URLs match the current search or filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    const badgeClass = u.status === 'indexed' ? 'badge-indexed' 
      : u.status === 'crawled' ? 'badge-crawled'
      : u.status === 'failed' ? 'badge-failed'
      : u.status === 'processing' ? 'badge-processing'
      : 'badge-queued';

    const sched = new Date(u.scheduled_at).toLocaleTimeString();
    const lastCheck = u.last_checked_at ? new Date(u.last_checked_at).toLocaleTimeString() : 'Pending';
    const executedEngines = Object.keys(u.engines_executed || {}).join(', ') || 'Queued';

    return `
      <tr>
        <td>
          <a href="${escapeHtml(u.url)}" target="_blank" rel="noopener" style="font-family: var(--font-mono); font-size: 0.85rem; word-break: break-all;">
            ${escapeHtml(u.url)}
          </a>
          ${u.anchor_text ? `<div style="font-size: 0.75rem; color: var(--text-muted);">Anchor: ${escapeHtml(u.anchor_text)}</div>` : ''}
        </td>
        <td><span class="badge ${badgeClass}">${u.status}</span></td>
        <td style="font-size: 0.8rem; font-family: var(--font-mono); color: var(--text-secondary);">${executedEngines}</td>
        <td style="font-size: 0.8rem; color: var(--text-secondary);">${sched}</td>
        <td style="font-size: 0.8rem; color: var(--text-secondary);">${lastCheck}</td>
      </tr>
    `;
  }).join('');
}

window.closeUrlsModal = function() {
  document.getElementById('urls-modal').classList.remove('open');
};

// ================= DISCOVERY HUBS RENDERER =================
function renderDiscoveryHubs(campaignsList) {
  const container = document.getElementById('hubs-list-container');
  if (!campaignsList || campaignsList.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted);">No active campaigns. Create a campaign to generate live seed hubs and sitemaps.</p>`;
    return;
  }

  container.innerHTML = campaignsList.map(c => `
    <div style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 1.25rem; margin-bottom: 1rem;">
      <h3 style="margin: 0 0 0.5rem 0; font-size: 1.05rem;">${escapeHtml(c.title)}</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-top: 0.75rem;">
        <div>
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.2rem;">XML SITEMAP ENDPOINT</div>
          <a href="/public/sitemaps/${c.id}.xml" target="_blank" style="font-family: var(--font-mono); font-size: 0.85rem;">/public/sitemaps/${c.id}.xml</a>
        </div>
        <div>
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.2rem;">RSS 2.0 FEED</div>
          <a href="/public/feeds/${c.id}.xml" target="_blank" style="font-family: var(--font-mono); font-size: 0.85rem;">/public/feeds/${c.id}.xml</a>
        </div>
        <div>
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.2rem;">HTML5 CRAWLER TRAP SEED HUB</div>
          <a href="/public/hubs/${c.id}" target="_blank" style="font-family: var(--font-mono); font-size: 0.85rem;">/public/hubs/${c.id}</a>
        </div>
      </div>
    </div>
  `).join('');
}

// ================= SERVICE ACCOUNT KEYS =================
function initKeyModal() {
  const form = document.getElementById('add-key-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawJson = document.getElementById('raw-json-input').value;
    const quota = document.getElementById('key-quota-input').value;

    try {
      await apiRequest('/api/service-accounts', 'POST', {
        rawJson,
        daily_quota: quota
      });

      alert('Service account key added to rotating pool successfully!');
      closeKeyModal();
      form.reset();
      loadServiceAccounts();
      loadDashboardOverview();
    } catch (err) {
      alert(`Failed to add key: ${err.message}`);
    }
  });
}

window.addDemoTestKey = async function() {
  try {
    const res = await apiRequest('/api/service-accounts/demo-key', 'POST');
    alert(`Sandbox Key (${res.key.clientEmail}) added with 200/day daily quota for testing!`);
    loadServiceAccounts();
    loadDashboardOverview();
  } catch (err) {
    alert('Failed to generate demo key: ' + err.message);
  }
};

window.openKeyModal = function() {
  document.getElementById('key-modal').classList.add('open');
};

window.closeKeyModal = function() {
  document.getElementById('key-modal').classList.remove('open');
};

async function loadServiceAccounts() {
  const tbody = document.getElementById('keys-table-body');
  try {
    const res = await apiRequest('/api/service-accounts', 'GET');
    const keys = res.keys;

    if (!keys || keys.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No Service Account keys added. Add one to enable Engine 1 (Google Indexing API).</td></tr>`;
      return;
    }

    tbody.innerHTML = keys.map(k => `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 0.85rem;">${escapeHtml(k.clientEmail)}</td>
        <td style="font-size: 0.85rem;">${escapeHtml(k.projectId)}</td>
        <td><strong>${k.dailyQuota}</strong> /day</td>
        <td style="color: var(--status-warning); font-family: var(--font-mono);">${k.quotaUsedToday}</td>
        <td style="color: var(--status-success); font-family: var(--font-mono);"><strong>${k.remainingQuota}</strong></td>
        <td><span class="badge badge-indexed">${k.isActive ? 'Active' : 'Disabled'}</span></td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="deleteServiceAccount(${k.id})">Remove</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: var(--status-danger); text-align: center;">Error: ${err.message}</td></tr>`;
  }
}

window.deleteServiceAccount = async function(id) {
  if (!confirm('Remove this service account key from the pool?')) return;
  try {
    await apiRequest(`/api/service-accounts/${id}`, 'DELETE');
    loadServiceAccounts();
    loadDashboardOverview();
  } catch (err) {
    alert(`Failed to delete key: ${err.message}`);
  }
};

// ================= LIVE CRAWLER ACTIVITY LOGS =================
async function loadCrawlerHits() {
  const tbody = document.getElementById('crawler-hits-table-body');
  try {
    const res = await apiRequest('/api/crawler-hits', 'GET');
    const hits = res.hits;

    if (!hits || hits.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No search crawler visits recorded yet. Visits will appear live when Googlebot crawls your seed pages.</td></tr>`;
      return;
    }

    tbody.innerHTML = hits.map(h => {
      const time = new Date(h.created_at).toLocaleTimeString();
      return `
        <tr>
          <td style="font-size: 0.8rem; color: var(--text-secondary);">${time}</td>
          <td><span class="badge badge-crawled">${escapeHtml(h.bot_name)}</span></td>
          <td style="font-family: var(--font-mono); font-size: 0.85rem;">${escapeHtml(h.url_path)}</td>
          <td>${escapeHtml(h.campaign_title || 'Direct Feed')}</td>
          <td style="font-family: var(--font-mono); font-size: 0.8rem;">${escapeHtml(h.ip_address)}</td>
          <td style="font-size: 0.75rem; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(h.user_agent)}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: var(--status-danger); text-align: center;">Error: ${err.message}</td></tr>`;
  }
}

// ================= API UTILITY =================
async function apiRequest(endpoint, method = 'GET', body = null, requireAuth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (requireAuth && currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(endpoint, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data;
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
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
