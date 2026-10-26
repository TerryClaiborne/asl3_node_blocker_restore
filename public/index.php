<?php
declare(strict_types=1);
session_start();

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/auth.php';

$cfg = blocker_config();
$node = blocker_node();
$authEnabled = auth_enabled($cfg);
auth_require_if_enabled($cfg);
$version = trim((string)@file_get_contents(dirname(__DIR__) . '/VERSION'));
$repoUrl = 'https://github.com/TerryClaiborne/asl3_node_blocker_restore';
$remoteVersionUrl = 'https://raw.githubusercontent.com/TerryClaiborne/asl3_node_blocker_restore/main/VERSION';
?>
<!doctype html>
<html lang="en" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>ASL3 Node Blocker &amp; Restore</title>
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<main class="shell" id="blockerApp"
      data-csrf="<?= h(csrf_token()) ?>"
      data-node="<?= h($node) ?>">

  <header class="topbar">
    <a class="brand" id="branding-title"
       href="<?= h($repoUrl) ?>"
       target="_blank"
       rel="noopener noreferrer"
       aria-label="Open the ASL3 Node Blocker &amp; Restore repository"
       data-local-version="<?= h($version) ?>"
       data-version-url="<?= h($remoteVersionUrl) ?>"
       title="ASL3 Node Blocker &amp; Restore v<?= h($version) ?>">
      <div class="brand-mark" aria-hidden="true">
        <svg class="brand-star-svg" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
          <path class="star-outline" d="M36 4 44 25 67 26 49 40 55 64 36 51 17 64 23 40 5 26 28 25Z"/>
          <path class="star-wave wave-one" d="M19 31c5-6 10-6 15 0s10 6 15 0"/>
          <path class="star-wave wave-two" d="M16 39c7-8 14-8 21 0s14 8 21 0"/>
          <circle class="star-center" cx="36" cy="35" r="3.5"/>
        </svg>
      </div>
      <div class="brand-copy">
        <h1>ASL3 Node Blocker &amp; Restore</h1>
        <p class="subtitle">See who is keyed, disconnect and block them, then restore access later.</p>
      </div>
    </a>
    <div class="top-actions">
      <div class="live-badge" title="Updates automatically">
        <span class="live-dot" aria-hidden="true"></span>
        <span id="liveText">Live</span>
      </div>
      <button class="icon-button" id="themeButton" type="button" aria-label="Change theme" title="Change theme">◐</button>
      <?php if ($authEnabled): ?><a class="button ghost small" href="logout.php">Logout</a><?php endif; ?>
    </div>
  </header>

  <section class="summary-bar" aria-label="Node summary">
    <div class="summary-item">
      <span>Your node</span>
      <strong id="localNode"><?= h($node !== '' ? $node : '—') ?></strong>
    </div>
    <div class="summary-item">
      <span>Keyed</span>
      <strong id="keyedCount">—</strong>
    </div>
    <div class="summary-item">
      <span>Connected</span>
      <strong id="connectedCount">—</strong>
    </div>
    <div class="summary-item">
      <span>Blocked</span>
      <strong id="blockedCount">—</strong>
    </div>
  </section>

  <div id="noticeArea" class="notice-area" aria-live="polite"></div>
  <div id="allowlistWarning" class="notice warning hidden">
    <strong>Allowlist detected.</strong>
    <span id="allowlistText"></span>
  </div>
  <div id="statusWarning" class="notice error hidden"></div>

  <section class="panel-grid">
    <article class="card keyed-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow danger-label">Priority</p>
          <h2>Keyed Now</h2>
        </div>
        <span class="count-pill danger-pill" id="keyedPill">0</span>
      </div>
      <p class="section-help">Keyed connections appear here first so a stuck transmitter is easy to find.</p>
      <div id="keyedList" class="node-list">
        <div class="empty-state">Checking keyed activity…</div>
      </div>
    </article>

    <article class="card connected-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Live links</p>
          <h2>Connected Nodes</h2>
        </div>
        <span class="count-pill" id="connectedPill">0</span>
      </div>
      <p class="section-help">All direct connections to your node. Keyed rows are highlighted.</p>
      <div id="connectedList" class="node-list">
        <div class="empty-state">Checking current connections…</div>
      </div>
    </article>

    <article class="card blocked-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow restore-label">Restore</p>
          <h2>Blocked Nodes</h2>
        </div>
        <span class="count-pill" id="blockedPill">0</span>
      </div>
      <p class="section-help">Restore Access removes the denylist entry. The remote node may then connect again.</p>
      <div id="blockedList" class="node-list">
        <div class="empty-state">Checking blocked nodes…</div>
      </div>
    </article>
  </section>

  <details class="card manual-card">
    <summary>
      <span class="manual-summary-title">Block a Node by Number</span>
      <span class="manual-summary-note">For a node that is not currently connected</span>
    </summary>
    <form id="manualBlockForm" class="manual-form">
      <label class="field">
        <span>Node</span>
        <input type="text" name="target" inputmode="numeric" pattern="[0-9]{4,7}"
               maxlength="7" autocomplete="off" placeholder="67565" required>
      </label>
      <label class="field">
        <span>Reason <small>(optional)</small></span>
        <input type="text" name="reason" maxlength="80" autocomplete="off"
               placeholder="Stuck keyed, loop, temporary block…">
      </label>
      <button class="button danger" type="submit">Disconnect &amp; Block</button>
    </form>
  </details>

  <footer>
    <span>v<?= h($version) ?></span>
    <span>Live status updates automatically.</span>
  </footer>
</main>

<div class="dialog-backdrop hidden" id="confirmDialog" role="presentation">
  <div class="confirm-card" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
    <h2 id="confirmTitle">Confirm action</h2>
    <p id="confirmMessage"></p>
    <label class="field hidden" id="reasonWrap">
      <span>Reason <small>(optional)</small></span>
      <input type="text" id="confirmReason" maxlength="80" autocomplete="off"
             placeholder="Stuck keyed, loop, temporary block…">
    </label>
    <div class="confirm-actions">
      <button class="button ghost" type="button" id="confirmCancel">Cancel</button>
      <button class="button danger" type="button" id="confirmGo">Continue</button>
    </div>
  </div>
</div>

<script src="assets/app.js"></script>
</body>
</html>
