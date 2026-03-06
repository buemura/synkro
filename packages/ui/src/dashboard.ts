export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Orko Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0a0a0f;
      --surface: #12121a;
      --surface-hover: #1a1a25;
      --border: #1e1e2e;
      --text: #e2e2e8;
      --text-muted: #6e6e82;
      --accent: #7c6af6;
      --accent-dim: #7c6af620;
      --success: #34d399;
      --success-dim: #34d39920;
      --danger: #f87171;
      --danger-dim: #f8717120;
      --warning: #fbbf24;
      --warning-dim: #fbbf2420;
      --radius: 10px;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      min-height: 100vh;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 24px;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 40px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-icon {
      width: 36px;
      height: 36px;
      background: var(--accent);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 16px;
      color: #fff;
    }

    .logo h1 {
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.5px;
    }

    .logo h1 span { color: var(--text-muted); font-weight: 400; font-size: 14px; margin-left: 8px; }

    .btn {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      transition: background 0.15s;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .btn:hover { background: var(--surface-hover); }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 40px;
    }

    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
    }

    .stat-card .label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-card .value { font-size: 32px; font-weight: 700; margin-top: 4px; }
    .stat-card.accent .value { color: var(--accent); }
    .stat-card.success .value { color: var(--success); }
    .stat-card.danger .value { color: var(--danger); }

    .section { margin-bottom: 40px; }

    .section-header {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-header .count {
      background: var(--accent-dim);
      color: var(--accent);
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 99px;
      font-weight: 500;
    }

    /* Events Table */
    .events-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }

    .events-table th {
      text-align: left;
      padding: 12px 16px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      background: var(--surface);
    }

    .events-table td {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }

    .events-table tr:last-child td { border-bottom: none; }
    .events-table tr.clickable { cursor: pointer; transition: background 0.15s; }
    .events-table tr.clickable:hover { background: var(--surface-hover); }

    .event-type {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 13px;
      color: var(--accent);
    }

    .badge {
      display: inline-block;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 99px;
      font-weight: 500;
    }

    .badge-retry {
      background: var(--warning-dim);
      color: var(--warning);
    }

    .badge-none {
      background: var(--border);
      color: var(--text-muted);
    }

    /* Workflow Cards */
    .workflow-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      margin-bottom: 16px;
    }

    .workflow-name {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 20px;
      color: var(--accent);
    }

    .workflow-callbacks {
      display: flex;
      gap: 12px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      flex-wrap: wrap;
    }

    .callback-tag {
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 6px;
      font-family: 'SF Mono', 'Fira Code', monospace;
    }

    .callback-complete { background: var(--accent-dim); color: var(--accent); }
    .callback-success { background: var(--success-dim); color: var(--success); }
    .callback-failure { background: var(--danger-dim); color: var(--danger); }

    /* Workflow Flow Diagram */
    .workflow-flow {
      position: relative;
      overflow-x: auto;
      padding: 8px 0;
    }

    .workflow-flow svg {
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
    }

    .flow-grid {
      display: grid;
      grid-auto-flow: column;
      grid-template-rows: auto auto auto;
      gap: 16px 40px;
      align-items: center;
      position: relative;
    }

    .flow-node {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      min-width: 140px;
      text-align: center;
    }

    .flow-node.branch-success { border-color: var(--success); border-width: 1px; }
    .flow-node.branch-failure { border-color: var(--danger); border-width: 1px; }

    .flow-node .node-type {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 12px;
      font-weight: 500;
    }

    .flow-node .node-label {
      font-size: 10px;
      margin-top: 4px;
    }

    .flow-node .node-label.label-success { color: var(--success); }
    .flow-node .node-label.label-failure { color: var(--danger); }

    .flow-spacer {
      visibility: hidden;
      min-width: 140px;
      padding: 12px 16px;
    }

    .empty-state {
      text-align: center;
      padding: 48px;
      color: var(--text-muted);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }

    .empty-state p { font-size: 14px; }

    .loading {
      text-align: center;
      padding: 80px;
      color: var(--text-muted);
    }

    /* Event Detail */
    .back-link {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 13px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 24px;
      cursor: pointer;
      transition: color 0.15s;
    }

    .back-link:hover { color: var(--text); }

    .detail-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
    }

    .detail-title {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 20px;
      font-weight: 600;
      color: var(--accent);
    }

    .detail-badge { margin-left: 12px; }

    /* Pagination */
    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 var(--radius) var(--radius);
      font-size: 13px;
      color: var(--text-muted);
    }

    .pagination-buttons {
      display: flex;
      gap: 8px;
    }

    .pagination-btn {
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 4px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.15s;
    }

    .pagination-btn:hover:not(:disabled) { background: var(--surface-hover); }
    .pagination-btn:disabled { opacity: 0.3; cursor: default; }

    .events-table.has-pagination { border-radius: var(--radius) var(--radius) 0 0; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">
        <div class="logo-icon">O</div>
        <h1>Orko <span>Dashboard</span></h1>
      </div>
      <button class="btn" id="header-action">Refresh</button>
    </header>
    <div id="content">
      <div class="loading">Loading...</div>
    </div>
  </div>

  <script>
    function getBase() {
      const p = window.location.pathname;
      return p.endsWith('/') ? p : p + '/';
    }

    let cachedIntrospection = null;
    var PAGE_SIZE = 5;
    var eventsPage = 0;
    var workflowsPage = 0;

    async function fetchIntrospection() {
      const res = await fetch(getBase() + 'api/introspection');
      cachedIntrospection = await res.json();
      return cachedIntrospection;
    }

    async function fetchEventMetrics(eventType) {
      const res = await fetch(getBase() + 'api/events/' + encodeURIComponent(eventType));
      return await res.json();
    }

    function route() {
      const hash = window.location.hash || '#/';
      const eventMatch = hash.match(/^#\\/events\\/(.+)$/);
      const workflowMatch = hash.match(/^#\\/workflows\\/(.+)$/);

      if (eventMatch) {
        const eventType = decodeURIComponent(eventMatch[1]);
        showEventDetail(eventType);
      } else if (workflowMatch) {
        const workflowName = decodeURIComponent(workflowMatch[1]);
        showWorkflowDetail(workflowName);
      } else {
        showDashboard();
      }
    }

    async function showDashboard() {
      const btn = document.getElementById('header-action');
      btn.textContent = 'Refresh';
      btn.onclick = function() { eventsPage = 0; workflowsPage = 0; showDashboard(); };

      try {
        const data = await fetchIntrospection();
        renderDashboard(data);
      } catch (err) {
        document.getElementById('content').innerHTML =
          '<div class="empty-state"><p>Failed to load data. Check the console for errors.</p></div>';
        console.error('Orko Dashboard: Failed to fetch introspection data', err);
      }
    }

    async function showEventDetail(eventType) {
      const btn = document.getElementById('header-action');
      btn.textContent = 'Refresh';
      btn.onclick = () => showEventDetail(eventType);

      document.getElementById('content').innerHTML = '<div class="loading">Loading...</div>';

      try {
        if (!cachedIntrospection) await fetchIntrospection();
        const eventInfo = cachedIntrospection.events.find(e => e.type === eventType);
        const metrics = await fetchEventMetrics(eventType);
        renderEventDetail(eventType, eventInfo, metrics);
      } catch (err) {
        document.getElementById('content').innerHTML =
          '<div class="empty-state"><p>Failed to load event data.</p></div>';
        console.error('Orko Dashboard: Failed to fetch event metrics', err);
      }
    }

    async function showWorkflowDetail(workflowName) {
      const btn = document.getElementById('header-action');
      btn.textContent = 'Refresh';
      btn.onclick = () => showWorkflowDetail(workflowName);

      document.getElementById('content').innerHTML = '<div class="loading">Loading...</div>';

      try {
        if (!cachedIntrospection) await fetchIntrospection();
        const wf = cachedIntrospection.workflows.find(w => w.name === workflowName);
        if (!wf) {
          document.getElementById('content').innerHTML =
            '<div class="empty-state"><p>Workflow not found.</p></div>';
          return;
        }
        renderWorkflowDetail(wf);
      } catch (err) {
        document.getElementById('content').innerHTML =
          '<div class="empty-state"><p>Failed to load workflow data.</p></div>';
        console.error('Orko Dashboard: Failed to fetch workflow data', err);
      }
    }

    function renderWorkflowDetail(wf) {
      let html = '';

      html += '<a class="back-link" onclick="window.location.hash=\\'#/\\'">\u2190 Back to Dashboard</a>';

      html += '<div class="detail-header">';
      html += '<div>';
      html += '<div class="detail-title">' + esc(wf.name) + '</div>';
      html += '</div>';
      html += '</div>';

      // Stats
      var branchTargets = new Set();
      for (var s = 0; s < wf.steps.length; s++) {
        if (wf.steps[s].onSuccess) branchTargets.add(wf.steps[s].onSuccess);
        if (wf.steps[s].onFailure) branchTargets.add(wf.steps[s].onFailure);
      }
      var mainCount = wf.steps.filter(function(st) { return !branchTargets.has(st.type); }).length;

      html += '<div class="stats">';
      html += statCard('Total Steps', wf.steps.length, 'accent');
      html += statCard('Main Flow', mainCount);
      html += statCard('Branches', branchTargets.size);
      html += '</div>';

      // Flow diagram
      html += '<div class="section">';
      html += '<div class="section-header">Flow Diagram</div>';
      html += workflowCard(wf);
      html += '</div>';

      // Steps table
      html += '<div class="section">';
      html += '<div class="section-header">Steps <span class="count">' + wf.steps.length + '</span></div>';
      html += '<table class="events-table">';
      html += '<thead><tr><th>Step</th><th>Retries</th><th>On Success</th><th>On Failure</th></tr></thead>';
      html += '<tbody>';
      for (var i = 0; i < wf.steps.length; i++) {
        var step = wf.steps[i];
        var retryBadge = step.retry
          ? '<span class="badge badge-retry">' + step.retry.maxRetries + ' retries</span>'
          : '<span class="badge badge-none">No retry</span>';
        var successBadge = step.onSuccess
          ? '<span class="badge badge-retry">' + esc(step.onSuccess) + '</span>'
          : '<span class="badge badge-none">\u2014</span>';
        var failBadge = step.onFailure
          ? '<span class="badge" style="background:var(--danger-dim);color:var(--danger)">' + esc(step.onFailure) + '</span>'
          : '<span class="badge badge-none">\u2014</span>';
        html += '<tr><td class="event-type">' + esc(step.type) + '</td><td>' + retryBadge + '</td><td>' + successBadge + '</td><td>' + failBadge + '</td></tr>';
      }
      html += '</tbody></table>';
      html += '</div>';

      document.getElementById('content').innerHTML = html;
      requestAnimationFrame(drawFlowConnections);
    }

    function renderDashboard(data) {
      const { events, workflows } = data;
      let html = '';

      // Stats
      html += '<div class="stats">';
      html += statCard('Events', events.length);
      html += statCard('Workflows', workflows.length);
      const totalSteps = workflows.reduce((sum, w) => sum + w.steps.length, 0);
      html += statCard('Workflow Steps', totalSteps);
      html += '</div>';

      // Events
      html += '<div class="section">';
      html += '<div class="section-header">Events <span class="count">' + events.length + '</span></div>';
      if (events.length === 0) {
        html += '<div class="empty-state"><p>No events registered</p></div>';
      } else {
        var eTotalPages = Math.ceil(events.length / PAGE_SIZE);
        if (eventsPage >= eTotalPages) eventsPage = eTotalPages - 1;
        var eStart = eventsPage * PAGE_SIZE;
        var eSlice = events.slice(eStart, eStart + PAGE_SIZE);
        var needsEPag = events.length > PAGE_SIZE;

        html += '<table class="events-table' + (needsEPag ? ' has-pagination' : '') + '">';
        html += '<thead><tr><th>Event Type</th><th>Retries</th></tr></thead>';
        html += '<tbody>';
        for (var ei = 0; ei < eSlice.length; ei++) {
          var event = eSlice[ei];
          var retryBadge = event.retry
            ? '<span class="badge badge-retry">' + event.retry.maxRetries + ' retries</span>'
            : '<span class="badge badge-none">No retry</span>';
          html += '<tr class="clickable" onclick="window.location.hash=\\'#/events/' + encodeURIComponent(event.type) + '\\'"><td class="event-type">' + esc(event.type) + '</td><td>' + retryBadge + '</td></tr>';
        }
        html += '</tbody></table>';

        if (needsEPag) {
          html += '<div class="pagination">';
          html += '<span>' + (eStart + 1) + '\u2013' + Math.min(eStart + PAGE_SIZE, events.length) + ' of ' + events.length + '</span>';
          html += '<div class="pagination-buttons">';
          html += '<button class="pagination-btn" id="events-prev"' + (eventsPage === 0 ? ' disabled' : '') + '>\u2190 Prev</button>';
          html += '<button class="pagination-btn" id="events-next"' + (eventsPage >= eTotalPages - 1 ? ' disabled' : '') + '>Next \u2192</button>';
          html += '</div></div>';
        }
      }
      html += '</div>';

      // Workflows
      html += '<div class="section">';
      html += '<div class="section-header">Workflows <span class="count">' + workflows.length + '</span></div>';
      if (workflows.length === 0) {
        html += '<div class="empty-state"><p>No workflows registered</p></div>';
      } else {
        var wTotalPages = Math.ceil(workflows.length / PAGE_SIZE);
        if (workflowsPage >= wTotalPages) workflowsPage = wTotalPages - 1;
        var wStart = workflowsPage * PAGE_SIZE;
        var wSlice = workflows.slice(wStart, wStart + PAGE_SIZE);
        var needsWPag = workflows.length > PAGE_SIZE;

        html += '<table class="events-table' + (needsWPag ? ' has-pagination' : '') + '">';
        html += '<thead><tr><th>Workflow Name</th><th>Steps</th><th>Callbacks</th></tr></thead>';
        html += '<tbody>';
        for (var wi = 0; wi < wSlice.length; wi++) {
          var wf = wSlice[wi];
          var callbacks = [];
          if (wf.onComplete) callbacks.push('onComplete');
          if (wf.onSuccess) callbacks.push('onSuccess');
          if (wf.onFailure) callbacks.push('onFailure');
          var callbacksHtml = callbacks.length > 0
            ? callbacks.map(function(c) { return '<span class="badge badge-' + (c === 'onComplete' ? 'none' : c === 'onSuccess' ? 'retry' : 'none') + '">' + c + '</span>'; }).join(' ')
            : '<span class="badge badge-none">None</span>';
          html += '<tr class="clickable" onclick="window.location.hash=\\'#/workflows/' + encodeURIComponent(wf.name) + '\\'"><td class="event-type">' + esc(wf.name) + '</td><td>' + wf.steps.length + ' steps</td><td>' + callbacksHtml + '</td></tr>';
        }
        html += '</tbody></table>';

        if (needsWPag) {
          html += '<div class="pagination">';
          html += '<span>' + (wStart + 1) + '\u2013' + Math.min(wStart + PAGE_SIZE, workflows.length) + ' of ' + workflows.length + '</span>';
          html += '<div class="pagination-buttons">';
          html += '<button class="pagination-btn" id="workflows-prev"' + (workflowsPage === 0 ? ' disabled' : '') + '>\u2190 Prev</button>';
          html += '<button class="pagination-btn" id="workflows-next"' + (workflowsPage >= wTotalPages - 1 ? ' disabled' : '') + '>Next \u2192</button>';
          html += '</div></div>';
        }
      }
      html += '</div>';

      document.getElementById('content').innerHTML = html;

      // Bind pagination buttons
      var eprev = document.getElementById('events-prev');
      var enext = document.getElementById('events-next');
      var wprev = document.getElementById('workflows-prev');
      var wnext = document.getElementById('workflows-next');
      if (eprev) eprev.onclick = function() { eventsPage--; renderDashboard(data); };
      if (enext) enext.onclick = function() { eventsPage++; renderDashboard(data); };
      if (wprev) wprev.onclick = function() { workflowsPage--; renderDashboard(data); };
      if (wnext) wnext.onclick = function() { workflowsPage++; renderDashboard(data); };
    }

    function drawFlowConnections() {
      var flows = document.querySelectorAll('.workflow-flow');
      flows.forEach(function(flow) {
        var grid = flow.querySelector('.flow-grid');
        if (!grid) return;

        var nodes = grid.querySelectorAll('.flow-node');
        if (nodes.length === 0) return;

        // Remove old SVG
        var oldSvg = flow.querySelector('svg');
        if (oldSvg) oldSvg.remove();

        var flowRect = flow.getBoundingClientRect();
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', grid.scrollWidth);
        svg.setAttribute('height', grid.scrollHeight);
        svg.style.width = grid.scrollWidth + 'px';
        svg.style.height = grid.scrollHeight + 'px';

        var gridRect = grid.getBoundingClientRect();

        function nodeRect(id) {
          var el = grid.querySelector('[data-id="' + id + '"]');
          if (!el) return null;
          var r = el.getBoundingClientRect();
          return {
            left: r.left - gridRect.left,
            right: r.right - gridRect.left,
            top: r.top - gridRect.top,
            bottom: r.bottom - gridRect.top,
            cx: (r.left + r.right) / 2 - gridRect.left,
            cy: (r.top + r.bottom) / 2 - gridRect.top
          };
        }

        function makePath(d, color, dashed) {
          var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', d);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', color);
          path.setAttribute('stroke-width', '2');
          if (dashed) path.setAttribute('stroke-dasharray', '6 4');
          svg.appendChild(path);
        }

        function makeArrowHead(x, y, color) {
          var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          poly.setAttribute('points', (x - 6) + ',' + (y - 4) + ' ' + x + ',' + y + ' ' + (x - 6) + ',' + (y + 4));
          poly.setAttribute('fill', color);
          svg.appendChild(poly);
        }

        // Find how many main columns exist
        var mainNodes = grid.querySelectorAll('[data-id^="main-"]');
        var colCount = mainNodes.length;

        for (var col = 0; col < colCount; col++) {
          var main = nodeRect('main-' + col);
          var nextMain = nodeRect('main-' + (col + 1));
          var succBranch = nodeRect('branch-success-' + col);
          var failBranch = nodeRect('branch-failure-' + col);

          var seqColor = '#6e6e82';
          var successColor = '#34d399';
          var failColor = '#f87171';

          if (succBranch && failBranch) {
            // Has branches: draw curves from main to success (up) and failure (down)
            // Main -> Success branch (curve up-right)
            var sx = main.right;
            var sy = main.cy;
            var ex = succBranch.left;
            var ey = succBranch.cy;
            var cpx = sx + (ex - sx) * 0.5;
            makePath('M' + sx + ',' + sy + ' C' + cpx + ',' + sy + ' ' + cpx + ',' + ey + ' ' + ex + ',' + ey, successColor);
            makeArrowHead(ex, ey, successColor);

            // Main -> Failure branch (curve down-right)
            ey = failBranch.cy;
            ex = failBranch.left;
            makePath('M' + sx + ',' + sy + ' C' + cpx + ',' + sy + ' ' + cpx + ',' + ey + ' ' + ex + ',' + ey, failColor);
            makeArrowHead(ex, ey, failColor);

            // Success branch -> next main (curve down-right to converge)
            if (nextMain) {
              sx = succBranch.right;
              sy = succBranch.cy;
              ex = nextMain.left;
              ey = nextMain.cy;
              cpx = sx + (ex - sx) * 0.5;
              makePath('M' + sx + ',' + sy + ' C' + cpx + ',' + sy + ' ' + cpx + ',' + ey + ' ' + ex + ',' + ey, successColor, true);

              // Failure branch -> next main (curve up-right to converge)
              sx = failBranch.right;
              sy = failBranch.cy;
              makePath('M' + sx + ',' + sy + ' C' + cpx + ',' + sy + ' ' + cpx + ',' + ey + ' ' + ex + ',' + ey, failColor, true);
              makeArrowHead(ex, ey, seqColor);
            }
          } else if (succBranch) {
            // Only success branch
            var sx = main.right; var sy = main.cy;
            var ex = succBranch.left; var ey = succBranch.cy;
            var cpx = sx + (ex - sx) * 0.5;
            makePath('M' + sx + ',' + sy + ' C' + cpx + ',' + sy + ' ' + cpx + ',' + ey + ' ' + ex + ',' + ey, successColor);
            makeArrowHead(ex, ey, successColor);
            if (nextMain) {
              sx = succBranch.right; sy = succBranch.cy;
              ex = nextMain.left; ey = nextMain.cy;
              cpx = sx + (ex - sx) * 0.5;
              makePath('M' + sx + ',' + sy + ' C' + cpx + ',' + sy + ' ' + cpx + ',' + ey + ' ' + ex + ',' + ey, successColor, true);
              makeArrowHead(ex, ey, seqColor);
            }
            // Also draw sequential from main to next if no failure branch
            if (nextMain) {
              sx = main.right; sy = main.cy;
              ex = nextMain.left; ey = nextMain.cy;
              makePath('M' + sx + ',' + sy + ' L' + ex + ',' + ey, seqColor);
              makeArrowHead(ex, ey, seqColor);
            }
          } else if (failBranch) {
            // Only failure branch
            var sx = main.right; var sy = main.cy;
            var ex = failBranch.left; var ey = failBranch.cy;
            var cpx = sx + (ex - sx) * 0.5;
            makePath('M' + sx + ',' + sy + ' C' + cpx + ',' + sy + ' ' + cpx + ',' + ey + ' ' + ex + ',' + ey, failColor);
            makeArrowHead(ex, ey, failColor);
            if (nextMain) {
              sx = failBranch.right; sy = failBranch.cy;
              ex = nextMain.left; ey = nextMain.cy;
              cpx = sx + (ex - sx) * 0.5;
              makePath('M' + sx + ',' + sy + ' C' + cpx + ',' + sy + ' ' + cpx + ',' + ey + ' ' + ex + ',' + ey, failColor, true);
              makeArrowHead(ex, ey, seqColor);
            }
            // Also draw sequential from main to next
            if (nextMain) {
              sx = main.right; sy = main.cy;
              ex = nextMain.left; ey = nextMain.cy;
              makePath('M' + sx + ',' + sy + ' L' + ex + ',' + ey, seqColor);
              makeArrowHead(ex, ey, seqColor);
            }
          } else if (nextMain) {
            // No branches - straight sequential arrow
            var sx = main.right;
            var sy = main.cy;
            var ex = nextMain.left;
            var ey = nextMain.cy;
            makePath('M' + sx + ',' + sy + ' L' + ex + ',' + ey, seqColor);
            makeArrowHead(ex, ey, seqColor);
          }
        }

        grid.insertBefore(svg, grid.firstChild);
      });
    }

    function renderEventDetail(eventType, eventInfo, metrics) {
      let html = '';

      html += '<a class="back-link" onclick="window.location.hash=\\'#/\\'">\u2190 Back to Dashboard</a>';

      html += '<div class="detail-header">';
      html += '<div>';
      html += '<div class="detail-title">' + esc(eventType) + '</div>';
      if (eventInfo && eventInfo.retry) {
        html += '<span class="badge badge-retry detail-badge">' + eventInfo.retry.maxRetries + ' retries</span>';
      }
      html += '</div>';
      html += '</div>';

      html += '<div class="stats">';
      html += statCard('Received', metrics.received, 'accent');
      html += statCard('Completed', metrics.completed, 'success');
      html += statCard('Failed', metrics.failed, 'danger');
      html += '</div>';

      document.getElementById('content').innerHTML = html;
    }

    function statCard(label, value, variant) {
      const cls = variant ? ' ' + variant : '';
      return '<div class="stat-card' + cls + '"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>';
    }

    function workflowCard(wf) {
      let html = '<div class="workflow-card" data-workflow="' + esc(wf.name) + '">';

      // Identify branch targets (steps referenced by onSuccess/onFailure)
      var branchTargets = new Set();
      var branchMap = {}; // parentType -> { onSuccess: stepType, onFailure: stepType }
      for (var s = 0; s < wf.steps.length; s++) {
        var st = wf.steps[s];
        if (st.onSuccess) { branchTargets.add(st.onSuccess); branchMap[st.type] = branchMap[st.type] || {}; branchMap[st.type].onSuccess = st.onSuccess; }
        if (st.onFailure) { branchTargets.add(st.onFailure); branchMap[st.type] = branchMap[st.type] || {}; branchMap[st.type].onFailure = st.onFailure; }
      }

      // Build main flow (skip branch targets)
      var mainSteps = [];
      for (var s = 0; s < wf.steps.length; s++) {
        if (!branchTargets.has(wf.steps[s].type)) {
          mainSteps.push(wf.steps[s]);
        }
      }

      // Find branch step data by type
      function findStep(type) {
        for (var s = 0; s < wf.steps.length; s++) {
          if (wf.steps[s].type === type) return wf.steps[s];
        }
        return null;
      }

      // Build grid: 3 rows, columns advance separately for branches
      // Row 1 = success branches, Row 2 = main flow, Row 3 = failure branches
      html += '<div class="workflow-flow"><div class="flow-grid">';

      var gridCol = 1;
      for (var col = 0; col < mainSteps.length; col++) {
        var ms = mainSteps[col];
        var branches = branchMap[ms.type];

        // Main step column
        html += '<div class="flow-spacer" style="grid-row:1;grid-column:' + gridCol + '"></div>';
        html += '<div class="flow-node" data-id="main-' + col + '" style="grid-row:2;grid-column:' + gridCol + '">';
        html += '<div class="node-type">' + esc(ms.type) + '</div>';
        if (ms.retry) html += '<span class="badge badge-retry">' + ms.retry.maxRetries + ' retries</span>';
        html += '</div>';
        html += '<div class="flow-spacer" style="grid-row:3;grid-column:' + gridCol + '"></div>';

        // If this step has branches, add them in the next column
        if (branches && (branches.onSuccess || branches.onFailure)) {
          gridCol++;

          if (branches.onSuccess) {
            var succStep = findStep(branches.onSuccess);
            html += '<div class="flow-node branch-success" data-id="branch-success-' + col + '" style="grid-row:1;grid-column:' + gridCol + '">';
            html += '<div class="node-type">' + esc(branches.onSuccess) + '</div>';
            html += '<div class="node-label label-success">on success</div>';
            if (succStep && succStep.retry) html += '<span class="badge badge-retry">' + succStep.retry.maxRetries + ' retries</span>';
            html += '</div>';
          } else {
            html += '<div class="flow-spacer" style="grid-row:1;grid-column:' + gridCol + '"></div>';
          }

          // Empty middle row for branches column
          html += '<div class="flow-spacer" style="grid-row:2;grid-column:' + gridCol + '"></div>';

          if (branches.onFailure) {
            var failStep = findStep(branches.onFailure);
            html += '<div class="flow-node branch-failure" data-id="branch-failure-' + col + '" style="grid-row:3;grid-column:' + gridCol + '">';
            html += '<div class="node-type">' + esc(branches.onFailure) + '</div>';
            html += '<div class="node-label label-failure">on failure</div>';
            if (failStep && failStep.retry) html += '<span class="badge badge-retry">' + failStep.retry.maxRetries + ' retries</span>';
            html += '</div>';
          } else {
            html += '<div class="flow-spacer" style="grid-row:3;grid-column:' + gridCol + '"></div>';
          }
        }

        gridCol++;
      }

      html += '</div></div>';

      // Workflow-level callbacks
      var hasCallbacks = wf.onComplete || wf.onSuccess || wf.onFailure;
      if (hasCallbacks) {
        html += '<div class="workflow-callbacks">';
        if (wf.onComplete) html += '<span class="callback-tag callback-complete">onComplete \u2192 ' + esc(wf.onComplete) + '</span>';
        if (wf.onSuccess) html += '<span class="callback-tag callback-success">onSuccess \u2192 ' + esc(wf.onSuccess) + '</span>';
        if (wf.onFailure) html += '<span class="callback-tag callback-failure">onFailure \u2192 ' + esc(wf.onFailure) + '</span>';
        html += '</div>';
      }

      html += '</div>';
      return html;
    }

    function esc(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    window.addEventListener('hashchange', route);
    route();
  </script>
</body>
</html>`;
}
