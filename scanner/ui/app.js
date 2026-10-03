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
    document.getElementById('kanban-view').style.display = 'grid';
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
        <div class="kanban-empty-dropzone" onclick="openAddApplicationModal('${col}')" title="Click to add application to ${col}">
          <i data-lucide="plus" class="w-3.5 h-3.5 opacity-60"></i>
          <span>Add ${col}</span>
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
    <div class="tag-pill text-amber-300 border-amber-500/25 bg-amber-500/10" title="Next step">
      <i data-lucide="clock" class="w-3 h-3 text-amber-400"></i>
      <span class="truncate max-w-[110px]">${escapeHTML(app.next_step)}</span>
      ${app.next_step_date ? `<strong class="text-[10px] opacity-80">${formatDateBadge(app.next_step_date)}</strong>` : ''}
    </div>
  ` : '';

  const salaryHTML = app.salary ? `
    <span class="tag-pill text-emerald-300 border-emerald-500/25 bg-emerald-500/10" title="Salary / Compensation">
      <i data-lucide="dollar-sign" class="w-3 h-3 text-emerald-400"></i>
      <span>${escapeHTML(app.salary)}</span>
    </span>
  ` : '';

  const locationHTML = app.location ? `
    <span class="tag-pill" title="Location">
      <i data-lucide="map-pin" class="w-3 h-3 text-muted-foreground"></i>
      <span class="truncate max-w-[90px]">${escapeHTML(app.location)}</span>
    </span>
  ` : '';

  const appliedDateStr = app.applied_date ? `${formatRelative(app.applied_date)}` : 'Draft';

  return `
    <div class="app-card" id="card-${app.id}" draggable="true" ondragstart="handleDragStart(event, ${app.id})" ondragend="handleDragEnd(event)">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-6 h-6 rounded bg-muted/90 border border-border text-foreground font-semibold text-[11px] flex items-center justify-center shrink-0">
            ${companyInitial}
          </div>
          <div class="font-semibold text-xs text-foreground tracking-tight truncate">${escapeHTML(app.company)}</div>
        </div>
        
        <div class="flex items-center gap-1 shrink-0">
          ${app.job_url ? `
            <a href="${escapeHTML(app.job_url)}" target="_blank" rel="noopener noreferrer" class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors" title="Open Job Posting" aria-label="Open Job Posting">
              <i data-lucide="external-link" class="w-3 h-3"></i>
            </a>
          ` : ''}
          <button type="button" class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors" onclick="openEditApplicationModal(${app.id})" title="Edit Application" aria-label="Edit Application">
            <i data-lucide="edit-3" class="w-3 h-3"></i>
          </button>
          <button type="button" class="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" onclick="confirmDeleteApplication(${app.id})" title="Delete Application" aria-label="Delete Application">
            <i data-lucide="trash-2" class="w-3 h-3"></i>
          </button>
        </div>
      </div>

      <div class="text-xs font-medium text-muted-foreground line-clamp-1">${escapeHTML(app.role)}</div>

      <div class="flex flex-wrap gap-1.5 items-center">
        <span class="source-pill ${sourceClass}">${escapeHTML(app.source || 'manual')}</span>
        ${salaryHTML}
        ${locationHTML}
        ${nextStepHTML}
      </div>

      <div class="flex items-center justify-between pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
        <span>${appliedDateStr}</span>
        <select class="input h-6 text-[11px] py-0 px-2 max-w-[105px] bg-muted/70 border-border" onchange="quickUpdateStatus(${app.id}, this.value)" aria-label="Update Stage">
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
        <td colspan="7" class="py-12 text-center text-muted-foreground">
          <div class="flex flex-col items-center justify-center gap-2">
            <i data-lucide="inbox" class="w-8 h-8 opacity-40"></i>
            <span class="text-xs">No applications match your filter criteria.</span>
          </div>
        </td>
      </tr>
    `;
    refreshIcons();
    return;
  }

  tbody.innerHTML = filtered.map(app => {
    const sourceClass = getSourceClass(app.source);
    return `
      <tr class="hover:bg-muted/30 transition-colors">
        <td class="py-3 px-4">
          <div class="font-semibold text-foreground">${escapeHTML(app.company)}</div>
          <div class="text-muted-foreground text-[11px]">${escapeHTML(app.role)}</div>
        </td>
        <td class="py-3 px-4">
          <span class="status-pill ${app.status}">${escapeHTML(app.status)}</span>
        </td>
        <td class="py-3 px-4">
          <span class="source-pill ${sourceClass}">${escapeHTML(app.source || 'manual')}</span>
        </td>
        <td class="py-3 px-4 text-muted-foreground tabular-nums">
          ${app.applied_date ? app.applied_date : '<span class="opacity-40">—</span>'}
        </td>
        <td class="py-3 px-4 text-muted-foreground">
          <div>${app.salary ? `💰 ${escapeHTML(app.salary)}` : ''}</div>
          <div class="text-[11px] opacity-75">${app.location ? `📍 ${escapeHTML(app.location)}` : '—'}</div>
        </td>
        <td class="py-3 px-4">
          ${app.next_step ? `
            <div class="text-foreground text-[11px] font-medium">${escapeHTML(app.next_step)}</div>
            ${app.next_step_date ? `<div class="text-amber-400 text-[10px] tabular-nums">📅 ${app.next_step_date}</div>` : ''}
          ` : '<span class="text-muted-foreground opacity-40">—</span>'}
        </td>
        <td class="py-3 px-4 text-right">
          <div class="flex items-center justify-end gap-1">
            ${app.job_url ? `
              <a href="${escapeHTML(app.job_url)}" target="_blank" rel="noopener noreferrer" class="btn" data-variant="ghost" data-size="icon" title="Open Job Posting" aria-label="Open Job Posting">
                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              </a>
            ` : ''}
            <button type="button" class="btn" data-variant="ghost" data-size="icon" onclick="openEditApplicationModal(${app.id})" title="Edit" aria-label="Edit">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
            <button type="button" class="btn text-destructive hover:bg-destructive/10" data-variant="ghost" data-size="icon" onclick="confirmDeleteApplication(${app.id})" title="Delete" aria-label="Delete">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
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
  document.querySelectorAll('.kanban-col').forEach(col => col.classList.remove('drag-over'));
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
  document.querySelectorAll('#source-filter-chips .source-chip').forEach(btn => {
    if (btn.getAttribute('data-source') === source) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
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
      <div class="col-span-full py-16 flex flex-col items-center justify-center text-center p-6 border border-dashed border-border rounded-xl bg-card/40">
        <div class="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
          <i data-lucide="sparkles" class="w-6 h-6"></i>
        </div>
        <h4 class="text-sm font-semibold text-foreground">No matching leads found</h4>
        <p class="text-xs text-muted-foreground mt-1 max-w-sm">Click "Run Scan" in the header to search job boards and Google Dork for new tech postings.</p>
        <button type="button" class="btn mt-4" data-variant="outline" data-size="sm" onclick="triggerScan()">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
          <span>Run Scan Now</span>
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
      <div class="lead-card ${lead.reviewed ? 'reviewed' : ''}" id="lead-card-${lead.id}">
        <div class="flex flex-col gap-2.5">
          <div class="flex items-start justify-between gap-3">
            <h4 class="text-xs font-semibold text-foreground leading-snug line-clamp-2">${escapeHTML(lead.title)}</h4>
            ${lead.reviewed ? `
              <span class="status-pill reviewed shrink-0" title="This lead has been reviewed">
                <i data-lucide="check" class="w-3 h-3"></i>
                <span>Reviewed</span>
              </span>
            ` : ''}
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <span class="source-pill ${sourceClass}">${escapeHTML(lead.source)}</span>
            <span class="tag-pill text-amber-300 border-amber-500/20 bg-amber-500/10">
              <i data-lucide="key" class="w-2.5 h-2.5 text-amber-400"></i>
              <span>${escapeHTML(lead.matched_keyword)}</span>
            </span>
            ${lead.subreddit ? `<span class="tag-pill text-indigo-300">r/${escapeHTML(lead.subreddit)}</span>` : ''}
            ${lead.author ? `<span class="tag-pill text-muted-foreground">👤 ${escapeHTML(lead.author)}</span>` : ''}
          </div>

          ${lead.body ? `
            <div class="lead-snippet">${escapeHTML(lead.body.slice(0, 320))}${lead.body.length > 320 ? '...' : ''}</div>
          ` : ''}
        </div>

        <div class="flex items-center justify-between pt-3 border-t border-border/50 text-[11px] text-muted-foreground gap-2">
          <span class="tabular-nums">Found ${formatRelative(lead.found_at)}</span>
          <div class="flex items-center gap-1.5 flex-wrap justify-end">
            <a href="${escapeHTML(lead.url)}" target="_blank" rel="noopener noreferrer" class="btn" data-variant="outline" data-size="sm" aria-label="View original job post">
              <span>View Post</span>
              <i data-lucide="external-link" class="w-3 h-3"></i>
            </a>

            ${isApplied ? `
              <span class="status-pill applied">✓ Applied</span>
            ` : `
              <button type="button" class="btn" data-variant="default" data-size="sm" onclick="openConvertModal(${lead.id})" aria-label="Track as application">
                <i data-lucide="plus" class="w-3 h-3"></i>
                <span>Track</span>
              </button>
            `}

            ${lead.reviewed ? `
              <button type="button" class="btn" data-variant="secondary" data-size="sm" onclick="unmarkLeadReviewed(${lead.id})" title="Move back to unreviewed queue" aria-label="Unmark as reviewed">
                <i data-lucide="undo-2" class="w-3 h-3"></i>
                <span>Unmark</span>
              </button>
            ` : `
              <button type="button" class="btn" data-variant="secondary" data-size="sm" onclick="markLeadReviewed(${lead.id})" title="Mark as reviewed" aria-label="Mark as reviewed">
                <i data-lucide="check" class="w-3 h-3 text-emerald-400"></i>
                <span>Reviewed</span>
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
      cardEl.classList.add('lead-card-dismissing');
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
      cardEl.classList.add('lead-card-dismissing');
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
  icon.innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5 animate-spin-icon"></i>';
  text.textContent = 'Scanning...';
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
    icon.innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>';
    text.textContent = 'Run Scan';
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
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between text-xs">
          <span class="font-medium text-foreground">${s.label}</span>
          <span class="text-muted-foreground font-mono tabular-nums">${count} (${pct}%)</span>
        </div>
        <div class="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
          <div style="width: ${Math.max(pct, 2)}%; background-color: ${s.color};" class="h-full rounded-full transition-all duration-300"></div>
        </div>
      </div>
    `;
  }).join('');

  // Upcoming reminders
  const reminders = applicationsList.filter(a => a.next_step && a.status !== 'rejected' && a.status !== 'withdrawn');
  if (reminders.length === 0) {
    remindersContainer.innerHTML = `
      <div class="p-6 text-center text-xs text-muted-foreground/70 border border-dashed border-border/80 rounded-lg">
        No upcoming action items or interview milestones.
      </div>
    `;
  } else {
    remindersContainer.innerHTML = reminders.map(a => `
      <div class="p-3 rounded-lg bg-card/60 border border-border flex items-start justify-between gap-3">
        <div class="flex flex-col gap-1">
          <div class="text-xs font-semibold text-foreground">${escapeHTML(a.company)} — <span class="text-muted-foreground font-normal">${escapeHTML(a.role)}</span></div>
          <div class="text-xs text-muted-foreground">${escapeHTML(a.next_step)}</div>
        </div>
        ${a.next_step_date ? `
          <span class="tag-pill text-amber-300 border-amber-500/20 bg-amber-500/10 shrink-0 tabular-nums">
            <i data-lucide="calendar" class="w-3 h-3 text-amber-400"></i>
            <span>${a.next_step_date}</span>
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
  const iconColor = type === 'success' ? 'text-emerald-400' : type === 'error' ? 'text-rose-400' : 'text-primary';

  const toast = document.createElement('div');
  toast.className = `toast-msg ${type}`;
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 ${iconColor} shrink-0"></i>
    <span class="text-xs leading-normal">${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
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
