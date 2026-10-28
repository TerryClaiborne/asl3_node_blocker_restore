<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/EchoLink.php';

/*
 * Root-side live status reader for ASL3 Node Blocker & Restore.
 * It reads AMI credentials locally, requests app_rpt XStat + SawStat,
 * and returns direct connection/keyed status as JSON.
 */

function fail_json(string $message): never
{
    fwrite(STDOUT, json_encode(['ok' => false, 'message' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    exit(1);
}

function manager_config(): array
{
    $path = getenv('ASL_BLOCKER_MANAGER_CONF') ?: '/etc/asterisk/manager.conf';
    if (!is_readable($path)) {
        fail_json('Asterisk manager.conf is not readable.');
    }

    $parsed = @parse_ini_file($path, true, INI_SCANNER_RAW);
    if (!is_array($parsed)) {
        fail_json('Asterisk manager.conf could not be parsed.');
    }

    $host = '127.0.0.1';
    $port = 5038;
    $user = '';
    $secret = '';

    foreach ($parsed as $section => $values) {
        if (!is_array($values)) {
            continue;
        }

        if (strtolower((string)$section) === 'general') {
            $bind = trim((string)($values['bindaddr'] ?? ''));
            if ($bind !== '' && !in_array($bind, ['0.0.0.0', '::'], true)) {
                $host = $bind;
            }
            $p = trim((string)($values['port'] ?? ''));
            if (ctype_digit($p)) {
                $port = (int)$p;
            }
            continue;
        }

        if ($user === '' && isset($values['secret'])) {
            $user = trim((string)$section);
            $secret = trim((string)$values['secret']);
        }
    }

    if ($user === '' || $secret === '') {
        fail_json('AMI credentials were not found.');
    }

    return [$host, $port, $user, $secret];
}

function ami_read_response($fp, string $actionId): array
{
    $deadline = microtime(true) + 1.5;
    $block = [];
    $wanted = 'ActionID: ' . $actionId;

    while (microtime(true) < $deadline) {
        $line = fgets($fp);
        if ($line === false) {
            $meta = stream_get_meta_data($fp);
            if (!empty($meta['timed_out'])) {
                break;
            }
            usleep(10000);
            continue;
        }

        $line = trim($line);
        if ($line === '') {
            if ($block !== [] && in_array($wanted, $block, true)) {
                return array_values(array_filter(
                    $block,
                    static fn(string $v): bool => !in_array($v, ['Privilege: Command', 'Command output follows'], true)
                ));
            }
            $block = [];
            continue;
        }

        $block[] = $line;
    }

    if ($block !== [] && in_array($wanted, $block, true)) {
        return $block;
    }

    return [];
}

function ami_action($fp, array $fields, string $actionId): array
{
    $payload = '';
    foreach ($fields as $key => $value) {
        $payload .= $key . ': ' . $value . "\r\n";
    }
    $payload .= 'ActionID: ' . $actionId . "\r\n\r\n";

    if (@fwrite($fp, $payload) === false) {
        return [];
    }

    return ami_read_response($fp, $actionId);
}

function parse_echolink_entries(array $lines): array
{
    $entries = [];

    foreach ($lines as $line) {
        $line = trim((string)$line);

        if (preg_match(
            '/^Output:\s+(\d{1,6})\s+([A-Za-z0-9*_.\/-]{1,32})(?:\s+|$)/',
            $line,
            $match
        ) !== 1) {
            continue;
        }

        $relayNode = ltrim((string)$match[1], '0');
        if ($relayNode === '') {
            $relayNode = '0';
        }

        $callsign = strtoupper(trim((string)$match[2]));
        if ($callsign === '') {
            continue;
        }

        $entries[$relayNode] = [
            'node' => $relayNode,
            'callsign' => $callsign,
        ];
    }

    return $entries;
}

function parse_links(array $xstatLines, array $sawStatLines, array $echoNodeLines): array
{
    $connections = [];
    $modes = [];
    $keyed = [];
    $aggregateKeyed = null;

    foreach ($xstatLines as $line) {
        if (preg_match('/Conn:\s+(.*)/', $line, $match) === 1) {
            $parts = preg_split('/\s+/', trim($match[1])) ?: [];
            $node = trim((string)($parts[0] ?? ''));

            if ($node !== '' && preg_match('/^[A-Za-z0-9_.:@-]+$/', $node) === 1) {
                $connections[$node] = [
                    'node' => $node,
                    'direction' => isset($parts[5]) ? (string)($parts[3] ?? '') : (string)($parts[2] ?? ''),
                    'elapsed' => isset($parts[5]) ? (string)($parts[4] ?? '') : (string)($parts[3] ?? ''),
                    'connection_type' => preg_match('/^3\\d{6}$/', $node) === 1
                        ? 'echolink'
                        : (ctype_digit($node) ? 'node' : 'client'),
                ];
            }
        }

        if (preg_match('/LinkedNodes:\s+(.*)/', $line, $match) === 1) {
            foreach (preg_split('/,\s*/', trim($match[1])) ?: [] as $item) {
                $item = trim($item);
                if (strlen($item) >= 2) {
                    $modes[substr($item, 1)] = strtoupper(substr($item, 0, 1));
                }
            }
        }
    }

    // ASL3 can expose one nonnumeric IAX client while SawStat reports
    // an aggregate 0/1 instead of that client's name.
    $aggregateNode = count($connections) === 1
        ? (string)array_key_first($connections)
        : '';

    foreach ($sawStatLines as $line) {
        if (preg_match('/Conn:\s+(.*)/', $line, $match) !== 1) {
            continue;
        }

        $parts = preg_split('/\s+/', trim($match[1])) ?: [];
        $node = trim((string)($parts[0] ?? ''));

        if ($aggregateNode !== ''
            && !ctype_digit($aggregateNode)
            && in_array($node, ['0', '1'], true)) {
            $aggregateKeyed = ($node === '1');
            continue;
        }

        if ($node !== '') {
            $last = (string)($parts[2] ?? '-1');
            $keyed[$node] = [
                'active' => ((string)($parts[1] ?? '0') === '1'),
                'last' => preg_match('/^-?\d+$/', $last) ? (int)$last : -1,
            ];
        }
    }

    if ($aggregateKeyed !== null && $aggregateNode !== '') {
        $keyed[$aggregateNode] = [
            'active' => $aggregateKeyed,
            'last' => -1,
        ];
    }

    /*
     * EchoLink control identity and display identity are deliberately separate.
     *
     * app_rpt exposes a 3xxxxxx control target. In relay mode, chan_echolink
     * may expose a temporary numeric node as well. Neither number is trusted
     * as the permanent display identity.
     *
     * First associate the app_rpt control row with chan_echolink's LIVE
     * CALLSIGN. Then resolve that callsign through the same proven
     * callsign-first resolver used by AllStar Connect.
     *
     * If the live association is ambiguous, do not guess.
     */
    $liveEchoEntries = parse_echolink_entries($echoNodeLines);
    $remainingLive = $liveEchoEntries;
    $echoLiveIdentity = [];
    $unmatchedControls = [];

    foreach (array_keys($connections) as $controlNode) {
        $controlNode = (string)$controlNode;

        if (preg_match('/^3\d{6}$/', $controlNode) !== 1) {
            continue;
        }

        $candidate = ltrim(substr($controlNode, 1), '0');
        if ($candidate === '') {
            $candidate = '0';
        }

        if (isset($remainingLive[$candidate])) {
            $echoLiveIdentity[$controlNode] = $remainingLive[$candidate];
            unset($remainingLive[$candidate]);
        } else {
            $unmatchedControls[] = $controlNode;
        }
    }

    if (count($unmatchedControls) === 1 && count($remainingLive) === 1) {
        $controlNode = (string)$unmatchedControls[0];
        $relayNode = (string)array_key_first($remainingLive);
        $echoLiveIdentity[$controlNode] = $remainingLive[$relayNode];
    }

    $resolverConnections = [];

    foreach ($echoLiveIdentity as $controlNode => $entry) {
        $callsign = strtoupper(trim((string)($entry['callsign'] ?? '')));
        $relayNode = trim((string)($entry['node'] ?? ''));

        if ($callsign === '') {
            continue;
        }

        $resolverConnections[] = [
            'kind' => 'echo',
            'callsign' => $callsign,
            'echolink_node' => $relayNode,
            'reported_node' => (string)$controlNode,
            'node' => (string)$controlNode,
        ];
    }

    $resolverEntries = [];

    if ($resolverConnections !== []) {
        try {
            $snapshot = (new \AllStarConnect\EchoLink())->snapshot($resolverConnections);
            $resolverEntries = is_array($snapshot['entries'] ?? null)
                ? $snapshot['entries']
                : [];
        } catch (\Throwable $e) {
            $resolverEntries = [];
        }
    }

    $echoDisplayNodes = [];
    $echoCallsigns = [];

    foreach ($echoLiveIdentity as $controlNode => $entry) {
        $callsign = strtoupper(trim((string)($entry['callsign'] ?? '')));
        if ($callsign === '') {
            continue;
        }

        $echoCallsigns[(string)$controlNode] = $callsign;

        $resolved = $resolverEntries['call:' . $callsign] ?? null;
        if (!is_array($resolved) || empty($resolved['found'])) {
            continue;
        }

        $officialNode = trim((string)($resolved['node'] ?? ''));
        $resolvedCallsign = strtoupper(trim((string)($resolved['callsign'] ?? '')));

        if ($officialNode === ''
            || preg_match('/^\d{1,6}$/', $officialNode) !== 1
            || $resolvedCallsign !== $callsign) {
            continue;
        }

        $echoDisplayNodes[(string)$controlNode] = $officialNode;
    }

    $links = [];
    foreach ($connections as $node => $connection) {
        $nodeText = (string)$node;
        $modeLetter = (string)($modes[$nodeText] ?? '');
        $mode = ($modeLetter === 'T') ? 'transceive' : 'local_monitor';

        $isEchoLink = preg_match('/^3\\d{6}$/', $nodeText) === 1;

        $isNumericNode = ctype_digit($nodeText)
            && strlen($nodeText) >= 4
            && strlen($nodeText) <= 7;

        // EchoLink is intentionally Disconnect-only, just like Web Transceiver.
        $blockable = $isNumericNode && !$isEchoLink;

        // Never offer an EchoLink disconnect unless its official live ID
        // was matched safely. For every other connection, retain normal rules.
        $disconnectable = $isEchoLink
            ? isset($echoDisplayNodes[$nodeText])
            : ($isNumericNode
                || preg_match('/^[A-Za-z0-9_.:-]{1,64}$/', $nodeText) === 1);

        $modeLabel = $isEchoLink
            ? 'EchoLink'
            : ($blockable
                ? ($mode === 'transceive' ? 'Node Transceiver' : 'Node Local Monitor')
                : 'Web Transceiver');

        $displayNode = $isEchoLink
            ? (string)($echoDisplayNodes[$nodeText] ?? 'EchoLink ID unavailable')
            : $nodeText;

        $nodeCallsign = '';

        if (!$isEchoLink && $blockable) {
            $nodeRecord = \AllStarConnect\NodeIdentity::astdbLookup($nodeText);
            if (is_array($nodeRecord)) {
                $nodeCallsign = strtoupper(trim((string)($nodeRecord['call'] ?? '')));
            }
        }

        $links[] = $connection + [
            'display_node' => $displayNode,
            'callsign' => $isEchoLink
                ? (string)($echoCallsigns[$nodeText] ?? '')
                : $nodeCallsign,
            'echolink_node' => $isEchoLink
                ? (string)($echoDisplayNodes[$nodeText] ?? '')
                : '',
            'identity_verified' => $isEchoLink
                ? isset($echoDisplayNodes[$nodeText])
                : true,
            'link_mode' => $mode,
            'mode_label' => $modeLabel,
            'keyed' => !empty($keyed[$node]['active']),
            'keyed_seconds' => (int)($keyed[$node]['last'] ?? -1),
            'actionable' => $blockable,
            'blockable' => $blockable,
            'disconnectable' => $disconnectable,
        ];
    }

    usort($links, static function (array $a, array $b): int {
        if (!empty($a['keyed']) !== !empty($b['keyed'])) {
            return !empty($a['keyed']) ? -1 : 1;
        }
        return strnatcasecmp((string)$a['node'], (string)$b['node']);
    });

    return $links;
}

$node = trim((string)($argv[1] ?? ''));
if (!preg_match('/^\d{4,7}$/', $node)) {
    fail_json('Invalid local node.');
}

[$host, $port, $user, $secret] = manager_config();

$fp = @fsockopen($host, $port, $errno, $errstr, 2.0);
if (!$fp) {
    fail_json("AMI connection failed: {$errstr} ({$errno})");
}
stream_set_timeout($fp, 2);

try {
    $loginId = 'blocker_login_' . bin2hex(random_bytes(4));
    $login = ami_action($fp, [
        'ACTION' => 'LOGIN',
        'USERNAME' => $user,
        'SECRET' => $secret,
        'EVENTS' => '0',
    ], $loginId);

    if (!str_contains(implode("\n", $login), 'Authentication accepted')) {
        fail_json('AMI authentication failed.');
    }

    $xstat = ami_action($fp, [
        'ACTION' => 'RptStatus',
        'COMMAND' => 'XStat',
        'NODE' => $node,
    ], 'blocker_xstat_' . bin2hex(random_bytes(4)));

    $sawstat = ami_action($fp, [
        'ACTION' => 'RptStatus',
        'COMMAND' => 'SawStat',
        'NODE' => $node,
    ], 'blocker_sawstat_' . bin2hex(random_bytes(4)));

    $echoNodes = ami_action($fp, [
        'ACTION' => 'Command',
        'COMMAND' => 'echolink show nodes',
    ], 'blocker_echolink_' . bin2hex(random_bytes(4)));

    @fwrite($fp, "ACTION: LOGOFF\r\n\r\n");

    echo json_encode([
        'ok' => true,
        'node' => $node,
        'connections' => parse_links($xstat, $sawstat, $echoNodes),
    ], JSON_UNESCAPED_SLASHES) . PHP_EOL;
} finally {
    @fclose($fp);
}
