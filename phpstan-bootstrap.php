<?php declare(strict_types=1);

require_once __DIR__ . '/vendor/autoload.php';

define('SHOW_DEBUG', false);
define('LOGGER_LEVEL', 8);
define('UPDATE_LOG_FILE', '');

if (!function_exists('running_in_cli')) {
    function running_in_cli() : bool {
        return true;
    }
}

define('DEDALO_ROOT_PATH', __DIR__);
define('DEDALO_CONFIG_PATH', __DIR__ . '/config');
define('DEDALO_CORE_PATH', __DIR__ . '/core');
define('DEDALO_DIFFUSION_PATH', __DIR__ . '/diffusion');
define('DEDALO_SHARED_PATH', __DIR__ . '/shared');
define('DEDALO_TOOLS_PATH', __DIR__ . '/tools');
define('DEDALO_TOOLS_URL', '/tools');
define('DEDALO_LIB_PATH', __DIR__ . '/lib');

// Runtime threshold constant defined in config/config_db.php (not loaded by PHPStan).
define('SLOW_QUERY_MS', 100);

require_once DEDALO_CORE_PATH . '/base/class.loader.php';
require_once DEDALO_CORE_PATH . '/base/boot/class.secret_sentinels.php';
