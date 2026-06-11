<?php

declare(strict_types=1);
/**
 * PERFORMANCE VIEWER API
 * Backend API for the performance viewer dashboard
 * Reads and aggregates performance log data
 *
 * SEC-068: this endpoint previously ran anonymously with a wildcard CORS
 * header, letting any internet origin scrape the timing and memory profile
 * of the deployment. We now bootstrap the Dédalo stack (for session + logger)
 * and gate on an authenticated dev/admin session before returning data.
 */

// Bootstrap Dédalo so session + login helpers are available.
if (!defined('DEDALO_ROOT_PATH')) {
    // /core/api/v1/json/performance/performance_viewer_api.php → /
    if (!@include dirname(__DIR__, 5) . '/config/bootstrap.php') {
        http_response_code(500);
        echo json_encode(['result' => false, 'msg' => 'Configuration not available']);
        exit(0);
    }
}

// SEC-068: require an authenticated session; only users with developer /
// admin permissions may view the performance log.
$is_authorised = false;
if (function_exists('session_start_manager')) {
    session_start_manager();
}
if (class_exists('login')) {
    $logged = login::is_logged();
    if ($logged === true) {
        if (defined('DEDALO_USER_ID_DEVELOPER')
            && isset($_SESSION['dedalo']['auth']['user_id'])
            && (int)$_SESSION['dedalo']['auth']['user_id'] === (int)DEDALO_USER_ID_DEVELOPER
        ) {
            $is_authorised = true;
        } else if (class_exists('common')
            && method_exists('common', 'user_is_global_admin')
            && common::user_is_global_admin() === true
        ) {
            $is_authorised = true;
        }
    }
}
if (!$is_authorised) {
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['result' => false, 'msg' => 'Unauthorized']);
    exit(0);
}

// Load configuration
if (file_exists(__DIR__ . '/performance_config.php')) {
    include_once __DIR__ . '/performance_config.php';
}

// Set JSON header. SEC-068: removed the wildcard Access-Control-Allow-Origin.
// Only authenticated same-origin requests need this endpoint; browsers already
// send the session cookie implicitly for same-origin fetch calls.
header('Content-Type: application/json; charset=utf-8');

// Response object
$response = new stdClass();
$response->result = false;
$response->msg = 'Error. Request failed';

try {
    // Get date parameter (default to today)
    $date = $_GET['date'] ?? date('Y-m-d');

    // Validate date format
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        throw new Exception('Invalid date format. Use YYYY-MM-DD');
    }

    // Determine log directory
    $log_dir = defined('PERFORMANCE_LOG_DIR')
        ? PERFORMANCE_LOG_DIR
        : __DIR__ . '/logs';

    // Check if log directory exists
    if (!is_dir($log_dir)) {
        $response->result = true;
        $response->msg = 'No performance logs found';
        $response->requests = [];
        $response->stats = [
            'total_requests' => 0,
            'slow_requests' => 0,
            'avg_time_ms' => 0,
            'peak_memory_mb' => 0
        ];
        echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit(0);
    }

    // Read log file for the specified date
    $log_file = $log_dir . '/performance_' . $date . '.log';

    if (!file_exists($log_file)) {
        $response->result = true;
        $response->msg = 'No logs found for ' . $date;
        $response->requests = [];
        $response->stats = [
            'total_requests' => 0,
            'slow_requests' => 0,
            'avg_time_ms' => 0,
            'peak_memory_mb' => 0
        ];
        echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit(0);
    }

    // Parse log file
    $requests = [];
    $lines = file($log_file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    foreach ($lines as $line) {
        // Assuming JSON format
        $log_entry = json_decode($line);
        if ($log_entry !== null) {
            $requests[] = $log_entry;
        }
    }

    // Calculate statistics
    $total_requests = count($requests);
    $slow_requests = 0;
    $total_time = 0;
    $peak_memory = 0;

    foreach ($requests as $req) {
        if (isset($req->is_slow) && $req->is_slow === true) {
            $slow_requests++;
        }
        if (isset($req->total_time_ms)) {
            $total_time += $req->total_time_ms;
        }
        if (isset($req->peak_memory_mb) && $req->peak_memory_mb > $peak_memory) {
            $peak_memory = $req->peak_memory_mb;
        }
    }

    $avg_time = $total_requests > 0 ? round($total_time / $total_requests, 2) : 0;

    // Sort requests by time (most recent first)
    usort($requests, function ($a, $b) {
        $time_a = $a->request->timestamp ?? '';
        $time_b = $b->request->timestamp ?? '';
        return strcmp($time_b, $time_a);
    });

    // Limit to most recent 100 requests for performance
    $requests = array_slice($requests, 0, 100);

    // Build response
    $response->result = true;
    $response->msg = 'OK';
    $response->requests = $requests;
    $response->stats = [
        'total_requests' => $total_requests,
        'slow_requests' => $slow_requests,
        'avg_time_ms' => $avg_time,
        'peak_memory_mb' => round($peak_memory, 2)
    ];
} catch (Exception $e) {
    $response->result = false;
    $response->msg = 'Error: ' . $e->getMessage();
    $response->requests = [];
    $response->stats = [
        'total_requests' => 0,
        'slow_requests' => 0,
        'avg_time_ms' => 0,
        'peak_memory_mb' => 0
    ];
}

// Output response
echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
