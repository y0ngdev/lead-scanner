// Lead Scanner & Application Pipeline Manager Client Logic
// Built with UI-Skills & shadcn-html Design Principles

let currentTab = 'applications';
let currentViewMode = 'kanban';
let applicationsList = [];
let leadsList = [];
let draggedAppId = null;

// Determine API Base URL
function getApiBase() {
  const custom = localStorage.getItem('lead_scanner_api_url');
  if (custom && custom.trim() !== '') {
    return custom.trim().replace(/\/+$/, '');
  }
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    return window.location.origin;
  }
  return 'http://localhost:4000';
}

// Fetch helper with error handling
async function apiFetch(endpoint, options = {}) {
  const url = `${getApiBase()}${endpoint}`;
  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });
    if (!res.ok) {
      const errText = await res.text();
      let message = `API Error ${res.status}: ${res.statusText}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.message) message = parsed.message;
      } catch (e) {
        if (errText) message = errText;
      }
      throw new Error(message);
    }
    const text = await res.text();
    if (!text || text.trim() === '') {
      return null;
    }
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        return JSON.parse(text);
      } catch (e) {
        console.warn('Failed to parse JSON response:', text);
        return null;
      }
    }
    return text;
  } catch (err) {
    console.error(`Request failed for ${url}:`, err);
    throw err;
  }
}

// Helper to refresh Lucide icons whenever HTML changes
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// Normalize source string to a CSS class
function getSourceClass(source) {
  const s = (source || '').toLowerCase();
  if (s.includes('ashby')) return 'ashby';
  if (s.includes('greenhouse')) return 'greenhouse';
  if (s.includes('lever')) return 'lever';
  if (s.includes('workable')) return 'workable';
  if (s.includes('google') || s.includes('dork')) return 'google-dork';
  if (s.includes('yc')) return 'yc';
  if (s.includes('hacker')) return 'hackernews';
  if (s.includes('wework')) return 'weworkremotely';
  if (s.includes('reddit')) return 'reddit';
  return 'manual';
}

// Navigation & Tab Switching
function switchTab(tab) {
  currentTab = tab;
  try {
    localStorage.setItem('lead_scanner_active_tab', tab);
  } catch (e) {}

  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.remove('active', 'text-foreground');
    btn.classList.add('text-muted-foreground');
  });
  document.querySelectorAll('.view-panel').forEach(p => p.style.display = 'none');

  const tabBtn = document.getElementById(`tab-${tab}`);
  if (tabBtn) {
    tabBtn.classList.add('active', 'text-foreground');
    tabBtn.classList.remove('text-muted-foreground');
  }

  const panel = document.getElementById(`view-${tab}`);
  if (panel) {
    panel.style.display = 'flex';
  }

  if (tab === 'applications') {
    loadApplications();
    loadStats();
  } else if (tab === 'leads') {
    loadLeads();
  } else if (tab === 'analytics') {
    loadStats();
    renderAnalytics();
  }

  refreshIcons();
}

function setViewMode(mode) {
  currentViewMode = mode;
  const kanbanBtn = document.getElementById('mode-kanban');
  const tableBtn = document.getElementById('mode-table');
  
  if (kanbanBtn && tableBtn) {
    [kanbanBtn, tableBtn].forEach(b => {
      b.classList.remove('active', 'bg-background', 'text-foreground', 'shadow-xs');
      b.classList.add('text-muted-foreground');
    });
    const activeBtn = document.getElementById(`mode-${mode}`);
    if (activeBtn) {
      activeBtn.classList.add('active', 'bg-background', 'text-foreground', 'shadow-xs');
      activeBtn.classList.remove('text-muted-foreground');
    }
  }

  if (mode === 'kanban') {
    document.getElementById('kanban-view').style.display = 'block';
    document.getElementById('table-view').style.display = 'none';
    renderKanban();
  } else {
    document.getElementById('kanban-view').style.display = 'none';
    document.getElementById('table-view').style.display = 'block';
    renderTable();
  }
}

// Load Application Statistics
async function loadStats() {
  try {
    const stats = await apiFetch('/application-stats');
    if (!stats) return;

    const total = stats.total || 0;
    const statTotalEl = document.getElementById('stat-total');
    if (statTotalEl) statTotalEl.textContent = total;
    const statAppliedEl = document.getElementById('stat-applied');
    if (statAppliedEl) statAppliedEl.textContent = stats.applied || 0;
    const statInterviewingEl = document.getElementById('stat-interviewing');
    if (statInterviewingEl) statInterviewingEl.textContent = (stats.screening + stats.interviewing) || 0;
    const statOfferEl = document.getElementById('stat-offer');
    if (statOfferEl) statOfferEl.textContent = stats.offer || 0;
    const statRateEl = document.getElementById('stat-rate');
    if (statRateEl) statRateEl.textContent = `${Math.round(stats.response_rate || 0)}%`;
    const countAppsEl = document.getElementById('count-applications');
    if (countAppsEl) countAppsEl.textContent = total;
    const trackedEl = document.getElementById('lead-stat-tracked');
    if (trackedEl) trackedEl.textContent = total;
  } catch (err) {
    console.warn('Failed loading stats:', err);
  }
}

// Load Applications List
async function loadApplications() {
  const statusFilter = document.getElementById('app-status-filter')?.value || 'all';
  const searchQuery = document.getElementById('app-search')?.value || '';

  let endpoint = '/applications?limit=200';
  if (statusFilter && statusFilter !== 'all') {
    endpoint += `&status=${encodeURIComponent(statusFilter)}`;
  }
  if (searchQuery.trim() !== '') {
    endpoint += `&search=${encodeURIComponent(searchQuery.trim())}`;
  }

  try {
    const res = await apiFetch(endpoint);
    applicationsList = res?.applications || [];
    const countAppsEl = document.getElementById('count-applications');
    if (countAppsEl) countAppsEl.textContent = res?.total || applicationsList.length;

    // Toggle Empty Pipeline Callout Banner
    const emptyBanner = document.getElementById('pipeline-empty-banner');
    if (emptyBanner) {
      emptyBanner.style.display = applicationsList.length === 0 ? 'flex' : 'none';
    }

    if (currentViewMode === 'kanban') {
      renderKanban();
    } else {
      renderTable();
    }
  } catch (err) {
    showToast(`Could not load applications: ${err.message}`, 'error');
  }
}

// Render Kanban View
function renderKanban() {
  const columns = ['wishlist', 'applied', 'screening', 'interviewing', 'offer', 'rejected'];
  const grouped = {
    wishlist: [],
    applied: [],
    screening: [],
    interviewing: [],
    offer: [],
    rejected: []
  };

  const searchQuery = (document.getElementById('app-search')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('app-status-filter')?.value || 'all';

  applicationsList.forEach(app => {
    let col = app.status;
    if (col === 'withdrawn') col = 'rejected';
    if (!grouped[col]) grouped[col] = [];

    // Filter check
    if (statusFilter !== 'all' && app.status !== statusFilter) return;
    if (searchQuery) {
      const match = (app.company || '').toLowerCase().includes(searchQuery) ||
                    (app.role || '').toLowerCase().includes(searchQuery) ||
                    (app.notes || '').toLowerCase().includes(searchQuery);
      if (!match) return;
    }

    grouped[col].push(app);
  });

  columns.forEach(col => {
    const countBadge = document.getElementById(`badge-${col}`);
    if (countBadge) countBadge.textContent = grouped[col].length;

    const container = document.getElementById(`cards-${col}`);
    if (!container) return;

    if (grouped[col].length === 0) {
      container.innerHTML = `
        <div class="k-empty" onclick="openAddApplicationModal('${col}')" role="button" tabindex="0" aria-label="Add application to ${col}">
          <i data-lucide="plus" style="width:12px;height:12px;"></i>
          Add here
        </div>
      `;
      return;
    }

    container.innerHTML = grouped[col].map(app => createAppCardHTML(app)).join('');
  });

  refreshIcons();
}

function createAppCardHTML(app) {
  const sourceClass = getSourceClass(app.source);
  const companyInitial = (app.company || '?').charAt(0).toUpperCase();

  const nextStepHTML = app.next_step ? `
    <span class="tag amber" title="Next step">
      <i data-lucide="clock" style="width:10px;height:10px;"></i>
      <span class="truncate" style="max-width:100px">${escapeHTML(app.next_step)}</span>
      ${app.next_step_date ? `<strong style="font-size:10px;opacity:0.8">${formatDateBadge(app.next_step_date)}</strong>` : ''}
    </span>
  ` : '';

  const salaryHTML = app.salary ? `
    <span class="tag green" title="Salary">
      <i data-lucide="dollar-sign" style="width:10px;height:10px;"></i>
      ${escapeHTML(app.salary)}
    </span>
  ` : '';

  const locationHTML = app.location ? `
    <span class="tag" title="Location">
      <i data-lucide="map-pin" style="width:10px;height:10px;"></i>
      <span class="truncate" style="max-width:80px">${escapeHTML(app.location)}</span>
    </span>
  ` : '';

  const appliedDateStr = app.applied_date ? formatRelative(app.applied_date) : 'Draft';

  return `
    <div class="app-card" id="card-${app.id}" draggable="true" ondragstart="handleDragStart(event, ${app.id})" ondragend="handleDragEnd(event)" role="listitem">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px">
        <div style="display:flex;align-items:center;gap:6px;min-width:0">
          <div style="width:22px;height:22px;border-radius:4px;background:var(--b1);border:1px solid var(--b2);color:var(--t1);font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0">${companyInitial}</div>
          <div class="app-company">${escapeHTML(app.company)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:2px;flex-shrink:0">
          ${app.job_url ? `
            <a href="${escapeHTML(app.job_url)}" target="_blank" rel="noopener noreferrer" class="icon-btn" style="width:22px;height:22px" title="Open Job Posting" aria-label="Open Job Posting">
              <i data-lucide="external-link" style="width:11px;height:11px;"></i>
            </a>
          ` : ''}
          <button type="button" class="icon-btn" style="width:22px;height:22px" onclick="openEditApplicationModal(${app.id})" title="Edit" aria-label="Edit Application">
            <i data-lucide="edit-3" style="width:11px;height:11px;"></i>
          </button>
          <button type="button" class="icon-btn" style="width:22px;height:22px;color:var(--red-text)" onclick="confirmDeleteApplication(${app.id})" title="Delete" aria-label="Delete Application">
            <i data-lucide="trash-2" style="width:11px;height:11px;"></i>
          </button>
        </div>
      </div>

      <div class="app-role">${escapeHTML(app.role)}</div>

      <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
        <span class="src ${sourceClass}">${escapeHTML(app.source || 'manual')}</span>
        ${salaryHTML}${locationHTML}${nextStepHTML}
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:7px;border-top:1px solid var(--b0);gap:4px">
        <span style="font-size:11px;color:var(--t2);font-variant-numeric:tabular-nums">${appliedDateStr}</span>
        <select style="height:22px;padding:0 20px 0 6px;font-size:10.5px;background:var(--s1);border:1px solid var(--b1);border-radius:4px;color:var(--t1);cursor:pointer;appearance:none;background-image:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E&quot;);background-repeat:no-repeat;background-position:right 5px center;" onchange="quickUpdateStatus(${app.id}, this.value)" aria-label="Update Stage">
          <option value="wishlist" ${app.status === 'wishlist' ? 'selected' : ''}>Wishlist</option>
          <option value="applied" ${app.status === 'applied' ? 'selected' : ''}>Applied</option>
          <option value="screening" ${app.status === 'screening' ? 'selected' : ''}>Screening</option>
          <option value="interviewing" ${app.status === 'interviewing' ? 'selected' : ''}>Interviewing</option>
          <option value="offer" ${app.status === 'offer' ? 'selected' : ''}>Offer</option>
          <option value="rejected" ${app.status === 'rejected' ? 'selected' : ''}>Rejected</option>
        </select>
      </div>
    </div>
  `;
}

// Render Table View
function renderTable() {
  const tbody = document.getElementById('applications-table-body');
  if (!tbody) return;

  const searchQuery = (document.getElementById('app-search')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('app-status-filter')?.value || 'all';

  const filtered = applicationsList.filter(app => {
    if (statusFilter !== 'all' && app.status !== statusFilter) return false;
    if (searchQuery) {
      const match = (app.company || '').toLowerCase().includes(searchQuery) ||
                    (app.role || '').toLowerCase().includes(searchQuery) ||
                    (app.notes || '').toLowerCase().includes(searchQuery);
      if (!match) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding:40px;text-align:center;color:var(--t2);font-size:12.5px">
          No applications match your filter criteria.
        </td>
      </tr>
    `;
    refreshIcons();
    return;
  }

  tbody.innerHTML = filtered.map(app => {
    const sourceClass = getSourceClass(app.source);
    return `
      <tr>
        <td class="td-primary">
          <div>${escapeHTML(app.company)}</div>
          <div style="font-size:11px;color:var(--t1);font-weight:400;margin-top:2px">${escapeHTML(app.role)}</div>
        </td>
        <td><span class="status ${app.status}">${escapeHTML(app.status)}</span></td>
        <td><span class="src ${sourceClass}">${escapeHTML(app.source || 'manual')}</span></td>
        <td style="font-variant-numeric:tabular-nums">${app.applied_date || '<span style="opacity:0.3">—</span>'}</td>
        <td>
          ${app.salary ? `<div style="font-size:12px">${escapeHTML(app.salary)}</div>` : ''}
          ${app.location ? `<div style="font-size:11px;color:var(--t2);margin-top:2px">${escapeHTML(app.location)}</div>` : (!app.salary ? '<span style="opacity:0.3">—</span>' : '')}
        </td>
        <td>
          ${app.next_step ? `
            <div style="font-size:12px;color:var(--t0);font-weight:500">${escapeHTML(app.next_step)}</div>
            ${app.next_step_date ? `<div style="font-size:11px;color:var(--amber-text);font-variant-numeric:tabular-nums;margin-top:2px">${app.next_step_date}</div>` : ''}
          ` : '<span style="opacity:0.3">—</span>'}
        </td>
        <td style="text-align:right">
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:3px">
            ${app.job_url ? `
              <a href="${escapeHTML(app.job_url)}" target="_blank" rel="noopener noreferrer" class="icon-btn" style="width:26px;height:26px" title="View posting" aria-label="View job posting">
                <i data-lucide="external-link" style="width:12px;height:12px;"></i>
              </a>
            ` : ''}
            <button type="button" class="icon-btn" style="width:26px;height:26px" onclick="openEditApplicationModal(${app.id})" title="Edit" aria-label="Edit">
              <i data-lucide="edit-3" style="width:12px;height:12px;"></i>
            </button>
            <button type="button" class="icon-btn" style="width:26px;height:26px;color:var(--red-text)" onclick="confirmDeleteApplication(${app.id})" title="Delete" aria-label="Delete">
              <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  refreshIcons();
}

// Drag & Drop Handlers for Kanban
function handleDragStart(e, id) {
  draggedAppId = id;
  e.dataTransfer.setData('text/plain', String(id));
  e.dataTransfer.effectAllowed = 'move';
  const card = document.getElementById(`card-${id}`);
  if (card) card.classList.add('dragging');
}

function handleDragEnd(e) {
  if (draggedAppId) {
    const card = document.getElementById(`card-${draggedAppId}`);
    if (card) card.classList.remove('dragging');
  }
  document.querySelectorAll('.k-col').forEach(col => col.classList.remove('drag-over'));
  draggedAppId = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const col = e.currentTarget;
  if (!col.classList.contains('drag-over')) {
    col.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  const col = e.currentTarget;
  col.classList.remove('drag-over');
}

async function handleDrop(e, targetStatus) {
  e.preventDefault();
  const col = e.currentTarget;
  col.classList.remove('drag-over');

  const appIdStr = e.dataTransfer.getData('text/plain') || String(draggedAppId);
  const id = parseInt(appIdStr, 10);
  if (!id) return;

  const app = applicationsList.find(a => a.id === id);
  if (!app || app.status === targetStatus) return;

  // Optimistic UI update
  app.status = targetStatus;
  renderKanban();

  try {
    await apiFetch(`/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: targetStatus })
    });
    showToast(`Moved to ${targetStatus}`, 'success');
    loadStats();
  } catch (err) {
    showToast(`Failed to move: ${err.message}`, 'error');
    loadApplications();
  }
}

