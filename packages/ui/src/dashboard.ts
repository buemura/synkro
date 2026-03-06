export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Synkro Dashboard</title>
  <script>
    (function() {
      var t = localStorage.getItem('synkro-theme');
      if (t === 'light') document.documentElement.classList.remove('dark');
    })();
  </script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            bg: 'var(--color-bg)',
            surface: { DEFAULT: 'var(--color-surface)', hover: 'var(--color-surface-hover)' },
            border: 'var(--color-border)',
            txt: { DEFAULT: 'var(--color-txt)', muted: 'var(--color-txt-muted)' },
            accent: { DEFAULT: '#7c6af6', dim: 'var(--color-accent-dim)' },
            success: { DEFAULT: '#34d399', dim: 'var(--color-success-dim)' },
            danger: { DEFAULT: '#f87171', dim: 'var(--color-danger-dim)' },
            warning: { DEFAULT: '#fbbf24', dim: 'var(--color-warning-dim)' },
          },
          borderRadius: { DEFAULT: '10px' },
          fontFamily: { mono: ["'SF Mono'", "'Fira Code'", "monospace"] },
        }
      }
    }
  </script>
  <style>
    :root {
      --color-bg: #f5f5f8;
      --color-surface: #ffffff;
      --color-surface-hover: #f0f0f5;
      --color-border: #e0e0ea;
      --color-txt: #1a1a2e;
      --color-txt-muted: #6e6e82;
      --color-accent-dim: rgba(124,106,246,0.1);
      --color-success-dim: rgba(52,211,153,0.1);
      --color-danger-dim: rgba(248,113,113,0.1);
      --color-warning-dim: rgba(251,191,36,0.1);
      --color-seq: #6e6e82;
    }
    .dark {
      --color-bg: #0a0a0f;
      --color-surface: #12121a;
      --color-surface-hover: #1a1a25;
      --color-border: #1e1e2e;
      --color-txt: #e2e2e8;
      --color-txt-muted: #6e6e82;
      --color-accent-dim: rgba(124,106,246,0.13);
      --color-success-dim: rgba(52,211,153,0.13);
      --color-danger-dim: rgba(248,113,113,0.13);
      --color-warning-dim: rgba(251,191,36,0.13);
      --color-seq: #6e6e82;
    }

    /* Minimal styles that are hard to express in Tailwind */
    .events-table { border-collapse: collapse; }
    .events-table th, .events-table td { text-align: left; }
    .events-table tr:last-child td { border-bottom: none; }
    [data-flow] svg { position: absolute; top: 0; left: 0; pointer-events: none; }
  </style>
