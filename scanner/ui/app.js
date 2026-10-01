// Lead Scanner & Application Pipeline Manager Client Logic

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

// Navigation & Tab Switching
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.view-panel').forEach(p => p.style.display = 'none');

  const tabBtn = document.getElementById(`tab-${tab}`);
  if (tabBtn) tabBtn.classList.add('active');

  const panel = document.getElementById(`view-${tab}`);
  if (panel) panel.style.display = 'block';

  if (tab === 'applications') {
    loadApplications();
    loadStats();
  } else if (tab === 'leads') {
    loadLeads();
  } else if (tab === 'analytics') {
    loadStats();
    renderAnalytics();
  }
}

function setViewMode(mode) {
  currentViewMode = mode;
  document.querySelectorAll('.view-mode-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`mode-${mode}`).classList.add('active');

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

    document.getElementById('stat-total').textContent = stats.total || 0;
    document.getElementById('stat-applied').textContent = stats.applied || 0;
    document.getElementById('stat-interviewing').textContent = (stats.screening + stats.interviewing) || 0;
    document.getElementById('stat-offer').textContent = stats.offer || 0;
    document.getElementById('stat-rate').textContent = `${Math.round(stats.response_rate || 0)}%`;
    document.getElementById('count-applications').textContent = stats.total || 0;
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
    document.getElementById('count-applications').textContent = res?.total || applicationsList.length;

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
        <div class="empty-state" style="padding: 1.5rem 0.5rem;">
          <div style="font-size: 0.78rem; color: var(--text-dim);">No applications</div>
        </div>
      `;
      return;
    }

    container.innerHTML = grouped[col].map(app => createAppCardHTML(app)).join('');
  });
}

function createAppCardHTML(app) {
  const nextStepHTML = app.next_step ? `
    <div class="tag tag-next" title="Next step">
      <span>⏳ ${escapeHTML(app.next_step)}</span>
      ${app.next_step_date ? `<strong>${formatDateBadge(app.next_step_date)}</strong>` : ''}
    </div>
  ` : '';

  const salaryHTML = app.salary ? `
    <span class="tag tag-salary" title="Salary / Compensation">💰 ${escapeHTML(app.salary)}</span>
  ` : '';

  const locationHTML = app.location ? `
    <span class="tag tag-location" title="Location">📍 ${escapeHTML(app.location)}</span>
  ` : '';

  const appliedDateStr = app.applied_date ? `Applied ${formatRelative(app.applied_date)}` : 'Draft';

  return `
    <div class="app-card" id="card-${app.id}" draggable="true" ondragstart="handleDragStart(event, ${app.id})" ondragend="handleDragEnd(event)">
      <div class="app-card-header">
        <div class="app-company">${escapeHTML(app.company)}</div>
        <div class="app-card-actions">
          ${app.job_url ? `
            <a href="${escapeHTML(app.job_url)}" target="_blank" rel="noopener noreferrer" class="icon-btn" title="Open Job Posting">
              ↗
            </a>
          ` : ''}
          <button class="icon-btn" onclick="openEditApplicationModal(${app.id})" title="Edit Application">
            ✎
          </button>
          <button class="icon-btn icon-btn-danger" onclick="confirmDeleteApplication(${app.id})" title="Delete Application">
            ✕
          </button>
        </div>
      </div>

      <div class="app-role">${escapeHTML(app.role)}</div>

      <div class="app-meta-tags">
        <span class="tag tag-source">${escapeHTML(app.source || 'manual')}</span>
        ${salaryHTML}
        ${locationHTML}
        ${nextStepHTML}
      </div>

      <div class="app-card-footer">
        <span>${appliedDateStr}</span>
        <select class="select-filter btn-sm" style="padding: 0.15rem 0.4rem; font-size: 0.72rem; background: var(--bg-tertiary);" onchange="quickUpdateStatus(${app.id}, this.value)">
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

  if (applicationsList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <h4>No applications tracked yet</h4>
            <p>Click "+ Add Application" or convert leads from the Leads Queue.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = applicationsList.map(app => {
    return `
      <tr>
        <td>
          <div style="font-weight: 700;">${escapeHTML(app.company)}</div>
          <div style="color: var(--text-muted); font-size: 0.8rem;">${escapeHTML(app.role)}</div>
        </td>
        <td>
          <span class="status-badge ${app.status}">${escapeHTML(app.status)}</span>
        </td>
        <td>
          <span class="tag tag-source">${escapeHTML(app.source || 'manual')}</span>
        </td>
        <td>${app.applied_date || '<span style="color: var(--text-dim);">-</span>'}</td>
        <td>
          <div>${app.salary ? escapeHTML(app.salary) : ''}</div>
          <div style="color: var(--text-dim); font-size: 0.75rem;">${app.location ? escapeHTML(app.location) : ''}</div>
        </td>
        <td>
          <div style="font-size: 0.82rem;">${app.next_step ? escapeHTML(app.next_step) : '<span style="color: var(--text-dim);">-</span>'}</div>
          ${app.next_step_date ? `<div style="font-size: 0.72rem; color: var(--accent-amber);">📅 ${app.next_step_date}</div>` : ''}
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 0.35rem;">
            ${app.job_url ? `
              <a href="${escapeHTML(app.job_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" title="View Job">
                ↗
              </a>
            ` : ''}
            <button class="btn btn-secondary btn-sm" onclick="openEditApplicationModal(${app.id})">Edit</button>
            <button class="btn btn-secondary btn-sm icon-btn-danger" onclick="confirmDeleteApplication(${app.id})">✕</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Drag & Drop Handlers
function handleDragStart(e, id) {
  draggedAppId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
  setTimeout(() => {
    const el = document.getElementById(`card-${id}`);
    if (el) el.classList.add('is-dragging');
  }, 0);
}

function handleDragEnd(e) {
  const el = document.getElementById(`card-${draggedAppId}`);
  if (el) el.classList.remove('is-dragging');
  document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
  draggedAppId = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const column = e.currentTarget;
  if (!column.classList.contains('drag-over')) {
    column.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e, targetStatus) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const idStr = e.dataTransfer.getData('text/plain') || draggedAppId;
  const id = parseInt(idStr, 10);
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
    showToast(`Failed to update status: ${err.message}`, 'error');
    loadApplications();
  }
}

// Quick status change from card dropdown
async function quickUpdateStatus(id, newStatus) {
  const app = applicationsList.find(a => a.id === id);
  if (app) app.status = newStatus;
  renderKanban();

  try {
    await apiFetch(`/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    showToast(`Updated status to ${newStatus}`, 'success');
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
    if (countEl) {
      countEl.textContent = res?.total !== undefined ? res.total : leadsList.length;
    }
    renderLeads();
  } catch (err) {
    showToast(`Could not load leads: ${err.message}`, 'error');
  }
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
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">🎯</div>
        <h4>No matching leads found</h4>
        <p>Click "Run Scan" in the header to search job boards and Google Dork for new postings.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(lead => {
    const isApplied = lead.application_id && lead.application_id > 0;
    return `
      <div class="lead-card ${lead.reviewed ? 'reviewed' : ''}" id="lead-card-${lead.id}">
        <div>
          <div class="lead-header">
            <h4 class="lead-title">${escapeHTML(lead.title)}</h4>
            ${lead.reviewed ? `
              <span class="status-badge reviewed" title="This lead has been reviewed">
                ✓ Reviewed
              </span>
            ` : ''}
          </div>

          <div class="lead-badges" style="margin: 0.6rem 0;">
            <span class="tag tag-source">${escapeHTML(lead.source)}</span>
            <span class="tag tag-salary">🔑 ${escapeHTML(lead.matched_keyword)}</span>
            ${lead.subreddit ? `<span class="tag tag-location">r/${escapeHTML(lead.subreddit)}</span>` : ''}
            ${lead.author ? `<span class="tag tag-source">👤 ${escapeHTML(lead.author)}</span>` : ''}
          </div>

          ${lead.body ? `
            <div class="lead-body-snippet">${escapeHTML(lead.body.slice(0, 320))}${lead.body.length > 320 ? '...' : ''}</div>
          ` : ''}
        </div>

        <div class="lead-footer">
          <span>Found ${formatRelative(lead.found_at)}</span>
          <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
            <a href="${escapeHTML(lead.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
              View Post ↗
            </a>

            ${isApplied ? `
              <span class="status-badge applied">✓ Applied</span>
            ` : `
              <button class="btn btn-primary btn-sm" onclick="openConvertModal(${lead.id})">
                + Track / Apply
              </button>
            `}

            ${lead.reviewed ? `
              <button class="btn btn-secondary btn-sm" onclick="unmarkLeadReviewed(${lead.id})" title="Move back to unreviewed queue">
                ↩ Unmark
              </button>
            ` : `
              <button class="btn btn-secondary btn-sm" onclick="markLeadReviewed(${lead.id})" title="Mark as reviewed">
                ✓ Mark Reviewed
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');
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
      cardEl.style.transition = 'all 0.2s ease';
      cardEl.style.opacity = '0';
      cardEl.style.transform = 'scale(0.96)';
      setTimeout(() => {
        leadsList = leadsList.filter(l => l.id !== id);
        renderLeads();
      }, 200);
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
      cardEl.style.transition = 'all 0.2s ease';
      cardEl.style.opacity = '0';
      cardEl.style.transform = 'scale(0.96)';
      setTimeout(() => {
        leadsList = leadsList.filter(l => l.id !== id);
        renderLeads();
      }, 200);
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
  icon.innerHTML = '<span class="spinner"></span>';
  text.textContent = 'Scanning...';

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
    icon.innerHTML = '⚡';
    text.textContent = 'Run Scan';
  }
}

// Modal Handlers
function openApplicationModal() {
  document.getElementById('application-modal').classList.add('active');
}

function closeApplicationModal() {
  document.getElementById('application-modal').classList.remove('active');
}

function openAddApplicationModal() {
  document.getElementById('modal-app-title').textContent = 'Track New Application';
  document.getElementById('form-app-id').value = '';
  document.getElementById('form-lead-id').value = '';
  document.getElementById('app-form').reset();
  document.getElementById('form-status').value = 'applied';
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
      showToast(`Application tracked for ${company}!`, 'success');
    }

    closeApplicationModal();
    loadApplications();
    loadStats();
    if (currentTab === 'leads') loadLeads();
  } catch (err) {
    showToast(`Error saving application: ${err.message}`, 'error');
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
    showToast('Application deleted', 'info');
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
    { label: 'Wishlist', key: 'wishlist', color: 'var(--status-wishlist)' },
    { label: 'Applied', key: 'applied', color: 'var(--status-applied)' },
    { label: 'Screening', key: 'screening', color: 'var(--status-screening)' },
    { label: 'Interviewing', key: 'interviewing', color: 'var(--status-interviewing)' },
    { label: 'Offer', key: 'offer', color: 'var(--status-offer)' }
  ];

  funnelContainer.innerHTML = stages.map(s => {
    const count = applicationsList.filter(a => a.status === s.key).length;
    const pct = Math.round((count / total) * 100);
    return `
      <div>
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.25rem;">
          <span style="font-weight: 600;">${s.label}</span>
          <span style="color: var(--text-muted);">${count} (${pct}%)</span>
        </div>
        <div style="height: 10px; background: var(--bg-tertiary); border-radius: var(--radius-full); overflow: hidden;">
          <div style="width: ${Math.max(pct, 2)}%; height: 100%; background: ${s.color}; border-radius: var(--radius-full);"></div>
        </div>
      </div>
    `;
  }).join('');

  // Upcoming reminders
  const reminders = applicationsList.filter(a => a.next_step && a.status !== 'rejected' && a.status !== 'withdrawn');
  if (reminders.length === 0) {
    remindersContainer.innerHTML = `
      <div class="empty-state" style="padding: 1.5rem 0.5rem;">
        <div style="font-size: 0.85rem; color: var(--text-dim);">No upcoming next steps set</div>
      </div>
    `;
  } else {
    remindersContainer.innerHTML = reminders.map(a => `
      <div style="background: var(--bg-tertiary); padding: 0.75rem 1rem; border-radius: var(--radius-md); border-left: 3px solid var(--accent-amber);">
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 700;">
          <span>${escapeHTML(a.company)} — ${escapeHTML(a.role)}</span>
          ${a.next_step_date ? `<span style="color: var(--accent-amber);">📅 ${a.next_step_date}</span>` : ''}
        </div>
        <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.25rem;">
          ${escapeHTML(a.next_step)}
        </div>
      </div>
    `).join('');
  }
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
  document.getElementById('settings-modal').classList.add('active');
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('active');
}

function saveSettings() {
  const url = document.getElementById('setting-api-url').value.trim();
  localStorage.setItem('lead_scanner_api_url', url);
  closeSettingsModal();
  showToast('Settings saved, reloading data...', 'info');
  loadApplications();
  loadStats();
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '⚠️' : 'ℹ️'}</span>
    <span>${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
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

// Initial Boot
document.addEventListener('DOMContentLoaded', () => {
  loadApplications();
  loadStats();
});
