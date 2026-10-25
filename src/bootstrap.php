<?php
declare(strict_types=1);

const ASL3_BLOCKER_APP_DIR = '/var/www/html/asl3_blocker';
const ASL3_BLOCKER_CONFIG = ASL3_BLOCKER_APP_DIR . '/config.ini';
const ASL3_BLOCKER_HELPER = '/usr/local/libexec/asl3-node-blocker-helper';

function blocker_config(): array
{
    $cfg = @parse_ini_file(ASL3_BLOCKER_CONFIG, false, INI_SCANNER_RAW);
    return is_array($cfg) ? $cfg : [];
}

function blocker_node(): string
{
    $cfg = blocker_config();
    $node = trim((string)($cfg['MYNODE'] ?? ''), "\"' \t\r\n");
    return preg_match('/^\d{4,7}$/', $node) ? $node : '';
}

function helper_call(string $action, string $target = '', string $reason = ''): array
{
    if (!preg_match('/^[a-z]+$/', $action)) {
        return [false, 'Invalid helper action.'];
    }

    $payload = $action . "\n" . $target . "\n" . $reason . "\n";
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $process = @proc_open(
        ['/usr/bin/sudo', '-n', ASL3_BLOCKER_HELPER],
        $descriptors,
        $pipes,
        null,
        ['PATH' => '/usr/sbin:/usr/bin:/sbin:/bin']
    );

    if (!is_resource($process)) {
        return [false, 'Unable to start the ASL3 Node Blocker helper.'];
    }

    fwrite($pipes[0], $payload);
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    $code = proc_close($process);

    $text = trim((string)$stdout . (($stderr !== '') ? "\n" . $stderr : ''));
    return [$code === 0, $text];
}

function parse_denylist(string $raw, string $node): array
{
    $items = [];
    foreach (preg_split('/\R/', $raw) ?: [] as $line) {
        if (preg_match(
            '#^\s*/denylist/' . preg_quote($node, '#') . '/(\d{4,7})\s*:\s*(.*)$#',
            $line,
            $m
        )) {
            $items[] = ['node' => $m[1], 'reason' => trim($m[2])];
        }
    }
    return $items;
}

function parse_connected_nodes(string $raw, string $localNode): array
{
    $seen = [];
    foreach (preg_split('/\R/', $raw) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_contains($line, 'CONNECTED NODES') || $line === '<NONE>') {
            continue;
        }
        if (preg_match_all('/(?:^|[^0-9])(?:[A-Z])?(\d{4,7})(?:$|[^0-9])/', $line, $matches)) {
            foreach ($matches[1] as $node) {
                if ($node !== $localNode) {
                    $seen[$node] = true;
                }
            }
        }
    }
    $nodes = array_keys($seen);
    sort($nodes, SORT_NATURAL);
    return $nodes;
}

function allowlist_count(string $raw): int
{
    if (preg_match('/(\d+)\s+results?\s+found/i', $raw, $m)) {
        return (int)$m[1];
    }
    return 0;
}

function clean_target(string $value): string
{
    $value = trim($value);
    return preg_match('/^\d{4,7}$/', $value) ? $value : '';
}

function clean_disconnect_target(string $value): string
{
    $value = trim($value);

    if (preg_match('/^\d{4,7}$/', $value)) {
        return $value;
    }

    return preg_match('/^[A-Za-z0-9_.:-]{1,64}$/', $value) ? $value : '';
}

function clean_reason(string $value): string
{
    $value = trim(preg_replace('/\s+/', ' ', $value) ?? '');
    $value = preg_replace('/[^A-Za-z0-9 .,_:;()\/#@+\-]/', '', $value) ?? '';
    return substr($value, 0, 80);
}

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(24));
    }
    return (string)$_SESSION['csrf'];
}

function csrf_valid(string $token): bool
{
    return isset($_SESSION['csrf']) && hash_equals((string)$_SESSION['csrf'], $token);
}
