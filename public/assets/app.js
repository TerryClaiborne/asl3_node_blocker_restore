(() => {
  const app = document.getElementById('blockerApp');
  if (!app || app.dataset.initialized === '1') return;
  app.dataset.initialized = '1';

  const csrf = app.dataset.csrf || '';
  const localNode = app.dataset.node || '';

  const $ = (id) => document.getElementById(id);
  const keyedList = $('keyedList');
  const connectedList = $('connectedList');
  const blockedList = $('blockedList');
  const keyedCount = $('keyedCount');
  const connectedCount = $('connectedCount');
  const blockedCount = $('blockedCount');
  const keyedPill = $('keyedPill');
  const connectedPill = $('connectedPill');
  const blockedPill = $('blockedPill');
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

  let busy = false;
  let pending = null;
  let pollTimer = null;

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
      ? `Keyed ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`
      : `Keyed ${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
  };

  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('asl3-blocker-theme', theme); } catch (_) {}
    if (themeButton) {
      themeButton.textContent = theme === 'dark' ? '☀' : theme === 'light' ? '☾' : '◐';
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
    const canDisconnect = Boolean(link?.disconnectable)
      && /^[A-Za-z0-9_.:-]{1,64}$/.test(node);
    const canBlock = Boolean(link?.blockable ?? link?.actionable)
      && /^[0-9]{4,7}$/.test(node);

    if (!canDisconnect && !canBlock) {
      return '<span class="not-actionable">Display only</span>';
    }

    const buttons = [];
    if (canDisconnect) {
      buttons.push(`<button class="button ghost small disconnect-node" type="button" data-node="${escapeHtml(node)}">Disconnect</button>`);
    }
    if (canBlock) {
      buttons.push(`<button class="button danger small block-node" type="button" data-node="${escapeHtml(node)}">Disconnect &amp; Block</button>`);
    }

    return `<div class="row-actions">${buttons.join('')}</div>`;
  };

  const keyedRow = (link) => `
    <div class="node-row is-keyed">
      <div class="node-copy">
        <div class="node-title-line">
          <strong class="node-number">${escapeHtml(link.node)}</strong>
          <span class="keyed-badge">KEYED</span>
        </div>
        <span class="node-meta">${escapeHtml(formatSeconds(link.keyed_seconds))} · ${escapeHtml(link.mode_label || 'Connected')}</span>
      </div>
      ${connectionActions(link)}
    </div>`;

  const connectedRow = (link) => `
    <div class="node-row ${link.keyed ? 'is-keyed' : ''}">
      <div class="node-copy">
        <div class="node-title-line">
          <strong class="node-number">${escapeHtml(link.node)}</strong>
          ${link.keyed ? '<span class="keyed-badge">KEYED</span>' : ''}
        </div>
        <span class="node-meta">${escapeHtml(link.keyed ? formatSeconds(link.keyed_seconds) : (link.mode_label || 'Connected'))}</span>
      </div>
      ${connectionActions(link)}
    </div>`;

  const blockedRow = (item) => `
    <div class="node-row">
      <div class="node-copy">
        <strong class="node-number">${escapeHtml(item.node)}</strong>
        <span class="node-meta">${escapeHtml(item.reason || 'Blocked')}</span>
      </div>
      <button class="button success small restore-node" type="button" data-node="${escapeHtml(item.node)}">
        Restore
      </button>
    </div>`;

  const render = (data) => {
    const connections = Array.isArray(data.connections) ? data.connections : [];
    const keyed = Array.isArray(data.keyed) ? data.keyed : connections.filter((link) => link.keyed);
    const blocked = Array.isArray(data.blocked) ? data.blocked : [];

    keyedCount.textContent = String(keyed.length);
    connectedCount.textContent = String(connections.length);
    blockedCount.textContent = String(blocked.length);
    keyedPill.textContent = String(keyed.length);
    connectedPill.textContent = String(connections.length);
    blockedPill.textContent = String(blocked.length);

    keyedList.innerHTML = keyed.length
      ? keyed.map(keyedRow).join('')
      : '<div class="empty-state good-state">No connected node is keyed.</div>';

    connectedList.innerHTML = connections.length
      ? connections.map(connectedRow).join('')
      : '<div class="empty-state">No other nodes are connected.</div>';

    blockedList.innerHTML = blocked.length
      ? blocked.map(blockedRow).join('')
      : '<div class="empty-state">No nodes are blocked.</div>';

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
    }
  };

  const openConfirm = (action, target, reason = '') => {
    pending = { action, target, reason };
    confirmReason.value = reason;

    if (action === 'block') {
      confirmMessage.textContent = `Disconnect node ${target} now and block it from reconnecting?`;
      reasonWrap.classList.remove('hidden');
      confirmGo.textContent = 'Disconnect & Block';
      confirmGo.className = 'button danger';
    } else if (action === 'disconnect') {
      confirmMessage.textContent = `Disconnect ${target} now without blocking it?`;
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

  const doAction = async (action, target, reason = '') => {
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
      showNotice(data.ok ? 'success' : 'error', data.message || 'Action failed.');
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
      openConfirm('disconnect', disconnect.dataset.node || '');
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

  keyedList.addEventListener('click', listClick);
  connectedList.addEventListener('click', listClick);
  blockedList.addEventListener('click', listClick);

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

    closeConfirm();
    await doAction(action, target, reason);
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
      }
    } catch (_) {
      // Update lookup is intentionally non-critical.
    }
  };

  check();
})();
