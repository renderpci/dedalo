<?php

declare(strict_types=1);
/**
 * PERFORMANCE VIEWER API
 * Read-only JSON endpoint for the performance monitoring dashboard.
 *
 * Responsibilities:
 * - Bootstraps Dédalo (config + session) so the standard authentication
 *   helpers are available before any data is served.
 * - Enforces SEC-068: only an authenticated developer or global-admin session
 *   may retrieve performance logs. All other callers receive HTTP 401.
 * - Reads one NDJSON-formatted daily log file produced by performance_monitor,
 *   decodes every line, computes aggregate statistics (total requests, slow
 *   request count, average duration, peak memory), and returns the most recent
 *   100 entries together with the stats object.
 *
 * Log format (written by performance_monitor::log_performance()):
 *   One JSON object per line. Each object is the stdClass returned by
 *   performance_monitor::get_metrics(). Key fields consumed here:
 *     - is_slow         bool   — true when total_time_ms > PERFORMANCE_SLOW_THRESHOLD_MS
 *     - total_time_ms   float  — wall-clock milliseconds for the request
 *     - peak_memory_mb  float  — PHP peak RSS in MiB for the request
 *     - request.timestamp string — 'Y-m-d H:i:s'; used for reverse-chrono sort
 *
 * Response envelope (JSON object, Content-Type: application/json):
 *   result       bool
 *   msg          string
 *   requests     array   — up to 100 decoded log entries, newest first
 *   stats        object  — { total_requests, slow_requests, avg_time_ms, peak_memory_mb }
 *
 * Configuration (performance_config.php, loaded after auth):
 *   PERFORMANCE_LOG_DIR   string  — directory containing daily log files
 *   (other constants are used exclusively by performance_monitor, not here)
 *
 * @package Dédalo
 * @subpackage API
 */

// Bootstrap Dédalo so session + login helpers are available.
if (!defined('DEDALO_ROOT_PATH')) {
    // /core/api/v1/json/performance/performance_viewer_api.php → /
    // dirname(__DIR__, 5) walks up five levels from this file to the repo root.
    if (!@include dirname(__DIR__, 5) . '/config/bootstrap.php') {
        http_response_code(500);
        echo json_encode(['result' => false, 'msg' => 'Configuration not available']);
        exit(0);
    }
}

// SEC-068 authentication gate
// This endpoint previously ran anonymously with a wildcard CORS header,
// exposing timing and memory profiles to any internet origin. We now require
// an authenticated Dédalo session and restrict access to developer/admin roles.
// The two-tier check handles both the DEDALO_USER_ID_DEVELOPER singleton
// (the single designated developer user) and any global admin account.
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

// Load performance-specific constants (PERFORMANCE_LOG_DIR, etc.).
// Loaded after the auth gate so that a misconfigured or missing config
// never leaks information to an unauthenticated caller.
if (file_exists(__DIR__ . '/performance_config.php')) {
    include_once __DIR__ . '/performance_config.php';
}

// SEC-068: wildcard Access-Control-Allow-Origin header removed.
// Same-origin fetch calls carry the session cookie automatically;
// no CORS header is needed for the dashboard.
header('Content-Type: application/json; charset=utf-8');

// Response envelope — populated by the try/catch block below.
$response = new stdClass();
$response->result = false;
$response->msg = 'Error. Request failed';

try {
    // Date selection
    // The caller passes ?date=YYYY-MM-DD to browse historical logs.
    // Absent the parameter the endpoint defaults to today, which is the
    // most common dashboard use-case.
    $date = $_GET['date'] ?? date('Y-m-d');

    // Date format guard
    // Reject anything that is not a strict YYYY-MM-DD string before using
    // the value to construct a file path, preventing directory-traversal via
    // crafted date strings containing '/' or '..' sequences.
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        throw new Exception('Invalid date format. Use YYYY-MM-DD');
    }

    // Log directory resolution
    // PERFORMANCE_LOG_DIR is defined in performance_config.php and points to
    // /core/api/v1/json/performance/logs by default. The fallback keeps the
    // endpoint functional even when performance_config.php is absent.
    $log_dir = defined('PERFORMANCE_LOG_DIR')
        ? PERFORMANCE_LOG_DIR
        : __DIR__ . '/logs';

    // No-logs-directory early return
    // Return result:true with empty arrays rather than an error, because
    // a missing log directory is a normal state for a freshly deployed
    // instance where monitoring has not yet written any data.
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

    // Daily log file path
    // performance_monitor::log_performance() writes to a file named
    // performance_YYYY-MM-DD.log in the same directory, one JSON object per line.
    $log_file = $log_dir . '/performance_' . $date . '.log';

    // No-log-for-date early return
    // Treat a missing file as an empty result set, not an error.
    // This is expected for any date before monitoring was enabled or for
    // future dates passed by the caller.
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

    // NDJSON log parsing
    // FILE_IGNORE_NEW_LINES strips the trailing newline from each element;
    // FILE_SKIP_EMPTY_LINES ignores blank separator lines. Lines that fail
    // json_decode (e.g. truncated writes after a crash) are silently skipped
    // to avoid making the entire day's data unavailable due to one bad line.
    $requests = [];
    $lines = file($log_file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    foreach ($lines as $line) {
        // Assuming JSON format
        // Each line should be the JSON-encoded stdClass produced by
        // performance_monitor::get_metrics(). json_decode returns null on
        // failure, which is used as the skip guard below.
        $log_entry = json_decode($line);
        if ($log_entry !== null) {
            $requests[] = $log_entry;
        }
    }

    // Aggregate statistics pass
    // These are computed over ALL entries in the day's log (before the 100-
    // record cap is applied to $requests) so that the stats panel always
    // reflects the full day, not just the visible page of results.
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
        // Track the single highest peak_memory_mb observed across all requests
        // rather than summing, because each value is per-request PHP peak RSS.
        if (isset($req->peak_memory_mb) && $req->peak_memory_mb > $peak_memory) {
            $peak_memory = $req->peak_memory_mb;
        }
    }

    $avg_time = $total_requests > 0 ? round($total_time / $total_requests, 2) : 0;

    // Reverse-chronological sort
    // The dashboard shows the most recent requests at the top. Sorting by
    // request.timestamp (string 'Y-m-d H:i:s') with strcmp in reverse order
    // (b before a) achieves a lexicographic descending sort without date parsing.
    usort($requests, function ($a, $b) {
        $time_a = $a->request->timestamp ?? '';
        $time_b = $b->request->timestamp ?? '';
        return strcmp($time_b, $time_a);
    });

    // Result-set cap
    // A busy production deployment may log thousands of requests per day.
    // Slicing to 100 keeps the JSON payload manageable for the browser without
    // losing any statistical value (the stats computed above cover the full set).
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
