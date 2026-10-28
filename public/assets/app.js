(() => {
  const app = document.getElementById('blockerApp');
  if (!app || app.dataset.initialized === '1') return;
  app.dataset.initialized = '1';

  const csrf = app.dataset.csrf || '';
  const localNode = app.dataset.node || '';
  const $ = (id) => document.getElementById(id);

  const livePanel = $('livePanel');
  const blockedPanel = $('blockedPanel');
  const liveList = $('liveList');
  const blockedList = $('blockedList');
  const allCount = $('allCount');
  const keyedCount = $('keyedCount');
  const connectedCount = $('connectedCount');
  const blockedCount = $('blockedCount');
  const liveHeading = $('liveHeading');
  const lastUpdate = $('lastUpdate');
  const noticeArea = $('noticeArea');
  const allowlistWarning = $('allowlistWarning');
  const allowlistText = $('allowlistText');
  const statusWarning = $('statusWarning');
  const liveText = $('liveText');
  const themeButton = $('themeButton');
  const dialog = $('confirmDialog');
  const confirmMessage = $('confirmMessage');
  const reasonWrap = $('reasonWrap');
  const confirmReason = $('confirmReason');
  const confirmCancel = $('confirmCancel');
  const confirmGo = $('confirmGo');
  const manualForm = $('manualBlockForm');
  const filterButtons = [...document.querySelectorAll('.filter-button')];

  let busy = false;
  let pending = null;
  let pollTimer = null;
  let currentFilter = 'all';
  let snapshot = { connections: [], keyed: [], blocked: [] };

  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const formatSeconds = (value) => {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) return 'Keyed now';
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
      : `${m}:${String(r).padStart(2, '0')}`;
  };

  const modeShort = (link) => {
    const label = String(link?.mode_label || '').toLowerCase();
    const type = String(link?.connection_type || '').toLowerCase();
    if (type === 'echolink' || label.includes('echolink')) return 'EchoLink';
    if (label.includes('web transceiver') || type === 'client') return 'WT';
    return 'NODE';
  };

  const modeClass = (mode) => mode === 'WT'
    ? 'mode-wt'
    : mode === 'EchoLink'
      ? 'mode-echolink'
      : 'mode-node';

  const activityText = (link) => {
    if (link?.keyed) return `Keyed ${formatSeconds(link.keyed_seconds)}`;
    const elapsed = String(link?.elapsed || '').trim();
    return elapsed || 'Connected';
  };

  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('asl3-blocker-theme', theme); } catch (_) {}
    if (themeButton) {
      themeButton.dataset.theme = theme;
      themeButton.title = `Theme: ${theme}`;
    }
  };

  let theme = 'auto';
  try { theme = localStorage.getItem('asl3-blocker-theme') || 'auto'; } catch (_) {}
  applyTheme(theme);

  themeButton?.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'auto';
    applyTheme(current === 'auto' ? 'dark' : current === 'dark' ? 'light' : 'auto');
  });

  const showNotice = (kind, message) => {
    noticeArea.innerHTML = `<div class="notice ${kind}">${escapeHtml(message)}</div>`;
    window.setTimeout(() => {
      if (noticeArea.textContent?.includes(message)) noticeArea.innerHTML = '';
    }, 5000);
  };

  const connectionActions = (link) => {
    const node = String(link?.node || '');
    const displayNode = String(link?.display_node || node);
    const canDisconnect = Boolean(link?.disconnectable)
      && /^[A-Za-z0-9_.:-]{1,64}$/.test(node);
    const canBlock = Boolean(link?.blockable ?? link?.actionable)
      && /^[0-9]{4,7}$/.test(node);

    if (!canDisconnect && !canBlock) {
      return '<span class="not-actionable">Display only</span>';
    }

    const buttons = [];
    if (canBlock) {
      buttons.push(`<button class="button danger small block-node" type="button" data-node="${escapeHtml(node)}">Block</button>`);
    }
    if (canDisconnect) {
      buttons.push(`<button class="button ghost small disconnect-node" type="button" data-node="${escapeHtml(node)}" data-display="${escapeHtml(displayNode)}">Disconnect</button>`);
    }

    return `<div class="row-actions ${buttons.length === 1 ? 'single-action' : ''}">${buttons.join('')}</div>`;
  };

  const linkRow = (link) => {
    const displayNode = String(link?.display_node || link?.node || 'Unknown');
    const mode = modeShort(link);
    const status = link?.keyed ? 'KEYED' : 'CONNECTED';
    const statusClass = link?.keyed ? 'status-keyed' : 'status-connected';

    const echoCallsign = mode === 'EchoLink'
      ? String(link?.callsign || '').trim()
      : '';

    const echoNode = mode === 'EchoLink'
      ? String(link?.echolink_node || link?.display_node || '').trim()
      : '';

    const nodeCallsign = mode === 'NODE'
      ? String(link?.callsign || '').trim()
      : '';

    const primaryIdentity = mode === 'EchoLink' && echoCallsign
      ? echoCallsign
      : displayNode;

    const primaryIdentityHtml = mode === 'NODE' && nodeCallsign
      ? `${escapeHtml(displayNode)} <span class="node-call-dot" aria-hidden="true">•</span> ${escapeHtml(nodeCallsign)}`
      : escapeHtml(primaryIdentity);

    const detail = mode === 'EchoLink'
      ? (echoNode ? `EchoLink ${echoNode}` : 'EchoLink connection')
      : mode === 'WT'
        ? 'Web Transceiver'
        : String(link?.mode_label || 'AllStar node');

    return `
      <div class="link-row ${link?.keyed ? 'is-keyed' : ''}">
        <div class="status-cell ${statusClass}">
          <span class="status-dot" aria-hidden="true"></span>
          <strong>${status}</strong>
        </div>
        <div class="identity-cell">
          <strong class="node-number">${primaryIdentityHtml}</strong>
          <span class="node-meta">${escapeHtml(detail)}</span>
        </div>
        <div class="mode-cell">
          <span class="mode-badge ${modeClass(mode)}">${escapeHtml(mode)}</span>
        </div>
        <div class="activity-cell">${escapeHtml(activityText(link))}</div>
        <div class="actions-cell">${connectionActions(link)}</div>
      </div>`;
  };

  const blockedRow = (item) => `
    <div class="blocked-row">
      <div class="identity-cell">
        <strong class="node-number">${escapeHtml(item.node)}</strong>
        <span class="node-meta">${escapeHtml(item.reason || 'Blocked')}</span>
      </div>
      <span class="blocked-status">BLOCKED</span>
      <button class="button success small restore-node" type="button" data-node="${escapeHtml(item.node)}">Restore</button>
    </div>`;

  const sortConnections = (connections) => [...connections].sort((a, b) => {
    const keyedDelta = Number(Boolean(b?.keyed)) - Number(Boolean(a?.keyed));
    if (keyedDelta !== 0) return keyedDelta;
    return String(a?.display_node || a?.node || '').localeCompare(String(b?.display_node || b?.node || ''), undefined, { numeric: true });
  });

  const setFilter = (filter) => {
    currentFilter = ['all', 'keyed', 'connected', 'blocked'].includes(filter) ? filter : 'all';
    filterButtons.forEach((button) => {
      const active = button.dataset.filter === currentFilter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    renderLists();
  };

  const renderLists = () => {
    const connections = sortConnections(Array.isArray(snapshot.connections) ? snapshot.connections : []);
    const blocked = Array.isArray(snapshot.blocked) ? snapshot.blocked : [];

    if (currentFilter === 'blocked') {
      livePanel.classList.add('hidden');
      blockedPanel.classList.remove('hidden');
      blockedList.innerHTML = blocked.length
        ? blocked.map(blockedRow).join('')
        : '<div class="empty-state good-state">No nodes are blocked.</div>';
      return;
    }

    livePanel.classList.remove('hidden');
    blockedPanel.classList.add('hidden');

    let visible = connections;
    if (currentFilter === 'keyed') visible = connections.filter((link) => Boolean(link?.keyed));
    if (currentFilter === 'connected') visible = connections.filter((link) => !link?.keyed);

    liveHeading.textContent = currentFilter === 'keyed'
      ? 'Keyed Now'
      : currentFilter === 'connected'
        ? 'Connected / Not Keyed'
        : 'All Connections';

    liveList.innerHTML = visible.length
      ? visible.map(linkRow).join('')
      : `<div class="empty-state good-state">${currentFilter === 'keyed' ? 'No connected node is keyed.' : 'No matching live connections.'}</div>`;
  };

  const render = (data) => {
    const connections = Array.isArray(data.connections) ? data.connections : [];
    const keyed = Array.isArray(data.keyed) ? data.keyed : connections.filter((link) => link.keyed);
    const blocked = Array.isArray(data.blocked) ? data.blocked : [];
    const notKeyed = Math.max(0, connections.length - keyed.length);

    snapshot = { connections, keyed, blocked };
    allCount.textContent = String(connections.length);
    keyedCount.textContent = String(keyed.length);
    connectedCount.textContent = String(notKeyed);
    blockedCount.textContent = String(blocked.length);

    renderLists();

    const allowCount = Number(data.allowlistCount || 0);
    if (allowCount > 0) {
      allowlistText.textContent = `This node has ${allowCount} allowlist ${allowCount === 1 ? 'entry' : 'entries'}. Review that policy because it can supersede denylist behavior.`;
      allowlistWarning.classList.remove('hidden');
    } else {
      allowlistWarning.classList.add('hidden');
    }

    if (data.statusError) {
      statusWarning.textContent = `Live keyed status: ${data.statusError}`;
      statusWarning.classList.remove('hidden');
    } else {
      statusWarning.classList.add('hidden');
    }

    liveText.textContent = 'Live';
    if (lastUpdate) lastUpdate.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
  };

  const refreshStatus = async () => {
    if (busy) return;
    try {
      const response = await fetch(`status.php?_=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });

      if (response.status === 401) {
        window.location.href = 'login.php';
        return;
      }

      const data = await response.json();
      render(data);
    } catch (_) {
      liveText.textContent = 'Retrying';
      if (lastUpdate) lastUpdate.textContent = 'Live status retrying…';
    }
  };

  const openConfirm = (action, target, reason = '', displayTarget = '') => {
    pending = { action, target, reason, displayTarget };
    confirmReason.value = reason;
    const visibleTarget = displayTarget || target;

    if (action === 'block') {
      confirmMessage.textContent = `Disconnect node ${target} now and block it from reconnecting?`;
      reasonWrap.classList.remove('hidden');
      confirmGo.textContent = 'Block Node';
      confirmGo.className = 'button danger';
    } else if (action === 'disconnect') {
      confirmMessage.textContent = `Disconnect ${visibleTarget} now without blocking it?`;
      reasonWrap.classList.add('hidden');
      confirmGo.textContent = 'Disconnect Only';
      confirmGo.className = 'button ghost';
    } else {
      confirmMessage.textContent = `Restore access for node ${target}?`;
      reasonWrap.classList.add('hidden');
      confirmGo.textContent = 'Restore Access';
      confirmGo.className = 'button success';
    }

    dialog.classList.remove('hidden');
    confirmGo.focus();
  };

  const closeConfirm = () => {
    dialog.classList.add('hidden');
    pending = null;
  };

  const doAction = async (action, target, reason = '', displayTarget = '') => {
    busy = true;
    liveText.textContent = 'Updating';

    try {
      const response = await fetch('action.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Accept: 'application/json'
        },
        body: new URLSearchParams({ csrf, action, target, reason })
      });

      if (response.status === 401) {
        window.location.href = 'login.php';
        return;
      }

      const data = await response.json();
      let message = data.message || 'Action failed.';

      if (data.ok
          && action === 'disconnect'
          && /^\d{1,6}$/.test(displayTarget)
          && displayTarget !== target) {
        message = `EchoLink ${displayTarget} was disconnected. It was not blocked.`;
      }

      showNotice(data.ok ? 'success' : 'error', message);
    } catch (_) {
      showNotice('error', 'The request could not be completed.');
    } finally {
      busy = false;
      await refreshStatus();
    }
  };

  const listClick = (event) => {
    const disconnect = event.target.closest('.disconnect-node');
    if (disconnect) {
      openConfirm('disconnect', disconnect.dataset.node || '', '', disconnect.dataset.display || '');
      return;
    }

    const block = event.target.closest('.block-node');
    if (block) {
      openConfirm('block', block.dataset.node || '');
      return;
    }

    const restore = event.target.closest('.restore-node');
    if (restore) {
      openConfirm('restore', restore.dataset.node || '');
    }
  };

  liveList.addEventListener('click', listClick);
  blockedList.addEventListener('click', listClick);
  filterButtons.forEach((button) => button.addEventListener('click', () => setFilter(button.dataset.filter || 'all')));

  manualForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(manualForm);
    const target = String(data.get('target') || '').trim();
    const reason = String(data.get('reason') || '').trim();

    if (!/^[0-9]{4,7}$/.test(target)) {
      showNotice('error', 'Enter a valid 4 to 7 digit AllStar node number.');
      return;
    }
    if (target === localNode) {
      showNotice('error', 'You cannot block your own node.');
      return;
    }

    openConfirm('block', target, reason);
  });

  confirmCancel.addEventListener('click', closeConfirm);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeConfirm();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dialog.classList.contains('hidden')) closeConfirm();
  });

  confirmGo.addEventListener('click', async () => {
    if (!pending) return;

    const action = pending.action;
    const target = pending.target;
    const reason = action === 'block' ? confirmReason.value.trim() : '';
    const displayTarget = pending.displayTarget || '';

    closeConfirm();
    await doAction(action, target, reason, displayTarget);
    manualForm?.reset();
  });

  refreshStatus();
  pollTimer = window.setInterval(refreshStatus, 1000);

  window.addEventListener('pagehide', () => {
    if (pollTimer) window.clearInterval(pollTimer);
  }, { once: true });
})();

// GitHub version check. Failure is silent and never affects Blocker operation.
(() => {
  'use strict';

  const parseVersion = (value) => {
    const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)/i);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  };

  const newer = (remote, local) => {
    const a = parseVersion(remote);
    const b = parseVersion(local);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i += 1) {
      if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
  };

  const check = async () => {
    const brand = document.getElementById('branding-title');
    if (!brand) return;

    const local = String(brand.dataset.localVersion || '').trim();
    const url = String(brand.dataset.versionUrl || '').trim();

    if (local) brand.title = `ASL3 Node Blocker & Restore v${local}`;
    if (!local || !url) return;

    try {
      const response = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (!response.ok) return;

      const remote = String(await response.text()).trim();
      if (newer(remote, local)) {
        brand.classList.add('has-update');
        brand.title = `ASL3 Node Blocker & Restore v${local} → v${remote} update available`;
        brand.setAttribute('aria-label', `Open repository. Update available: v${local} to v${remote}.`);
      }
    } catch (_) {
      // Silent by design.
    }
  };

  check();
  window.setInterval(check, 15 * 60 * 1000);
})();
