<?php
declare(strict_types=1);

function auth_enabled(array $cfg): bool
{
    return (string)($cfg['ASL3_BLOCKER_AUTH_ENABLED'] ?? '0') === '1';
}

function auth_logged_in(): bool
{
    return !empty($_SESSION['asl3_blocker_admin']);
}

function auth_require_if_enabled(array $cfg): void
{
    if (auth_enabled($cfg) && !auth_logged_in()) {
        header('Location: login.php', true, 303);
        exit;
    }
}
