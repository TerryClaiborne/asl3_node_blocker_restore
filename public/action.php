<?php
declare(strict_types=1);
session_start();

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond(int $status, array $data): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

$cfg = blocker_config();
if (auth_enabled($cfg) && !auth_logged_in()) {
    respond(401, ['ok' => false, 'loginRequired' => true, 'message' => 'Login required.']);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['ok' => false, 'message' => 'POST required.']);
}

if (!csrf_valid((string)($_POST['csrf'] ?? ''))) {
    respond(403, ['ok' => false, 'message' => 'Security token expired. Reload the page and try again.']);
}

$node = blocker_node();
$action = (string)($_POST['action'] ?? '');
$rawTarget = (string)($_POST['target'] ?? '');
$target = clean_target($rawTarget);
$disconnectTarget = clean_disconnect_target($rawTarget);
$reason = clean_reason((string)($_POST['reason'] ?? ''));

if ($action === 'appearance') {
    $rawAppearance = (string)($_POST['appearance'] ?? '');

    if ($rawAppearance === '' || strlen($rawAppearance) > 16384) {
        respond(400, [
            'ok' => false,
            'message' => 'Appearance payload is invalid.',
        ]);
    }

    $decoded = json_decode($rawAppearance, true);

    if (!is_array($decoded)) {
        respond(400, [
            'ok' => false,
            'message' => 'Appearance payload is not valid JSON.',
        ]);
    }

    $profile = blocker_appearance_validate($decoded);

    if ($profile === null) {
        respond(400, [
            'ok' => false,
            'message' => 'Appearance settings failed validation.',
        ]);
    }

    $canonical = json_encode(
        $profile,
        JSON_UNESCAPED_SLASHES
    );

    if (!is_string($canonical)) {
        respond(500, [
            'ok' => false,
            'message' => 'Appearance settings could not be encoded.',
        ]);
    }

    [$ok, $msg] = helper_call(
        'appearance',
        base64_encode($canonical)
    );

    respond($ok ? 200 : 500, [
        'ok' => $ok,
        'message' => $ok
            ? 'Appearance settings were saved.'
            : ($msg !== ''
                ? $msg
                : 'Appearance settings could not be saved.'),
    ]);
}


if ($node === '') {
    respond(500, ['ok' => false, 'message' => 'Local node is not configured.']);
}

if ($action === 'disconnect') {
    if ($disconnectTarget === '') {
        respond(400, ['ok' => false, 'message' => 'The selected live connection is not a valid disconnect target.']);
    }
    if ($disconnectTarget === $node) {
        respond(400, ['ok' => false, 'message' => 'You cannot disconnect your own node.']);
    }

    [$ok, $msg] = helper_call('disconnect', $disconnectTarget);
    respond($ok ? 200 : 500, [
        'ok' => $ok,
        'message' => $ok
            ? (ctype_digit($disconnectTarget)
                ? "Node {$disconnectTarget} was disconnected. It was not blocked."
                : "Client {$disconnectTarget} was disconnected. It was not blocked.")
            : ($msg !== '' ? $msg : 'The disconnect operation failed.'),
    ]);
}

if ($target === '') {
    respond(400, ['ok' => false, 'message' => 'Enter a valid 4 to 7 digit AllStar node number.']);
}
if ($target === $node) {
    respond(400, ['ok' => false, 'message' => 'You cannot block or restore your own node.']);
}

if ($action === 'block') {
    [$ok, $msg] = helper_call('block', $target, $reason);
    respond($ok ? 200 : 500, [
        'ok' => $ok,
        'message' => $ok
            ? "Node {$target} was disconnected and blocked."
            : ($msg !== '' ? $msg : 'The block operation failed.'),
    ]);
}

if ($action === 'restore') {
    [$ok, $msg] = helper_call('restore', $target);
    respond($ok ? 200 : 500, [
        'ok' => $ok,
        'message' => $ok
            ? "Node {$target} was restored and may connect again."
            : ($msg !== '' ? $msg : 'The restore operation failed.'),
    ]);
}

respond(400, ['ok' => false, 'message' => 'Unknown action.']);
