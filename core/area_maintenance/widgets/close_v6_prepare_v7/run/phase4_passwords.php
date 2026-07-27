<?php declare(strict_types=1);
/**
* PHASE 4 — credential upgrade to Argon2id  (bundled-engine process)
*
* v6 stores passwords as REVERSIBLE AES (component_password::encrypt_password →
* dedalo_encrypt_openssl). The v7 engines accept only one-way hashes: the TS server refuses
* such an account outright ("still has a legacy (pre-Argon2) password hash") and the PHP
* engine upgrades it lazily on the user's next login — a path that does not exist once the
* cutover is done. So this phase converts every account eagerly, reusing the engine's own
* component_password methods (no crypto is re-implemented here).
*
* It also closes a v6 weakness: after this runs the database no longer holds recoverable
* passwords, only Argon2id hashes.
*
*   --dry-run : report how many accounts WOULD be converted. Writes nothing.
*   --yes     : convert.
*
* Idempotent: rows already holding a hash are skipped, so a re-run is safe. A row is written
* only when the plaintext was recovered AND the fresh hash verifies against it; anything else
* is reported and left untouched, because hashing a failed decrypt would lock the user out.
*
* Exit codes: 0 ok · 2 usage/boot · 8 no Argon2 support in this PHP ·
*             9 died on an uncaught throwable (see prepare_v7_fail_loud)
*
* @package Dédalo
* @subpackage close_v6_prepare_v7
*/

require_once __DIR__ . '/lib/engine_boot.php';
$paths = prepare_v7_boot_engine();
require_once __DIR__ . '/lib/password_upgrade.php';

$opts     = getopt('', ['yes', 'dry-run', 'log:']);
$has_yes  = isset($opts['yes']);
$is_dry   = isset($opts['dry-run']);
$log_file = $opts['log'] ?? ($paths['var_dir'] . '/prepare_v7.log');

$log = function(string $line) use ($log_file) : void {
	@file_put_contents($log_file, date('c') . ' [phase4] ' . $line . PHP_EOL, FILE_APPEND | LOCK_EX);
	fwrite(STDOUT, $line . PHP_EOL);
};

// uncaught throwable / fatal ⇒ logged + non-zero exit (never a silent "success")
prepare_v7_fail_loud($log_file, 'phase4');

if (!$has_yes && !$is_dry) {
	$log('Refusing to convert credentials without --yes (or --dry-run to preview).');
	exit(2);
}

// Argon2 is a PHP BUILD option, not a version feature: check this install's PHP before
// touching anything, and refuse rather than write something the engines cannot verify.
$capability = prepare_v7_password_upgrade::capability();
if ($capability->result !== true) {
	$log('ABORT: ' . $capability->msg);
	exit(8);
}
$log(($is_dry ? 'PREVIEW' : 'REAL RUN') . ' credential upgrade. ' . $capability->msg);

$report = prepare_v7_password_upgrade::run($has_yes && !$is_dry);
$log('credentials: ' . $report->msg);

foreach ($report->failed as $failure) {
	$log('  · ' . $failure);
}
if (!empty($report->failed)) {
	$log('The accounts above were LEFT AS THEY WERE (never hashed from a failed decrypt). '
		. 'They cannot log into v7 until their password is set again.');
}

if ($is_dry) {
	$log('PREVIEW done. Nothing was written.');
	exit(0);
}

$log('PHASE 4 done. Credentials are Argon2id; the database no longer stores recoverable passwords.');
exit(0);
