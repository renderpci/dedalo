<?php declare(strict_types=1);
/**
 * Dédalo RoadRunner Worker
 */

use Spiral\RoadRunner;
use Nyholm\Psr7;

define('DEDALO_RR_WORKER', true);

// Setup autoloading from lib/vendor
$autoload = __DIR__ . '/lib/vendor/autoload.php';
if (!file_exists($autoload)) {
    die("Autoload file not found at $autoload. Please run composer install in lib/.");
}
require $autoload;

// Initialize RoadRunner worker
$worker = RoadRunner\Worker::create();
$psr7Worker = new RoadRunner\Http\PSR7Worker(
    $worker,
    new Psr7\Factory\Psr17Factory(),
    new Psr7\Factory\Psr17Factory(),
    new Psr7\Factory\Psr17Factory()
);

// Initialize RoadRunner RPC and KV Factory once
$rpc = null;
$kvFactory = null;
try {
    $rpc = \Spiral\Goridge\RPC\RPC::create('tcp://127.0.0.1:6001');
    $kvFactory = new RoadRunner\KeyValue\Factory($rpc);
} catch (\Throwable $e) {
    error_log("RR Worker WARNING: Failed to initialize KV Factory: " . $e->getMessage());
}

// Load Dédalo configuration (similar to index.php)
define('APP_ROOT', __DIR__);
if (!file_exists(APP_ROOT . '/config/config.php')) {
    die("Config file not found at " . APP_ROOT . '/config/config.php');
}
require APP_ROOT . '/config/config.php';

// Suppress deprecation warnings (e.g. from protobuf) and ensure clean output
// error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);
// ini_set('display_errors', '0');

// Prepare Dédalo environment
// Note: We don't want to load everything in every loop if possible,
// but Dédalo's architecture might require some includes to be present.