// Quick Status Update via Select
async function quickUpdateStatus(id, newStatus) {
  const app = applicationsList.find(a => a.id === id);
  if (!app) return;

  app.status = newStatus;
  renderKanban();

  try {
    await apiFetch(`/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    showToast(`Updated to ${newStatus}`, 'success');
    loadStats();
  } catch (err) {
    showToast(`Failed to update status: ${err.message}`, 'error');
    loadApplications();
  }
}

// Load and Render Leads Queue
async function loadLeads() {
  const sourceFilter = document.getElementById('lead-source-filter')?.value || '';
  const reviewedFilter = document.getElementById('lead-review-filter')?.value || 'false';

  let endpoint = '/leads?limit=100';
  if (sourceFilter) endpoint += `&source=${encodeURIComponent(sourceFilter)}`;
  if (reviewedFilter !== '') endpoint += `&reviewed=${encodeURIComponent(reviewedFilter)}`;

  try {
    const res = await apiFetch(endpoint);
    leadsList = res?.leads || [];
    const countEl = document.getElementById('count-leads');
    const totalCount = res?.total !== undefined ? res.total : leadsList.length;
    if (countEl) countEl.textContent = totalCount;

    const unreviewedEl = document.getElementById('lead-stat-unreviewed');
    if (unreviewedEl && reviewedFilter === 'false') {
      unreviewedEl.textContent = totalCount;
    }
    const totalStatEl = document.getElementById('lead-stat-total');
    if (totalStatEl && (!totalStatEl.dataset.initialized || reviewedFilter === '')) {
      totalStatEl.textContent = totalCount;
      totalStatEl.dataset.initialized = 'true';
    }

    renderLeads();
  } catch (err) {
    showToast(`Could not load leads: ${err.message}`, 'error');
  }
}

// Quick Source Filter handler from chips
function setSourceFilter(source) {
  document.querySelectorAll('.chips-row .chip').forEach(btn => {
    const isMatch = btn.getAttribute('data-source') === source;
    btn.classList.toggle('active', isMatch);
    btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
  });

  const select = document.getElementById('lead-source-filter');
  if (select) {
    select.value = source;
  }

  loadLeads();
}

function renderLeads() {
  const container = document.getElementById('leads-container');
  if (!container) return;

  const searchQuery = (document.getElementById('lead-search')?.value || '').toLowerCase();
  const filtered = leadsList.filter(lead => {
    if (!searchQuery) return true;
    return (lead.title || '').toLowerCase().includes(searchQuery) ||
           (lead.body || '').toLowerCase().includes(searchQuery) ||
           (lead.matched_keyword || '').toLowerCase().includes(searchQuery);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon">
          <i data-lucide="inbox" style="width:20px;height:20px;"></i>
        </div>
        <h4>No leads found</h4>
        <p>Run a scan to pull fresh job postings from Ashby, Greenhouse, Lever, YC and more.</p>
        <button type="button" class="btn-outline btn-sm" onclick="triggerScan()" style="margin-top:8px">
          <i data-lucide="refresh-cw" style="width:13px;height:13px;"></i>
          Run Scan
        </button>
      </div>
    `;
    refreshIcons();
    return;
  }

  container.innerHTML = filtered.map(lead => {
    const isApplied = lead.application_id && lead.application_id > 0;
    const sourceClass = getSourceClass(lead.source);

    return `
      <div class="lead-card${lead.reviewed ? ' reviewed' : ''}" id="lead-card-${lead.id}" role="listitem">
        <div class="lead-meta">
          <span class="src ${sourceClass}">${escapeHTML(lead.source)}</span>
          <span class="tag amber">
            <i data-lucide="key" style="width:9px;height:9px;"></i>
            ${escapeHTML(lead.matched_keyword)}
          </span>
          ${lead.subreddit ? `<span class="tag">r/${escapeHTML(lead.subreddit)}</span>` : ''}
          ${lead.reviewed ? `<span class="status reviewed"><i data-lucide="check" style="width:10px;height:10px;"></i> Reviewed</span>` : ''}
        </div>

        <h4 class="lead-title">${escapeHTML(lead.title)}</h4>

        ${lead.body ? `<div class="lead-snippet">${escapeHTML(lead.body.slice(0, 280))}${lead.body.length > 280 ? '…' : ''}</div>` : ''}

        <div class="lead-foot">
          <span class="lead-time">Found ${formatRelative(lead.found_at)}</span>
          <div class="lead-actions">
            <a href="${escapeHTML(lead.url)}" target="_blank" rel="noopener noreferrer" class="btn-ghost btn-sm" aria-label="View original post">
              <i data-lucide="external-link" style="width:12px;height:12px;"></i>
              View
            </a>
            ${isApplied ? `
              <span class="status applied">✓ Applied</span>
            ` : `
              <button type="button" class="btn-primary btn-sm" onclick="openConvertModal(${lead.id})" aria-label="Track as application">
                <i data-lucide="plus" style="width:12px;height:12px;"></i>
                Track
              </button>
            `}
            ${lead.reviewed ? `
              <button type="button" class="btn-ghost btn-sm" onclick="unmarkLeadReviewed(${lead.id})" aria-label="Unmark as reviewed">
                <i data-lucide="undo-2" style="width:12px;height:12px;"></i>
              </button>
            ` : `
              <button type="button" class="btn-outline btn-sm" onclick="markLeadReviewed(${lead.id})" aria-label="Mark as reviewed">
                <i data-lucide="check" style="width:12px;height:12px;color:var(--green-text)"></i>
                Reviewed
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');

  refreshIcons();
}

// Convert a Lead into an Application Modal
function openConvertModal(leadId) {
  const lead = leadsList.find(l => l.id === leadId);
  if (!lead) return;

  // Attempt to parse company & role from title
  let company = '';
  let role = lead.title;

  if (lead.title.includes(' at ')) {
    const parts = lead.title.split(' at ');
    role = parts[0].trim();
    company = parts[1].trim();
  } else if (lead.title.includes(' is hiring ')) {
    const parts = lead.title.split(' is hiring ');
    company = parts[0].trim();
    role = parts[1].trim();
  } else if (lead.title.includes(' - ')) {
    const parts = lead.title.split(' - ');
    company = parts[0].trim();
    role = parts.slice(1).join(' - ').trim();
  } else if (lead.title.includes(' | ')) {
    const parts = lead.title.split(' | ');
    company = parts[0].trim();
    role = parts.slice(1).join(' | ').trim();
  }

  // Clear modal and prefill
  document.getElementById('modal-app-title').textContent = 'Convert Lead to Application';
  document.getElementById('form-app-id').value = '';
  document.getElementById('form-lead-id').value = lead.id;
  document.getElementById('form-company').value = company || 'Target Company';
  document.getElementById('form-role').value = role || lead.title;
  document.getElementById('form-status').value = 'wishlist';
  document.getElementById('form-source').value = mapSourceToSelect(lead.source);
  document.getElementById('form-job-url').value = lead.url || '';
  document.getElementById('form-applied-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('form-salary').value = '';
  document.getElementById('form-location').value = '';
  document.getElementById('form-contact-name').value = '';
  document.getElementById('form-contact-email').value = '';
  document.getElementById('form-next-step').value = 'Submit Application';
  document.getElementById('form-next-step-date').value = '';
  document.getElementById('form-notes').value = `Matched keyword: ${lead.matched_keyword}\n\nSnippet:\n${(lead.body || '').slice(0, 500)}`;

  openApplicationModal();
}

function mapSourceToSelect(source) {
  const s = (source || '').toLowerCase();
  if (s.includes('ashby')) return 'ashby';
  if (s.includes('greenhouse')) return 'greenhouse';
  if (s.includes('lever')) return 'lever';
  if (s.includes('workable')) return 'workable';
  if (s.includes('google') || s.includes('dork')) return 'google-dork';
  if (s.includes('yc')) return 'yc';
  if (s.includes('hacker')) return 'hackernews';
  if (s.includes('wework')) return 'weworkremotely';
  if (s.includes('reddit')) return 'reddit';
  return 'manual';
}

// Mark a lead reviewed
async function markLeadReviewed(id) {
  const lead = leadsList.find(l => l.id === id);
  const reviewFilter = document.getElementById('lead-review-filter')?.value || 'false';

  // Optimistic UI update
  if (reviewFilter === 'false') {
    const cardEl = document.getElementById(`lead-card-${id}`);
    if (cardEl) {
      cardEl.classList.add('dismissing');
      setTimeout(() => {
        leadsList = leadsList.filter(l => l.id !== id);
        renderLeads();
      }, 240);
    } else {
      leadsList = leadsList.filter(l => l.id !== id);
      renderLeads();
    }
  } else if (lead) {
    lead.reviewed = true;
    renderLeads();
  }

  const countEl = document.getElementById('count-leads');
  if (countEl && parseInt(countEl.textContent, 10) > 0) {
    countEl.textContent = Math.max(0, parseInt(countEl.textContent, 10) - 1);
  }
  const unreviewedStatEl = document.getElementById('lead-stat-unreviewed');
  if (unreviewedStatEl && parseInt(unreviewedStatEl.textContent, 10) > 0) {
    unreviewedStatEl.textContent = Math.max(0, parseInt(unreviewedStatEl.textContent, 10) - 1);
  }

  try {
    await apiFetch(`/leads/${id}/review`, { method: 'POST' });
    showToast('Lead marked as reviewed', 'success');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
    loadLeads();
  }
}

// Unmark a lead as reviewed
async function unmarkLeadReviewed(id) {
  const lead = leadsList.find(l => l.id === id);
  const reviewFilter = document.getElementById('lead-review-filter')?.value || 'false';

  // Optimistic UI update
  if (reviewFilter === 'true') {
    const cardEl = document.getElementById(`lead-card-${id}`);
    if (cardEl) {
      cardEl.classList.add('dismissing');
      setTimeout(() => {
        leadsList = leadsList.filter(l => l.id !== id);
        renderLeads();
      }, 240);
    } else {
      leadsList = leadsList.filter(l => l.id !== id);
      renderLeads();
    }
  } else if (lead) {
    lead.reviewed = false;
    renderLeads();
  }

  const countEl = document.getElementById('count-leads');
  if (countEl && !isNaN(parseInt(countEl.textContent, 10))) {
    countEl.textContent = parseInt(countEl.textContent, 10) + 1;
  }
  const unreviewedStatEl = document.getElementById('lead-stat-unreviewed');
  if (unreviewedStatEl && !isNaN(parseInt(unreviewedStatEl.textContent, 10))) {
    unreviewedStatEl.textContent = parseInt(unreviewedStatEl.textContent, 10) + 1;
  }

  try {
    await apiFetch(`/leads/${id}/unreview`, { method: 'POST' });
    showToast('Lead unmarked as reviewed', 'success');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
    loadLeads();
  }
}

// Trigger Live Scan
async function triggerScan() {
  const btn = document.getElementById('btn-run-scan');
  const icon = document.getElementById('scan-icon');
  const text = document.getElementById('scan-text');

  btn.disabled = true;
  icon.innerHTML = '<i data-lucide="refresh-cw" style="width:13px;height:13px;" class="spin"></i>';
  text.textContent = 'Scanning…';
  refreshIcons();

  try {
    const res = await apiFetch('/scan', { method: 'POST' });
    const count = res?.new_leads || 0;
    showToast(`Scan complete: ${count} new lead(s) found!`, 'success');
    loadLeads();
    loadStats();
  } catch (err) {
    showToast(`Scan failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    icon.innerHTML = '<i data-lucide="refresh-cw" style="width:13px;height:13px;"></i>';
    text.textContent = 'Scan';
    refreshIcons();
  }
}

// Modal Handlers
function openApplicationModal() {
  const modal = document.getElementById('application-modal');
  if (modal) {
    modal.style.display = 'flex';
    refreshIcons();
  }
}

function closeApplicationModal() {
  const modal = document.getElementById('application-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function openAddApplicationModal(preselectedStatus) {
  document.getElementById('modal-app-title').textContent = 'Track New Application';
  document.getElementById('form-app-id').value = '';
  document.getElementById('form-lead-id').value = '';
  document.getElementById('app-form').reset();
  document.getElementById('form-status').value = preselectedStatus || 'applied';
  document.getElementById('form-applied-date').value = new Date().toISOString().split('T')[0];
  openApplicationModal();
}

function openEditApplicationModal(id) {
  const app = applicationsList.find(a => a.id === id);
  if (!app) return;

  document.getElementById('modal-app-title').textContent = `Edit ${app.company} Application`;
  document.getElementById('form-app-id').value = app.id;
  document.getElementById('form-lead-id').value = app.lead_id || '';
  document.getElementById('form-company').value = app.company || '';
  document.getElementById('form-role').value = app.role || '';
  document.getElementById('form-status').value = app.status || 'applied';
  document.getElementById('form-applied-date').value = app.applied_date || '';
  document.getElementById('form-source').value = mapSourceToSelect(app.source);
  document.getElementById('form-salary').value = app.salary || '';
  document.getElementById('form-location').value = app.location || '';
  document.getElementById('form-job-url').value = app.job_url || '';
  document.getElementById('form-contact-name').value = app.contact_name || '';
  document.getElementById('form-contact-email').value = app.contact_email || '';
  document.getElementById('form-next-step').value = app.next_step || '';
  document.getElementById('form-next-step-date').value = app.next_step_date || '';
  document.getElementById('form-notes').value = app.notes || '';

  openApplicationModal();
}

// Save (Create or Update) Application
async function handleSaveApplication(e) {
  e.preventDefault();

  const id = document.getElementById('form-app-id').value;
  const leadIdVal = document.getElementById('form-lead-id').value;
  const company = document.getElementById('form-company').value.trim();
  const role = document.getElementById('form-role').value.trim();
  const status = document.getElementById('form-status').value;
  const appliedDate = document.getElementById('form-applied-date').value;
  const source = document.getElementById('form-source').value;
  const salary = document.getElementById('form-salary').value.trim();
  const location = document.getElementById('form-location').value.trim();
  const jobUrl = document.getElementById('form-job-url').value.trim();
  const contactName = document.getElementById('form-contact-name').value.trim();
  const contactEmail = document.getElementById('form-contact-email').value.trim();
  const nextStep = document.getElementById('form-next-step').value.trim();
  const nextStepDate = document.getElementById('form-next-step-date').value;
  const notes = document.getElementById('form-notes').value.trim();

  const payload = {
    company,
    role,
    status,
    applied_date: appliedDate || null,
    source,
    salary,
    location,
    job_url: jobUrl,
    contact_name: contactName,
    contact_email: contactEmail,
    next_step: nextStep,
    next_step_date: nextStepDate || null,
    notes
  };

  if (leadIdVal) {
    payload.lead_id = parseInt(leadIdVal, 10);
  }

  const saveBtn = document.getElementById('btn-save-app');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    if (id) {
      // Update
      await apiFetch(`/applications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      showToast(`Updated ${company} application!`, 'success');
    } else {
      // Create
      await apiFetch('/applications', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast(`Added ${company} application!`, 'success');
    }

    closeApplicationModal();
    loadApplications();
    loadStats();
    if (currentTab === 'leads') loadLeads();
  } catch (err) {
    showToast(`Error saving: ${err.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Application';
  }
}

// Delete Application
async function confirmDeleteApplication(id) {
  const app = applicationsList.find(a => a.id === id);
  const name = app ? `${app.company} (${app.role})` : 'this application';
  if (!confirm(`Are you sure you want to delete ${name}?`)) return;

  try {
    await apiFetch(`/applications/${id}`, { method: 'DELETE' });
    showToast('Application deleted', 'success');
    loadApplications();
    loadStats();
  } catch (err) {
    showToast(`Error deleting: ${err.message}`, 'error');
  }
}

// Analytics View Rendering
function renderAnalytics() {
  const funnelContainer = document.getElementById('funnel-container');
  const remindersContainer = document.getElementById('upcoming-reminders-container');
  if (!funnelContainer || !remindersContainer) return;

  const total = applicationsList.length || 1;
  const stages = [
    { label: 'Wishlist', key: 'wishlist', color: '#fbbf24' },
    { label: 'Applied', key: 'applied', color: '#60a5fa' },
    { label: 'Screening', key: 'screening', color: '#22d3ee' },
    { label: 'Interviewing', key: 'interviewing', color: '#c084fc' },
    { label: 'Offer', key: 'offer', color: '#34d399' }
  ];

  funnelContainer.innerHTML = stages.map(s => {
    const count = applicationsList.filter(a => a.status === s.key).length;
    const pct = Math.round((count / total) * 100);
    return `
      <div style="display:flex;flex-direction:column;gap:5px" role="listitem">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:12.5px;font-weight:500;color:var(--t0)">${s.label}</span>
          <span style="font-size:11px;color:var(--t2);font-variant-numeric:tabular-nums;font-family:var(--mono)">${count} &nbsp;(${pct}%)</span>
        </div>
        <div style="height:5px;width:100%;background:var(--b1);border-radius:99px;overflow:hidden">
          <div style="width:${Math.max(pct, 2)}%;background:${s.color};height:100%;border-radius:99px;transition:width 0.4s"></div>
        </div>
      </div>
    `;
  }).join('');

  // Upcoming reminders
  const reminders = applicationsList.filter(a => a.next_step && a.status !== 'rejected' && a.status !== 'withdrawn');
  if (reminders.length === 0) {
    remindersContainer.innerHTML = `
      <div style="padding:20px;text-align:center;font-size:12px;color:var(--t2);border:1px dashed var(--b1);border-radius:8px">
        No upcoming action items.
      </div>
    `;
  } else {
    remindersContainer.innerHTML = reminders.map(a => `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:10px;background:var(--s2);border:1px solid var(--b0);border-radius:8px" role="listitem">
        <div style="display:flex;flex-direction:column;gap:3px;min-width:0">
          <div style="font-size:12.5px;font-weight:600;color:var(--t0)">${escapeHTML(a.company)} <span style="color:var(--t1);font-weight:400">— ${escapeHTML(a.role)}</span></div>
          <div style="font-size:12px;color:var(--t1)">${escapeHTML(a.next_step)}</div>
        </div>
        ${a.next_step_date ? `
          <span class="tag amber" style="flex-shrink:0;font-variant-numeric:tabular-nums">
            <i data-lucide="calendar" style="width:10px;height:10px;"></i>
            ${a.next_step_date}
          </span>
        ` : ''}
      </div>
    `).join('');
  }

  refreshIcons();
}

// Search and Filter Handlers
function handleAppSearch() {
  if (currentViewMode === 'kanban') renderKanban();
  else renderTable();
}

function handleAppFilter() {
  loadApplications();
}

function handleLeadSearch() {
  renderLeads();
}

// Settings Modal
function openSettingsModal() {
  document.getElementById('setting-api-url').value = getApiBase();
  const modal = document.getElementById('settings-modal');
  if (modal) {
    modal.style.display = 'flex';
    refreshIcons();
  }
}

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function saveSettings() {
  const url = document.getElementById('setting-api-url').value.trim();
  localStorage.setItem('lead_scanner_api_url', url);
  closeSettingsModal();
  showToast('Settings saved, reconnecting...', 'info');
  loadApplications();
  loadStats();
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-triangle' : 'info';
  const iconColor = type === 'success' ? 'var(--green-text)' : type === 'error' ? 'var(--red-text)' : 'var(--accent-text)';

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i data-lucide="${iconName}" style="width:14px;height:14px;color:${iconColor};flex-shrink:0"></i>
    <span>${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px) scale(0.97)';
    toast.style.transition = 'opacity 0.2s, transform 0.2s';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

// Helper formatting functions
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateBadge(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatRelative(dateVal) {
  if (!dateVal) return '';
  const date = new Date(dateVal);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Global Keyboard Shortcuts (Linear / Raycast style)
document.addEventListener('keydown', (e) => {
  // Ignore if user is already typing in an input
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
    if (e.key === 'Escape') {
      closeApplicationModal();
      closeSettingsModal();
    }
    return;
  }

  // Press "/" to focus search
  if (e.key === '/') {
    e.preventDefault();
    if (currentTab === 'applications') {
      const search = document.getElementById('app-search');
      if (search) search.focus();
    } else if (currentTab === 'leads') {
      const search = document.getElementById('lead-search');
      if (search) search.focus();
    }
  }

  // Press "Escape" to close modals
  if (e.key === 'Escape') {
    closeApplicationModal();
    closeSettingsModal();
  }

  // Press "c" to add application
  if (e.key === 'c' || e.key === 'C') {
    e.preventDefault();
    openAddApplicationModal();
  }
});

// Close modals when clicking backdrop
document.addEventListener('click', (e) => {
  if (e.target && e.target.classList.contains('modal-backdrop')) {
    closeApplicationModal();
    closeSettingsModal();
  }
});

// Initial Boot
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [statsRes, leadsRes] = await Promise.allSettled([
      apiFetch('/application-stats'),
      apiFetch('/leads?limit=1&reviewed=false')
    ]);

    let totalApps = 0;
    if (statsRes.status === 'fulfilled' && statsRes.value) {
      const stats = statsRes.value;
      totalApps = stats.total || 0;
      const statTotalEl = document.getElementById('stat-total');
      if (statTotalEl) statTotalEl.textContent = stats.total || 0;
      const statAppliedEl = document.getElementById('stat-applied');
      if (statAppliedEl) statAppliedEl.textContent = stats.applied || 0;
      const statInterviewingEl = document.getElementById('stat-interviewing');
      if (statInterviewingEl) statInterviewingEl.textContent = (stats.screening + stats.interviewing) || 0;
      const statOfferEl = document.getElementById('stat-offer');
      if (statOfferEl) statOfferEl.textContent = stats.offer || 0;
      const statRateEl = document.getElementById('stat-rate');
      if (statRateEl) statRateEl.textContent = `${Math.round(stats.response_rate || 0)}%`;
      const countAppsEl = document.getElementById('count-applications');
      if (countAppsEl) countAppsEl.textContent = totalApps;
      const trackedEl = document.getElementById('lead-stat-tracked');
      if (trackedEl) trackedEl.textContent = totalApps;
    }

    let totalUnreviewedLeads = 0;
    if (leadsRes.status === 'fulfilled' && leadsRes.value) {
      totalUnreviewedLeads = leadsRes.value.total !== undefined ? leadsRes.value.total : (leadsRes.value.leads?.length || 0);
      const countLeadsEl = document.getElementById('count-leads');
      if (countLeadsEl) countLeadsEl.textContent = totalUnreviewedLeads;
      const unreviewedStatEl = document.getElementById('lead-stat-unreviewed');
      if (unreviewedStatEl) unreviewedStatEl.textContent = totalUnreviewedLeads;
      const totalStatEl = document.getElementById('lead-stat-total');
      if (totalStatEl) totalStatEl.textContent = totalUnreviewedLeads;
    }

    const savedTab = localStorage.getItem('lead_scanner_active_tab');
    if (savedTab) {
      switchTab(savedTab);
    } else if (totalApps === 0 && totalUnreviewedLeads > 0) {
      // Default to leads queue when pipeline is empty!
      switchTab('leads');
    } else {
      switchTab('applications');
    }
  } catch (err) {
    console.error('Boot error:', err);
    switchTab('leads');
  }

  refreshIcons();
});
