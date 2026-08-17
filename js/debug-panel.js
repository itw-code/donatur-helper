// Localhost-Only Debug & Observability HUD for Multi-Role Performance Metrics

import { getAllRoleMetrics, checkPerformanceBudget, ROLE_PERFORMANCE_BUDGETS } from './perf.js';
import { escapeHtml } from './utils.js';

export function isLocalhostDebugEnabled(loc, explicitDebugFlag) {
  if (explicitDebugFlag === true) return true;
  if (typeof window !== 'undefined' && window._DH_DEBUG === true) return true;
  const targetLoc = loc || (typeof window !== 'undefined' ? window.location : null);
  if (!targetLoc || !targetLoc.hostname) return false;
  const h = targetLoc.hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost');
}

export function renderDebugPanelHtml() {
  const metrics = getAllRoleMetrics();
  const roles = Object.keys(ROLE_PERFORMANCE_BUDGETS);

  let html = '<div class="dh-debug-header">';
  html += '<div>';
  html += '<span class="dh-debug-badge">DEBUG HUD</span> ';
  html += '<strong>Observabilitas Kinerja (Localhost)</strong>';
  html += '</div>';
  html += '<button type="button" class="dh-debug-close" onclick="toggleDebugPanel(false)" aria-label="Tutup panel debug">&times;</button>';
  html += '</div>';

  html += '<div class="dh-debug-body">';
  if (Object.keys(metrics).length === 0) {
    html += '<p class="dh-debug-empty">Belum ada metrik kinerja yang terekam. Navigasikan aplikasi untuk mulai merekam.</p>';
  } else {
    roles.forEach(role => {
      const m = metrics[role];
      if (!m) return;
      const budget = checkPerformanceBudget(role, m.totalDurationMs);
      const isOver = budget.exceeded;
      const statusClass = isOver ? 'dh-budget-exceeded' : 'dh-budget-ok';
      const statusLabel = isOver ? `+${budget.overMs}ms over budget` : 'Dalam budget';

      html += `<div class="dh-debug-card ${statusClass}">`;
      html += '<div class="dh-debug-card-header">';
      html += `<strong>POV: ${escapeHtml(role)}</strong>`;
      html += `<span class="dh-budget-tag ${isOver ? 'danger' : 'success'}">${statusLabel} (Max ${budget.budgetMs}ms)</span>`;
      html += '</div>';

      html += '<div class="dh-debug-metrics-grid">';
      html += `<div><span class="dh-metric-label">Total:</span> <strong>${m.totalDurationMs} ms</strong></div>`;
      html += `<div><span class="dh-metric-label">Fetch:</span> <span>${m.fetchDurationMs} ms</span></div>`;
      html += `<div><span class="dh-metric-label">Render:</span> <span>${m.renderDurationMs} ms</span></div>`;
      html += `<div><span class="dh-metric-label">Volume:</span> <span>${m.recordCount} item</span></div>`;
      html += '</div>';

      if (m.errorCount > 0 || m.timeoutCount > 0) {
        html += '<div class="dh-debug-card-warnings">';
        if (m.timeoutCount > 0) html += `<span class="badge danger">${m.timeoutCount} timeout</span> `;
        if (m.errorCount > 0) html += `<span class="badge warning">${m.errorCount} error</span>`;
        html += '</div>';
      }

      html += '</div>';
    });
  }
  html += '</div>';

  html += '<div class="dh-debug-footer">';
  html += '<button type="button" class="btn secondary btn-auto" onclick="refreshDebugPanelUI()" style="padding:4px 8px;font-size:11px;">Refresh Metrik</button>';
  html += '</div>';

  return html;
}

export function toggleDebugPanel(forceState) {
  const panel = document.getElementById('dh-debug-panel');
  if (!panel) return;
  if (typeof forceState === 'boolean') {
    panel.classList.toggle('dh-debug-hidden', !forceState);
  } else {
    panel.classList.toggle('dh-debug-hidden');
  }
}

export function refreshDebugPanelUI() {
  const contentEl = document.getElementById('dh-debug-content');
  if (contentEl) {
    contentEl.innerHTML = renderDebugPanelHtml();
  }
}

export function mountDebugPanel() {
  if (typeof document === 'undefined' || !isLocalhostDebugEnabled()) return;
  if (document.getElementById('dh-debug-hud')) return;

  const container = document.createElement('aside');
  container.id = 'dh-debug-hud';
  container.className = 'dh-debug-hud-container';
  container.setAttribute('aria-label', 'Panel Observabilitas Kinerja Dev');

  container.innerHTML = `
    <button type="button" id="dh-debug-toggle-btn" class="dh-debug-toggle-btn" onclick="toggleDebugPanel()" aria-label="Buka/tutup HUD kinerja">
      ⚡ Perf
    </button>
    <div id="dh-debug-panel" class="dh-debug-panel dh-debug-hidden">
      <div id="dh-debug-content">${renderDebugPanelHtml()}</div>
    </div>
  `;

  document.body.appendChild(container);
}