while ($request = $psr7Worker->waitRequest()) {
    try {
        // 1. Reset Global State
        metrics::reset();
        $GLOBALS['DEDALO_RAW_BODY'] = null;

        // Clear caches if they exist
        if (class_exists('section_record_instances_cache')) {
            section_record_instances_cache::clear();
        }
        if (class_exists('component_instances_cache')) {
            component_instances_cache::clear();
        }

        // 2. Hydrate PHP Globals from PSR-7 Request
        $_SERVER = $request->getServerParams();
        $_GET = $request->getQueryParams();
        $_POST = $request->getParsedBody() ?? [];
        $_COOKIE = $request->getCookieParams();

        // Populate $_REQUEST (usually GP)
        $_REQUEST = array_merge($_GET, is_array($_POST) ? $_POST : []);

        // Function to apply CORS headers to a response
        $applyCors = function(Psr7\Response $res, $req) {
            $origin = $req->getHeaderLine('Origin') ?: '*';
            return $res
                ->withHeader('Access-Control-Allow-Origin', $origin)
                ->withHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
                ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Content-Range, Authorization, X-Requested-With')
                ->withHeader('Access-Control-Allow-Credentials', 'true')
                ->withHeader('Access-Control-Max-Age', '86400');
        };

        // Handle OPTIONS (Preflight)
        if ($request->getMethod() === 'OPTIONS') {
            $psr7Worker->respond($applyCors(new Psr7\Response(200), $request));
            continue;
        }

        // Ensure essential server variables for Dédalo
        $_SERVER['REQUEST_TIME_FLOAT'] = $_SERVER['REQUEST_TIME_FLOAT'] ?? microtime(true);
        $_SERVER['REMOTE_ADDR'] = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

        // Fix $_FILES (simple placeholder for now)
        $_FILES = [];
        $uploadedFiles = $request->getUploadedFiles();
        if (!empty($uploadedFiles)) {
             $_FILES = ['worker_files' => $uploadedFiles];
        }

        // For Dédalo API, the body is often raw JSON
        // We set it to null if empty to let index.php fallback naturally or hit its own empty checks
        $body = (string)$request->getBody();
        $GLOBALS['DEDALO_RAW_BODY'] = ($body !== '') ? $body : null;

        // 3. Capture Output
        ob_start();

        try {
            // Sessions in RoadRunner (CLI) - Handle per-request
            if (session_status() === PHP_SESSION_ACTIVE) {
                session_write_close();
            }
            $_SESSION = [];

            // Detect session ID from cookies BEFORE starting manager
            // Dédalo session name format: 'dedalo_'.DEDALO_MAJOR_VERSION .'_'. DEDALO_ENTITY . (isset($_SERVER['HTTPS']) ? '_ssl' : '')
            $dedalo_session_name = 'dedalo_' . DEDALO_MAJOR_VERSION . '_' . DEDALO_ENTITY . (isset($_SERVER['HTTPS']) ? '_ssl' : '');
            $dedalo_session_name = str_replace([',', '.'], '_', $dedalo_session_name);

            error_log("RR Worker: Incoming Cookies: " . json_encode($_COOKIE));
            error_log("RR Worker: Constant DEDALO_ENTITY: " . DEDALO_ENTITY);
            error_log("RR Worker: Constant DEDALO_HOST: " . DEDALO_HOST);
            error_log("RR Worker: Target Session Name: $dedalo_session_name");

            if (isset($_COOKIE[$dedalo_session_name])) {
                error_log("RR Worker: Found session cookie: " . $_COOKIE[$dedalo_session_name]);
                session_id($_COOKIE[$dedalo_session_name]);
            }

            // Initialize RoadRunner KV Session Handler
            if ($kvFactory) {
                try {
                    $storage = $kvFactory->select('dedalo_sessions');

                    // Load and Register Custom Session Handler
                    require_once APP_ROOT . '/core/roadrunner/class.roadrunner_session_handler.php';
                    $save_handler = new \Dedalo\RoadRunner\RoadRunnerSessionHandler($storage, intval(8 * 3600));
                    session_set_save_handler($save_handler, true);

                    error_log("RR Worker: RoadRunner KV Session Handler registered (BoltDB)");
                } catch (\Throwable $e) {
                    error_log("RR Worker ERROR: Failed to initialize KV Session Handler: " . $e->getMessage());
                }
            }

            // session_start_manager options (derived from Dédalo constants)
            session_start_manager([
                'save_handler'          => ($kvFactory) ? 'roadrunner' : DEDALO_SESSION_HANDLER,
                'timeout_seconds'       => intval(8 * 3600), // Default 8h
                'save_path'             => DEDALO_SESSIONS_PATH,
                'session_name'          => $dedalo_session_name,
                'cookie_secure'         => (DEDALO_PROTOCOL === 'https://'),
                'cookie_samesite'       => (DEVELOPMENT_SERVER === true) ? 'Lax' : 'Strict',
                'prevent_session_lock'  => defined('PREVENT_SESSION_LOCK') ? PREVENT_SESSION_LOCK : false
            ]);

            error_log("RR Worker: Session started. ID: " . session_id());

            // Execute Dédalo API entry point
            require APP_ROOT . '/core/api/v1/json/index.php';

            // Still close session if active
            if (session_status() === PHP_SESSION_ACTIVE) {
                session_write_close();
            }
        } catch (\Throwable $e) {
            // If an exception occurs, write it to the buffer
            if (ob_get_level() > 0) {
                echo json_encode([
                    'result' => false,
                    'msg' => "Dédalo Catch Error: " . $e->getMessage(),
                    'trace' => $e->getTraceAsString()
                ]);
            }

            // Still close session if active
            if (session_status() === PHP_SESSION_ACTIVE) {
                session_write_close();
            }
        }

        $output = ob_get_clean() ?: "";
        $output = trim($output);

        // Sanity check: If we have multiple JSON objects (e.g. from a double echo),
        // try to take only the first one or log it.
        if (str_contains($output, '}{')) {
            error_log("RR Worker WARNING: Multiple JSON objects detected in output. Truncating to first one.");
            $output = explode('}{', $output)[0] . '}';
        }

        // Capture headers set via PHP's header() function
        $phpHeaders = headers_list();
        error_log("RR Worker: Captured PHP Headers: " . json_encode($phpHeaders));
        header_remove(); // Clear headers for the next worker loop request

        // 4. Build PSR-7 Response
        $response = new Psr7\Response();

        // Apply captured PHP headers to the PSR-7 Response
        foreach ($phpHeaders as $header) {
            if (str_contains($header, ':')) {
                [$name, $value] = explode(':', $header, 2);
                // Avoid duplicating Content-Length as RoadRunner/PSR7 handle it
                if (strtolower(trim($name)) === 'content-length') continue;
                $response = $response->withHeader(trim($name), trim($value));
            }
        }

        // Manual Session Cookie Injection (CLI workaround)
        // PHP CLI doesn't always emit session cookies to headers_list()
        if (session_id() !== '') {
            $params = session_get_cookie_params();
            $cookieName = session_name();
            $cookieValue = session_id();

            $cookieParts = [
                sprintf('%s=%s', $cookieName, $cookieValue),
                sprintf('Path=%s', $params['path'])
            ];

            if (!empty($params['domain'])) {
                $cookieParts[] = sprintf('Domain=%s', $params['domain']);
            }

            $maxAge = $params['lifetime'] > 0 ? $params['lifetime'] : 8 * 3600;
            $cookieParts[] = sprintf('Max-Age=%d', $maxAge);

            if ($params['secure']) $cookieParts[] = 'Secure';
            if ($params['httponly']) $cookieParts[] = 'HttpOnly';
            if (!empty($params['samesite'])) {
                $cookieParts[] = sprintf('SameSite=%s', $params['samesite']);
            }

            $cookieStr = implode('; ', $cookieParts);
            error_log("RR Worker: Injecting Set-Cookie: $cookieStr");
            $response = $response->withAddedHeader('Set-Cookie', $cookieStr);
        }

        // Apply CORS headers
        $response = $applyCors($response, $request);

        error_log("RR Worker: Request Origin: " . $request->getHeaderLine('Origin'));
        error_log("RR Worker: Request Host: " . $request->getHeaderLine('Host'));

        // Fallback for empty output (Dédalo API should usually return at least {})
        if ($output === '') {
            $output = '{}';
        }
        $response->getBody()->write($output);

        // Ensure default Content-Type if not set by Dédalo
        if (!$response->hasHeader('Content-Type')) {
            $response = $response->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        $psr7Worker->respond($response);

    } catch (\Throwable $e) {
        $worker->error((string)$e);
    }
}
