<?php
declare(strict_types=1);
session_start();
require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/auth.php';

$cfg = blocker_config();
if (!auth_enabled($cfg)) {
    header('Location: ./', true, 303);
    exit;
}
if (auth_logged_in()) {
    header('Location: ./', true, 303);
    exit;
}

$appearance = blocker_appearance();
$appearanceStyle = blocker_appearance_style($appearance);

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_valid((string)($_POST['csrf'] ?? ''))) {
        $error = 'Please reload the page and try again.';
    } else {
        $password = (string)($_POST['password'] ?? '');
        $hash = trim((string)($cfg['ASL3_BLOCKER_ADMIN_PASSWORD_HASH'] ?? ''), "\"' \t\r\n");
        if ($hash !== '' && password_verify($password, $hash)) {
            session_regenerate_id(true);
            $_SESSION['asl3_blocker_admin'] = true;
            header('Location: ./', true, 303);
            exit;
        }
        usleep(500000);
        $error = 'Incorrect password.';
    }
}
?>
<!doctype html>
<html lang="en"
      data-theme="<?= h((string)$appearance['theme']) ?>"
      data-palette="<?= h((string)$appearance['mode']) ?>"<?= $appearanceStyle !== '' ? ' style="' . h($appearanceStyle) . '"' : '' ?>>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Login — ASL3 Node Blocker and Restore</title>
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<main class="shell shell-narrow">
  <section class="hero compact">
    <div class="brand-mark" aria-hidden="true">
      <svg class="brand-star-svg" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
          <path class="star-outline" d="M36 4 44 25 67 26 49 40 55 64 36 51 17 64 23 40 5 26 28 25Z"/>
          <path class="star-wave wave-one" d="M19 31c5-6 10-6 15 0s10 6 15 0"/>
          <path class="star-wave wave-two" d="M16 39c7-8 14-8 21 0s14 8 21 0"/>
          <circle class="star-center" cx="36" cy="35" r="3.5"/>
        </svg>
    </div>
    <div>
      <p class="eyebrow">ASL3 utility</p>
      <h1>Node Blocker &amp; Restore</h1>
      <p class="subtitle">Administrator login</p>
    </div>
  </section>

  <section class="card">
    <?php if ($error !== ''): ?><div class="notice error"><?= h($error) ?></div><?php endif; ?>
    <form method="post" class="stack">
      <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
      <label class="field">
        <span>Password</span>
        <input type="password" name="password" autocomplete="current-password" autofocus required>
      </label>
      <button class="button primary" type="submit">Login</button>
      <a class="button ghost" href="./">Cancel</a>
    </form>
  </section>
</main>
<script src="assets/app.js"></script>
</body>
</html>
