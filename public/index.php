<?php
declare(strict_types=1);
session_start();

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/auth.php';

$cfg = blocker_config();
$node = blocker_node();
$authEnabled = auth_enabled($cfg);
auth_require_if_enabled($cfg);
$appearance = blocker_appearance();
$appearanceStyle = blocker_appearance_style($appearance);
$version = trim((string)@file_get_contents(dirname(__DIR__) . '/VERSION'));
$repoUrl = 'https://github.com/TerryClaiborne/asl3_node_blocker_restore';
$remoteVersionUrl = 'https://raw.githubusercontent.com/TerryClaiborne/asl3_node_blocker_restore/main/VERSION';
?>
<!doctype html>
<html lang="en"
      data-theme="<?= h((string)$appearance['theme']) ?>"
      data-palette="<?= h((string)$appearance['mode']) ?>"<?= $appearanceStyle !== '' ? ' style="' . h($appearanceStyle) . '"' : '' ?>>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>ASL3 Node Blocker &amp; Restore</title>
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<script type="application/json" id="blockerAppearance"><?= json_encode(
    $appearance,
    JSON_UNESCAPED_SLASHES
    | JSON_HEX_TAG
    | JSON_HEX_AMP
    | JSON_HEX_APOS
    | JSON_HEX_QUOT
) ?></script>
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
        <h1>ASL3 Node Blocker</h1>
        <p class="subtitle">Node <?= h($node !== '' ? $node : '—') ?> · Live link control</p>
      </div>
    </a>

    <div class="top-actions">
      <button class="theme-button" id="themeButton" type="button" aria-label="Change theme" title="Change theme">
        <span class="theme-wide">Light / Dark</span><span class="theme-compact">◐</span>
      </button>

        <details class="color-menu" id="colorMenu">
          <summary class="theme-button color-button"
                   title="Color settings"
                   aria-label="Color settings">
            <span class="color-wide">Colors</span>
            <span class="color-compact">🎨</span>
          </summary>

          <div class="color-popover">

            <div id="colorMainPanel">

              <label class="color-field">
                <span>Preset</span>
                <select id="colorPreset">
                  <option value="default">Default</option>
                  <option value="custom">Advanced…</option>
                </select>
              </label>

              <div class="advanced-fields"
                   id="customColorFields"
                   hidden>

                <button class="advanced-color-button"
                        data-color-target="background"
                        type="button"
                        title="Page background behind the cards and panels."
                        aria-label="Page background behind the cards and panels.">
                  <span>Background</span>
                  <span class="color-value">
                    <span class="color-swatch"
                          id="swatchBackground"></span>
                    <code id="valueBackground"></code>
                  </span>
                </button>

                <button class="advanced-color-button"
                        data-color-target="foreground"
                        type="button"
                        title="Cards, panels, menus, and table surfaces."
                        aria-label="Cards, panels, menus, and table surfaces.">
                  <span>Foreground / Cards</span>
                  <span class="color-value">
                    <span class="color-swatch"
                          id="swatchForeground"></span>
                    <code id="valueForeground"></code>
                  </span>
                </button>

                <button class="advanced-color-button"
                        data-color-target="text"
                        type="button"
                        title="Primary titles, callsigns, values, and normal text."
                        aria-label="Primary titles, callsigns, values, and normal text.">
                  <span>Text</span>
                  <span class="color-value">
                    <span class="color-swatch"
                          id="swatchText"></span>
                    <code id="valueText"></code>
                  </span>
                </button>

                <button class="advanced-color-button"
                        data-color-target="secondary"
                        type="button"
                        title="Descriptions, Node Transceiver, elapsed time, and other detail text."
                        aria-label="Descriptions, Node Transceiver, elapsed time, and other detail text.">
                  <span>Secondary Text</span>
                  <span class="color-value">
                    <span class="color-swatch"
                          id="swatchSecondary"></span>
                    <code id="valueSecondary"></code>
                  </span>
                </button>

                <button class="advanced-color-button"
                        data-color-target="headings"
                        type="button"
                        title="STATUS, NODE / STATION, MODE, ACTIVITY, and ACTIONS headings."
                        aria-label="STATUS, NODE / STATION, MODE, ACTIVITY, and ACTIONS headings.">
                  <span>Table Headings</span>
                  <span class="color-value">
                    <span class="color-swatch"
                          id="swatchHeadings"></span>
                    <code id="valueHeadings"></code>
                  </span>
                </button>

                <button class="advanced-color-button"
                        data-color-target="accent"
                        type="button"
                        title="Buttons, selected items, highlights, and focus accents."
                        aria-label="Buttons, selected items, highlights, and focus accents.">
                  <span>Accent</span>
                  <span class="color-value">
                    <span class="color-swatch"
                          id="swatchAccent"></span>
                    <code id="valueAccent"></code>
                  </span>
                </button>

              </div>

              <p class="color-message" id="colorMessage">
                Default restores the built-in theme. Advanced edits the current Light or Dark theme.
              </p>

              <div class="color-actions">
                <button class="button primary small"
                        id="applyColors"
                        type="button">
                  Apply
                </button>

                <button class="button ghost small"
                        id="resetColors"
                        type="button">
                  Reset
                </button>
              </div>

            </div>

            <div id="colorEditor"
                 class="color-editor"
                 hidden>

              <div class="color-editor-title"
                   id="colorEditorTitle">
                Choose Color
              </div>

              <button class="color-editor-preview"
                      id="colorEditorPreview"
                      type="button"
                      title="Choose a starting color"
                      aria-label="Choose a starting color"></button>

              <div class="quick-color-palette"
                   id="quickColorPalette"
                   hidden
                   aria-label="Starting colors">

                <button type="button"
                        class="quick-color-swatch"
                        data-quick-color="#000000"
                        title="Black"></button>

                <button type="button"
                        class="quick-color-swatch"
                        data-quick-color="#FFFFFF"
                        title="White"></button>

                <button type="button"
                        class="quick-color-swatch"
                        data-quick-color="#808080"
                        title="Gray"></button>

                <button type="button"
                        class="quick-color-swatch"
                        data-quick-color="#C62828"
                        title="Red"></button>

                <button type="button"
                        class="quick-color-swatch"
                        data-quick-color="#E67E22"
                        title="Orange"></button>

                <button type="button"
                        class="quick-color-swatch"
                        data-quick-color="#F1C40F"
                        title="Yellow"></button>

                <button type="button"
                        class="quick-color-swatch"
                        data-quick-color="#2E7D32"
                        title="Green"></button>

                <button type="button"
                        class="quick-color-swatch"
                        data-quick-color="#00897B"
                        title="Teal"></button>

                <button type="button"
                        class="quick-color-swatch"
                        data-quick-color="#00ACC1"
                        title="Cyan"></button>

                <button type="button"
                        class="quick-color-swatch"
                        data-quick-color="#1565C0"
                        title="Blue"></button>

                <button type="button"
                        class="quick-color-swatch"
                        data-quick-color="#6A1B9A"
                        title="Purple"></button>

                <button type="button"
                        class="quick-color-swatch"
                        data-quick-color="#C2185B"
                        title="Magenta"></button>

              </div>

              <div class="quick-color-help">
                Tap the large color block for a starting color,
                then fine-tune it below.
              </div>

              <label class="slider-field">
                <span>Hue</span>
                <input id="colorHue"
                       type="range"
                       min="0"
                       max="360"
                       step="1">
              </label>

              <label class="slider-field">
                <span>Saturation</span>
                <input id="colorSaturation"
                       type="range"
                       min="0"
                       max="100"
                       step="1">
              </label>

              <label class="slider-field">
                <span>Brightness</span>
                <input id="colorBrightness"
                       type="range"
                       min="0"
                       max="100"
                       step="1">
              </label>

              <label class="color-field">
                <span>Hex</span>
                <input id="colorHex"
                       type="text"
                       maxlength="7"
                       autocomplete="off"
                       spellcheck="false">
              </label>

              <div class="color-actions">
                <button class="button primary small"
                        id="useColor"
                        type="button">
                  Use Color
                </button>

                <button class="button ghost small"
                        id="cancelColor"
                        type="button">
                  Cancel
                </button>
              </div>

            </div>

          </div>
        </details>
      <?php if ($authEnabled): ?><a class="button ghost small logout-button" href="logout.php">Logout</a><?php endif; ?>
    </div>
  </header>

  <nav class="filter-bar" aria-label="Connection view">
    <button class="filter-button is-active" type="button" data-filter="all" aria-pressed="true">
      <span>All</span><strong id="allCount">—</strong>
    </button>
    <button class="filter-button filter-keyed" type="button" data-filter="keyed" aria-pressed="false">
      <span>Keyed</span><strong id="keyedCount">—</strong>
    </button>
    <button class="filter-button filter-connected" type="button" data-filter="connected" aria-pressed="false">
      <span>Connected</span><strong id="connectedCount">—</strong>
    </button>
    <button class="filter-button filter-blocked" type="button" data-filter="blocked" aria-pressed="false">
      <span>Blocked</span><strong id="blockedCount">—</strong>
    </button>
  </nav>

  <div id="noticeArea" class="notice-area" aria-live="polite"></div>
  <div id="allowlistWarning" class="notice warning hidden">
    <strong>Allowlist detected.</strong>
    <span id="allowlistText"></span>
  </div>
  <div id="statusWarning" class="notice error hidden"></div>

  <article class="card live-panel" id="livePanel">
    <div class="section-heading live-heading">
      <div>
        <p class="eyebrow">Live links</p>
        <h2 id="liveHeading">All Connections</h2>
      </div>
      <div class="live-meta">
        <span class="live-dot" aria-hidden="true"></span>
        <span id="lastUpdate">Waiting for live data…</span>
      </div>
    </div>

    <div class="link-table-head" aria-hidden="true">
      <span>Status</span>
      <span>Node / Station</span>
      <span>Mode</span>
      <span>Activity</span>
      <span>Actions</span>
    </div>

    <div id="liveList" class="link-list">
      <div class="empty-state">Checking current connections…</div>
    </div>
  </article>

  <article class="card blocked-panel hidden" id="blockedPanel">
    <div class="section-heading">
      <div>
        <p class="eyebrow restore-label">Restore</p>
        <h2>Blocked Nodes</h2>
      </div>
      <span class="blocked-note">Only numeric AllStar nodes can be blocked.</span>
    </div>
    <div id="blockedList" class="blocked-list">
      <div class="empty-state">Checking blocked nodes…</div>
    </div>
  </article>

  <details class="card manual-card">
    <summary>
      <span class="manual-summary-title">Block a Node by Number</span>
      <span class="manual-summary-note">For a numeric AllStar node that is not currently connected</span>
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
      <button class="button danger" type="submit">Block Node</button>
    </form>
  </details>

  <footer>
    <span>v<?= h($version) ?> · Node <?= h($node !== '' ? $node : '—') ?></span>
    <span>Live status updates every second.</span>
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
