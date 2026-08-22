<?php
// CLI ONLY -- checked BEFORE the bootstrap, deliberately.
// This helper forges a DEDALO_SUPERUSER session and then ECHOES its session id: served over
// HTTP it would hand the caller a working superuser session cookie. Booting the engine first
// would also expose the production DB connection to an unauthenticated request.
// Same position and reason as the package's run/lib/engine_boot.php:28.
if (PHP_SAPI !== 'cli' || isset($_SERVER['REQUEST_METHOD'])) {
    header('HTTP/1.1 403 Forbidden', true, 403);
    die("This helper can only be run from the command line\n");
}

ob_start();
require_once __DIR__ . '/../../../config/bootstrap.php';
ob_clean();

/**
 * FORCE_LOGIN (Duplicated from migrate_diffusion_properties.php)
 */
function force_login($user_id) : void {
    // CLI only — keep in step with migrate_diffusion_properties.php.
    // Forges a DEDALO_SUPERUSER session with no credential check: the guard exists to keep
    // it unreachable over HTTP, not to restrict it to development servers.
    if (PHP_SAPI !== 'cli' || isset($_SERVER['REQUEST_METHOD'])) {
        throw new Exception("Error. This helper can only be run from the command line", 1);
    }
    $username       = 'test ' . $user_id;
    $full_username  = 'test user ' . $user_id;

    $init_response = require DEDALO_CORE_PATH.'/base/dd_init_test.php';
    
    $_SESSION['dedalo']['auth']['is_global_admin'] = (bool)security::is_global_admin($user_id);
    $_SESSION['dedalo']['auth']['is_developer']    = (bool)security::is_developer($user_id);
    $_SESSION['dedalo']['auth']['user_id']         = $user_id;
    $_SESSION['dedalo']['auth']['username']        = $username;
    $_SESSION['dedalo']['auth']['full_username']   = $full_username;
    $_SESSION['dedalo']['auth']['is_logged']       = 1;
    // SEC-082: AES-256-GCM (authenticated) replacement for legacy CBC. Marker
    // is checked for non-emptiness only; algorithm swap is safe.
    $_SESSION['dedalo']['auth']['salt_secure']     = dedalo_encrypt_v2(DEDALO_SALT_STRING);
    $_SESSION['dedalo']['auth']['login_type']      = 'default';

    if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
        lock_components::force_unlock_all_components($user_id);
    }
}

force_login(-1);

// Force saving session
session_write_close();

echo session_id();
