#!/usr/bin/env php
<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

$raw = stream_get_contents(STDIN);

if (!is_string($raw) || $raw === '') {
    fwrite(STDERR, "Appearance payload is empty.\n");
    exit(1);
}

if (strlen($raw) > 16384) {
    fwrite(STDERR, "Appearance payload is too large.\n");
    exit(1);
}

$decoded = json_decode($raw, true);

if (!is_array($decoded)) {
    fwrite(STDERR, "Appearance payload is not valid JSON.\n");
    exit(1);
}

$profile = blocker_appearance_validate($decoded);

if ($profile === null) {
    fwrite(STDERR, "Appearance payload failed validation.\n");
    exit(1);
}

$json = json_encode(
    $profile,
    JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT
);

if (!is_string($json)) {
    fwrite(STDERR, "Unable to encode appearance profile.\n");
    exit(1);
}

$dir = dirname(ASL3_BLOCKER_APPEARANCE);

if (!is_dir($dir)) {
    fwrite(STDERR, "Appearance directory is missing.\n");
    exit(1);
}

$temp = tempnam($dir, '.appearance.');

if ($temp === false) {
    fwrite(STDERR, "Unable to create appearance temporary file.\n");
    exit(1);
}

$ok = false;

try {
    if (
        file_put_contents(
            $temp,
            $json . PHP_EOL,
            LOCK_EX
        ) === false
    ) {
        throw new RuntimeException(
            'Unable to write appearance temporary file.'
        );
    }

    if (!chmod($temp, 0644)) {
        throw new RuntimeException(
            'Unable to set appearance file permissions.'
        );
    }

    if (!rename($temp, ASL3_BLOCKER_APPEARANCE)) {
        throw new RuntimeException(
            'Unable to install appearance profile.'
        );
    }

    @chmod(ASL3_BLOCKER_APPEARANCE, 0644);

    $ok = true;
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . PHP_EOL);
} finally {
    if (!$ok && is_file($temp)) {
        @unlink($temp);
    }
}

if (!$ok) {
    exit(1);
}

fwrite(STDOUT, "OK\tAppearance saved.\n");