</head>
<body class="font-sans bg-bg text-txt leading-relaxed min-h-screen transition-colors duration-200">
  <div class="max-w-[1200px] mx-auto py-8 px-6">
    <header class="flex items-center justify-between mb-10">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 bg-accent rounded-lg flex items-center justify-center font-bold text-base text-white">S</div>
        <h1 class="text-[22px] font-semibold tracking-tight">Synkro <span class="text-txt-muted font-normal text-sm ml-2">Dashboard</span></h1>
      </div>
      <div class="flex items-center gap-2">
        <button class="bg-surface border border-border text-txt w-9 h-9 rounded-lg cursor-pointer text-base transition-colors inline-flex items-center justify-center hover:bg-surface-hover" id="theme-toggle" title="Toggle theme"></button>
        <button class="bg-surface border border-border text-txt py-2 px-4 rounded-lg cursor-pointer text-[13px] transition-colors inline-flex items-center gap-1.5 hover:bg-surface-hover" id="header-action">Refresh</button>
      </div>
    </header>
    <div id="content">
      <div class="text-center py-20 text-txt-muted">Loading...</div>
    </div>
  </div>

  <script>
    // Theme toggle
    function isDark() {
      return document.documentElement.classList.contains('dark');
    }

    function updateThemeIcon() {
      var btn = document.getElementById('theme-toggle');
      if (btn) btn.textContent = isDark() ? '\\u2600' : '\\u263E';
    }

    function toggleTheme() {
      var html = document.documentElement;
      html.classList.toggle('dark');
      var theme = isDark() ? 'dark' : 'light';
      localStorage.setItem('synkro-theme', theme);
      updateThemeIcon();
      // Redraw flow connections since colors may change
      requestAnimationFrame(drawFlowConnections);
    }

    document.getElementById('theme-toggle').onclick = toggleTheme;
    updateThemeIcon();

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
          '<div class="text-center p-12 text-txt-muted bg-surface border border-border rounded-[10px]"><p class="text-sm">Failed to load data. Check the console for errors.</p></div>';
        console.error('Synkro Dashboard: Failed to fetch introspection data', err);
      }
    }

    async function showEventDetail(eventType) {
      const btn = document.getElementById('header-action');
      btn.textContent = 'Refresh';
      btn.onclick = () => showEventDetail(eventType);

      document.getElementById('content').innerHTML = '<div class="text-center py-20 text-txt-muted">Loading...</div>';

      try {
        if (!cachedIntrospection) await fetchIntrospection();
        const eventInfo = cachedIntrospection.events.find(e => e.type === eventType);
        const metrics = await fetchEventMetrics(eventType);
        renderEventDetail(eventType, eventInfo, metrics);
      } catch (err) {
        document.getElementById('content').innerHTML =
          '<div class="text-center p-12 text-txt-muted bg-surface border border-border rounded-[10px]"><p class="text-sm">Failed to load event data.</p></div>';
        console.error('Synkro Dashboard: Failed to fetch event metrics', err);
      }
    }

    async function showWorkflowDetail(workflowName) {
      const btn = document.getElementById('header-action');
      btn.textContent = 'Refresh';
      btn.onclick = () => showWorkflowDetail(workflowName);

      document.getElementById('content').innerHTML = '<div class="text-center py-20 text-txt-muted">Loading...</div>';

      try {
        if (!cachedIntrospection) await fetchIntrospection();
        const wf = cachedIntrospection.workflows.find(w => w.name === workflowName);
        if (!wf) {
          document.getElementById('content').innerHTML =
            '<div class="text-center p-12 text-txt-muted bg-surface border border-border rounded-[10px]"><p class="text-sm">Workflow not found.</p></div>';
          return;
        }
        renderWorkflowDetail(wf);
      } catch (err) {
        document.getElementById('content').innerHTML =
          '<div class="text-center p-12 text-txt-muted bg-surface border border-border rounded-[10px]"><p class="text-sm">Failed to load workflow data.</p></div>';
        console.error('Synkro Dashboard: Failed to fetch workflow data', err);
      }
    }

    function renderWorkflowDetail(wf) {
      let html = '';

      html += '<a class="text-txt-muted no-underline text-[13px] inline-flex items-center gap-1.5 mb-6 cursor-pointer transition-colors hover:text-txt" onclick="window.location.hash=\\'#/\\'">\u2190 Back to Dashboard</a>';

      html += '<div class="flex items-center justify-between mb-8">';
      html += '<div>';
      html += '<div class="font-mono text-xl font-semibold text-accent">' + esc(wf.name) + '</div>';
      html += '</div>';
      html += '</div>';

      // Stats
      var branchTargets = new Set();
      for (var s = 0; s < wf.steps.length; s++) {
        if (wf.steps[s].onSuccess) branchTargets.add(wf.steps[s].onSuccess);
        if (wf.steps[s].onFailure) branchTargets.add(wf.steps[s].onFailure);
      }
      var mainCount = wf.steps.filter(function(st) { return !branchTargets.has(st.type); }).length;

      html += '<div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-10">';
      html += statCard('Total Steps', wf.steps.length, 'accent');
      html += statCard('Main Flow', mainCount);
      html += statCard('Branches', branchTargets.size);
      html += '</div>';

      // Flow diagram
      html += '<div class="mb-10">';
      html += '<div class="text-base font-semibold mb-4 flex items-center gap-2">Flow Diagram</div>';
      html += workflowCard(wf);
      html += '</div>';

      // Steps table
      html += '<div class="mb-10">';
      html += '<div class="text-base font-semibold mb-4 flex items-center gap-2">Steps <span class="bg-accent-dim text-accent text-xs py-0.5 px-2 rounded-full font-medium">' + wf.steps.length + '</span></div>';
      html += '<table class="events-table w-full bg-surface border border-border rounded-[10px] overflow-hidden">';
      html += '<thead><tr><th class="p-3 px-4 text-[11px] uppercase tracking-wide text-txt-muted border-b border-border bg-surface">Step</th><th class="p-3 px-4 text-[11px] uppercase tracking-wide text-txt-muted border-b border-border bg-surface">Retries</th><th class="p-3 px-4 text-[11px] uppercase tracking-wide text-txt-muted border-b border-border bg-surface">On Success</th><th class="p-3 px-4 text-[11px] uppercase tracking-wide text-txt-muted border-b border-border bg-surface">On Failure</th></tr></thead>';
      html += '<tbody>';
      for (var i = 0; i < wf.steps.length; i++) {
        var step = wf.steps[i];
        var retryBadge = step.retry
          ? '<span class="inline-block text-[11px] py-0.5 px-2 rounded-full font-medium bg-warning-dim text-warning">' + step.retry.maxRetries + ' retries</span>'
          : '<span class="inline-block text-[11px] py-0.5 px-2 rounded-full font-medium bg-border text-txt-muted">No retry</span>';
        var successBadge = step.onSuccess
          ? '<span class="inline-block text-[11px] py-0.5 px-2 rounded-full font-medium bg-warning-dim text-warning">' + esc(step.onSuccess) + '</span>'
          : '<span class="inline-block text-[11px] py-0.5 px-2 rounded-full font-medium bg-border text-txt-muted">\u2014</span>';
        var failBadge = step.onFailure
          ? '<span class="inline-block text-[11px] py-0.5 px-2 rounded-full font-medium bg-danger-dim text-danger">' + esc(step.onFailure) + '</span>'
          : '<span class="inline-block text-[11px] py-0.5 px-2 rounded-full font-medium bg-border text-txt-muted">\u2014</span>';
        html += '<tr><td class="p-3 px-4 border-b border-border text-sm font-mono text-[13px] text-accent">' + esc(step.type) + '</td><td class="p-3 px-4 border-b border-border text-sm">' + retryBadge + '</td><td class="p-3 px-4 border-b border-border text-sm">' + successBadge + '</td><td class="p-3 px-4 border-b border-border text-sm">' + failBadge + '</td></tr>';
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
      html += '<div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-10">';
      html += statCard('Events', events.length);
      html += statCard('Workflows', workflows.length);
      const totalSteps = workflows.reduce((sum, w) => sum + w.steps.length, 0);
      html += statCard('Workflow Steps', totalSteps);
      html += '</div>';

      // Events
      html += '<div class="mb-10">';
      html += '<div class="text-base font-semibold mb-4 flex items-center gap-2">Events <span class="bg-accent-dim text-accent text-xs py-0.5 px-2 rounded-full font-medium">' + events.length + '</span></div>';
      if (events.length === 0) {
        html += '<div class="text-center p-12 text-txt-muted bg-surface border border-border rounded-[10px]"><p class="text-sm">No events registered</p></div>';
      } else {
        var eTotalPages = Math.ceil(events.length / PAGE_SIZE);
        if (eventsPage >= eTotalPages) eventsPage = eTotalPages - 1;
        var eStart = eventsPage * PAGE_SIZE;
        var eSlice = events.slice(eStart, eStart + PAGE_SIZE);
        var needsEPag = events.length > PAGE_SIZE;

        html += '<table class="events-table w-full bg-surface border border-border ' + (needsEPag ? 'rounded-t-[10px]' : 'rounded-[10px]') + ' overflow-hidden">';
        html += '<thead><tr><th class="p-3 px-4 text-[11px] uppercase tracking-wide text-txt-muted border-b border-border bg-surface">Event Type</th><th class="p-3 px-4 text-[11px] uppercase tracking-wide text-txt-muted border-b border-border bg-surface">Retries</th></tr></thead>';
        html += '<tbody>';
        for (var ei = 0; ei < eSlice.length; ei++) {
          var event = eSlice[ei];
          var retryBadge = event.retry
            ? '<span class="inline-block text-[11px] py-0.5 px-2 rounded-full font-medium bg-warning-dim text-warning">' + event.retry.maxRetries + ' retries</span>'
            : '<span class="inline-block text-[11px] py-0.5 px-2 rounded-full font-medium bg-border text-txt-muted">No retry</span>';
          html += '<tr class="cursor-pointer transition-colors hover:bg-surface-hover" onclick="window.location.hash=\\'#/events/' + encodeURIComponent(event.type) + '\\'"><td class="p-3 px-4 border-b border-border text-sm font-mono text-[13px] text-accent">' + esc(event.type) + '</td><td class="p-3 px-4 border-b border-border text-sm">' + retryBadge + '</td></tr>';
        }
        html += '</tbody></table>';

        if (needsEPag) {
          html += '<div class="flex items-center justify-between p-3 px-4 bg-surface border border-border border-t-0 rounded-b-[10px] text-[13px] text-txt-muted">';
          html += '<span>' + (eStart + 1) + '\u2013' + Math.min(eStart + PAGE_SIZE, events.length) + ' of ' + events.length + '</span>';
          html += '<div class="flex gap-2">';
          html += '<button class="bg-bg border border-border text-txt py-1 px-3 rounded-md cursor-pointer text-xs transition-colors hover:bg-surface-hover disabled:opacity-30 disabled:cursor-default" id="events-prev"' + (eventsPage === 0 ? ' disabled' : '') + '>\u2190 Prev</button>';
          html += '<button class="bg-bg border border-border text-txt py-1 px-3 rounded-md cursor-pointer text-xs transition-colors hover:bg-surface-hover disabled:opacity-30 disabled:cursor-default" id="events-next"' + (eventsPage >= eTotalPages - 1 ? ' disabled' : '') + '>Next \u2192</button>';
          html += '</div></div>';
        }
      }
      html += '</div>';

      // Workflows
      html += '<div class="mb-10">';
      html += '<div class="text-base font-semibold mb-4 flex items-center gap-2">Workflows <span class="bg-accent-dim text-accent text-xs py-0.5 px-2 rounded-full font-medium">' + workflows.length + '</span></div>';
      if (workflows.length === 0) {
        html += '<div class="text-center p-12 text-txt-muted bg-surface border border-border rounded-[10px]"><p class="text-sm">No workflows registered</p></div>';
      } else {
        var wTotalPages = Math.ceil(workflows.length / PAGE_SIZE);
        if (workflowsPage >= wTotalPages) workflowsPage = wTotalPages - 1;
        var wStart = workflowsPage * PAGE_SIZE;
        var wSlice = workflows.slice(wStart, wStart + PAGE_SIZE);
        var needsWPag = workflows.length > PAGE_SIZE;

        html += '<table class="events-table w-full bg-surface border border-border ' + (needsWPag ? 'rounded-t-[10px]' : 'rounded-[10px]') + ' overflow-hidden">';
        html += '<thead><tr><th class="p-3 px-4 text-[11px] uppercase tracking-wide text-txt-muted border-b border-border bg-surface">Workflow Name</th><th class="p-3 px-4 text-[11px] uppercase tracking-wide text-txt-muted border-b border-border bg-surface">Steps</th><th class="p-3 px-4 text-[11px] uppercase tracking-wide text-txt-muted border-b border-border bg-surface">Callbacks</th></tr></thead>';
        html += '<tbody>';
        for (var wi = 0; wi < wSlice.length; wi++) {
          var wf = wSlice[wi];
          var callbacks = [];
          if (wf.onComplete) callbacks.push('onComplete');
          if (wf.onSuccess) callbacks.push('onSuccess');
          if (wf.onFailure) callbacks.push('onFailure');
          var callbacksHtml = callbacks.length > 0
            ? callbacks.map(function(c) { return '<span class="inline-block text-[11px] py-0.5 px-2 rounded-full font-medium ' + (c === 'onSuccess' ? 'bg-warning-dim text-warning' : 'bg-border text-txt-muted') + '">' + c + '</span>'; }).join(' ')
            : '<span class="inline-block text-[11px] py-0.5 px-2 rounded-full font-medium bg-border text-txt-muted">None</span>';
          html += '<tr class="cursor-pointer transition-colors hover:bg-surface-hover" onclick="window.location.hash=\\'#/workflows/' + encodeURIComponent(wf.name) + '\\'"><td class="p-3 px-4 border-b border-border text-sm font-mono text-[13px] text-accent">' + esc(wf.name) + '</td><td class="p-3 px-4 border-b border-border text-sm">' + wf.steps.length + ' steps</td><td class="p-3 px-4 border-b border-border text-sm">' + callbacksHtml + '</td></tr>';
        }
        html += '</tbody></table>';

        if (needsWPag) {
          html += '<div class="flex items-center justify-between p-3 px-4 bg-surface border border-border border-t-0 rounded-b-[10px] text-[13px] text-txt-muted">';
          html += '<span>' + (wStart + 1) + '\u2013' + Math.min(wStart + PAGE_SIZE, workflows.length) + ' of ' + workflows.length + '</span>';
          html += '<div class="flex gap-2">';
          html += '<button class="bg-bg border border-border text-txt py-1 px-3 rounded-md cursor-pointer text-xs transition-colors hover:bg-surface-hover disabled:opacity-30 disabled:cursor-default" id="workflows-prev"' + (workflowsPage === 0 ? ' disabled' : '') + '>\u2190 Prev</button>';
          html += '<button class="bg-bg border border-border text-txt py-1 px-3 rounded-md cursor-pointer text-xs transition-colors hover:bg-surface-hover disabled:opacity-30 disabled:cursor-default" id="workflows-next"' + (workflowsPage >= wTotalPages - 1 ? ' disabled' : '') + '>Next \u2192</button>';
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

    function getSeqColor() {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-seq').trim();
    }

    function drawFlowConnections() {
      var flows = document.querySelectorAll('[data-flow]');
      flows.forEach(function(flow) {
        var grid = flow.querySelector('[data-flow-grid]');
        if (!grid) return;

        var nodes = grid.querySelectorAll('[data-flow-node]');
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

        var seqColor = getSeqColor();
        var successColor = '#34d399';
        var failColor = '#f87171';

        for (var col = 0; col < colCount; col++) {
          var main = nodeRect('main-' + col);
          var nextMain = nodeRect('main-' + (col + 1));
          var succBranch = nodeRect('branch-success-' + col);
          var failBranch = nodeRect('branch-failure-' + col);

          if (succBranch && failBranch) {
            var sx = main.right;
            var sy = main.cy;
            var ex = succBranch.left;
            var ey = succBranch.cy;
            var cpx = sx + (ex - sx) * 0.5;
            makePath('M' + sx + ',' + sy + ' C' + cpx + ',' + sy + ' ' + cpx + ',' + ey + ' ' + ex + ',' + ey, successColor);
            makeArrowHead(ex, ey, successColor);

            ey = failBranch.cy;
            ex = failBranch.left;
            makePath('M' + sx + ',' + sy + ' C' + cpx + ',' + sy + ' ' + cpx + ',' + ey + ' ' + ex + ',' + ey, failColor);
            makeArrowHead(ex, ey, failColor);

            if (nextMain) {
              sx = succBranch.right;
              sy = succBranch.cy;
              ex = nextMain.left;
              ey = nextMain.cy;
              cpx = sx + (ex - sx) * 0.5;
              makePath('M' + sx + ',' + sy + ' C' + cpx + ',' + sy + ' ' + cpx + ',' + ey + ' ' + ex + ',' + ey, successColor, true);

              sx = failBranch.right;
              sy = failBranch.cy;
              makePath('M' + sx + ',' + sy + ' C' + cpx + ',' + sy + ' ' + cpx + ',' + ey + ' ' + ex + ',' + ey, failColor, true);
              makeArrowHead(ex, ey, seqColor);
            }
          } else if (succBranch) {
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
            if (nextMain) {
              sx = main.right; sy = main.cy;
              ex = nextMain.left; ey = nextMain.cy;
              makePath('M' + sx + ',' + sy + ' L' + ex + ',' + ey, seqColor);
              makeArrowHead(ex, ey, seqColor);
            }
          } else if (failBranch) {
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
            if (nextMain) {
              sx = main.right; sy = main.cy;
              ex = nextMain.left; ey = nextMain.cy;
              makePath('M' + sx + ',' + sy + ' L' + ex + ',' + ey, seqColor);
              makeArrowHead(ex, ey, seqColor);
            }
          } else if (nextMain) {
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

      html += '<a class="text-txt-muted no-underline text-[13px] inline-flex items-center gap-1.5 mb-6 cursor-pointer transition-colors hover:text-txt" onclick="window.location.hash=\\'#/\\'">\u2190 Back to Dashboard</a>';

      html += '<div class="flex items-center justify-between mb-8">';
      html += '<div>';
      html += '<div class="font-mono text-xl font-semibold text-accent">' + esc(eventType) + '</div>';
      if (eventInfo && eventInfo.retry) {
        html += '<span class="inline-block text-[11px] py-0.5 px-2 rounded-full font-medium bg-warning-dim text-warning ml-3">' + eventInfo.retry.maxRetries + ' retries</span>';
      }
      html += '</div>';
      html += '</div>';

      html += '<div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-10">';
      html += statCard('Received', metrics.received, 'accent');
      html += statCard('Completed', metrics.completed, 'success');
      html += statCard('Failed', metrics.failed, 'danger');
      html += '</div>';

      document.getElementById('content').innerHTML = html;
    }

    function statCard(label, value, variant) {
      var colorClass = '';
      if (variant === 'accent') colorClass = 'text-accent';
      else if (variant === 'success') colorClass = 'text-success';
      else if (variant === 'danger') colorClass = 'text-danger';
      return '<div class="bg-surface border border-border rounded-[10px] p-5"><div class="text-xs text-txt-muted uppercase tracking-wide">' + label + '</div><div class="text-[32px] font-bold mt-1 ' + colorClass + '">' + value + '</div></div>';
    }

    function workflowCard(wf) {
      let html = '<div class="bg-surface border border-border rounded-[10px] p-6 mb-4">';

      // Identify branch targets
      var branchTargets = new Set();
      var branchMap = {};
      for (var s = 0; s < wf.steps.length; s++) {
        var st = wf.steps[s];
        if (st.onSuccess) { branchTargets.add(st.onSuccess); branchMap[st.type] = branchMap[st.type] || {}; branchMap[st.type].onSuccess = st.onSuccess; }
        if (st.onFailure) { branchTargets.add(st.onFailure); branchMap[st.type] = branchMap[st.type] || {}; branchMap[st.type].onFailure = st.onFailure; }
      }

      // Build main flow
      var mainSteps = [];
      for (var s = 0; s < wf.steps.length; s++) {
        if (!branchTargets.has(wf.steps[s].type)) {
          mainSteps.push(wf.steps[s]);
        }
      }

      function findStep(type) {
        for (var s = 0; s < wf.steps.length; s++) {
          if (wf.steps[s].type === type) return wf.steps[s];
        }
        return null;
      }

      html += '<div class="relative overflow-x-auto py-2" data-flow><div class="grid grid-flow-col grid-rows-[auto_auto_auto] gap-x-10 gap-y-4 items-center relative" data-flow-grid>';

      var gridCol = 1;
      for (var col = 0; col < mainSteps.length; col++) {
        var ms = mainSteps[col];
        var branches = branchMap[ms.type];

        // Main step column
        html += '<div class="invisible min-w-[140px] p-3 px-4" style="grid-row:1;grid-column:' + gridCol + '"></div>';
        html += '<div class="bg-bg border border-border rounded-lg p-3 px-4 min-w-[140px] text-center" data-flow-node data-id="main-' + col + '" style="grid-row:2;grid-column:' + gridCol + '">';
        html += '<div class="font-mono text-xs font-medium">' + esc(ms.type) + '</div>';
        if (ms.retry) html += '<span class="inline-block text-[11px] py-0.5 px-2 rounded-full font-medium bg-warning-dim text-warning">' + ms.retry.maxRetries + ' retries</span>';
        html += '</div>';
        html += '<div class="invisible min-w-[140px] p-3 px-4" style="grid-row:3;grid-column:' + gridCol + '"></div>';

        if (branches && (branches.onSuccess || branches.onFailure)) {
          gridCol++;

          if (branches.onSuccess) {
            var succStep = findStep(branches.onSuccess);
            html += '<div class="bg-bg border border-success rounded-lg p-3 px-4 min-w-[140px] text-center" data-flow-node data-id="branch-success-' + col + '" style="grid-row:1;grid-column:' + gridCol + '">';
            html += '<div class="font-mono text-xs font-medium">' + esc(branches.onSuccess) + '</div>';
            html += '<div class="text-[10px] mt-1 text-success">on success</div>';
            if (succStep && succStep.retry) html += '<span class="inline-block text-[11px] py-0.5 px-2 rounded-full font-medium bg-warning-dim text-warning">' + succStep.retry.maxRetries + ' retries</span>';
            html += '</div>';
          } else {
            html += '<div class="invisible min-w-[140px] p-3 px-4" style="grid-row:1;grid-column:' + gridCol + '"></div>';
          }

          html += '<div class="invisible min-w-[140px] p-3 px-4" style="grid-row:2;grid-column:' + gridCol + '"></div>';

          if (branches.onFailure) {
            var failStep = findStep(branches.onFailure);
            html += '<div class="bg-bg border border-danger rounded-lg p-3 px-4 min-w-[140px] text-center" data-flow-node data-id="branch-failure-' + col + '" style="grid-row:3;grid-column:' + gridCol + '">';
            html += '<div class="font-mono text-xs font-medium">' + esc(branches.onFailure) + '</div>';
            html += '<div class="text-[10px] mt-1 text-danger">on failure</div>';
            if (failStep && failStep.retry) html += '<span class="inline-block text-[11px] py-0.5 px-2 rounded-full font-medium bg-warning-dim text-warning">' + failStep.retry.maxRetries + ' retries</span>';
            html += '</div>';
          } else {
            html += '<div class="invisible min-w-[140px] p-3 px-4" style="grid-row:3;grid-column:' + gridCol + '"></div>';
          }
        }

        gridCol++;
      }

      html += '</div></div>';

      // Workflow-level callbacks
      var hasCallbacks = wf.onComplete || wf.onSuccess || wf.onFailure;
      if (hasCallbacks) {
        html += '<div class="flex gap-3 mt-4 pt-4 border-t border-border flex-wrap">';
        if (wf.onComplete) html += '<span class="text-xs py-1 px-2.5 rounded-md font-mono bg-accent-dim text-accent">onComplete \u2192 ' + esc(wf.onComplete) + '</span>';
        if (wf.onSuccess) html += '<span class="text-xs py-1 px-2.5 rounded-md font-mono bg-success-dim text-success">onSuccess \u2192 ' + esc(wf.onSuccess) + '</span>';
        if (wf.onFailure) html += '<span class="text-xs py-1 px-2.5 rounded-md font-mono bg-danger-dim text-danger">onFailure \u2192 ' + esc(wf.onFailure) + '</span>';
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
