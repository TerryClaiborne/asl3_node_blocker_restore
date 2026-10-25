<?php
declare(strict_types=1);
session_start();

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$cfg = blocker_config();
if (auth_enabled($cfg) && !auth_logged_in()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'loginRequired' => true]);
    exit;
}

$node = blocker_node();
if ($node === '') {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => 'Local node is not configured.']);
    exit;
}

[$statusOk, $statusRaw] = helper_call('status');
$status = $statusOk ? json_decode($statusRaw, true) : null;
$connections = is_array($status['connections'] ?? null) ? $status['connections'] : [];

[$listOk, $listRaw] = helper_call('list');
$blocked = $listOk ? parse_denylist($listRaw, $node) : [];

[$allowOk, $allowRaw] = helper_call('allowlist');
$allowCount = $allowOk ? allowlist_count($allowRaw) : 0;

$keyed = array_values(array_filter(
    $connections,
    static fn(array $link): bool => !empty($link['keyed'])
));

echo json_encode([
    'ok' => $statusOk && is_array($status) && !empty($status['ok']) && $listOk,
    'node' => $node,
    'connections' => array_values($connections),
    'keyed' => $keyed,
    'blocked' => $blocked,
    'allowlistCount' => $allowCount,
    'statusError' => ($statusOk && is_array($status) && !empty($status['ok']))
        ? null
        : ($status['message'] ?? trim($statusRaw)),
], JSON_UNESCAPED_SLASHES);
