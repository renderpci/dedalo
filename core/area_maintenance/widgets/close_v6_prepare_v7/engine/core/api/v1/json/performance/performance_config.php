<?php

declare(strict_types=1);
/**
 * PERFORMANCE MONITORING CONFIGURATION
 * Runtime constants that govern the optional API performance monitoring system.
 *
 * This file is included conditionally by core/api/v1/json/index.php when the
 * file exists. All constants defined here are consumed by performance_monitor
 * (same directory); none are required by any other part of the Dédalo stack.
 *
 * Monitoring is disabled by default (PERFORMANCE_MONITORING_ENABLED = false)
 * so it is safe to keep this file present in production deployments. Enable
 * it on an individual host to diagnose slow-request issues, then disable it
 * again once profiling is complete.
 *
 * Log files land in the logs/ sub-directory alongside this file, one file per
 * calendar day, rotated by size. The performance_viewer.php dashboard reads
 * those files and is gated behind an authenticated developer/admin session
 * (SEC-068).
 *
 * @package Dédalo
 * @subpackage API
 */

// Enable/disable performance monitoring
// (!) Keep false in production unless actively profiling a specific host;
//     enabling it adds ~0.1–0.5 ms overhead per API request and grows logs.
define('PERFORMANCE_MONITORING_ENABLED', false);

// Slow request threshold in milliseconds
// Requests exceeding this threshold will be flagged as slow
// Used by performance_monitor::get_metrics() to set the 'is_slow' flag,
// and by log_performance() when PERFORMANCE_LOG_LEVEL === 'slow' to decide
// whether to write a log entry at all.
define('PERFORMANCE_SLOW_THRESHOLD_MS', 1000);

// Sampling rate (0.0 to 1.0)
// 1.0 = monitor all requests
// 0.1 = monitor 10% of requests (useful for high-traffic environments)
// Values below 1.0 cause performance_monitor::start() to skip monitoring
// probabilistically via mt_rand(), reducing log volume on busy servers.
define('PERFORMANCE_SAMPLING_RATE', 1.0);

// Log directory path
// Must be writable by the web-server user. The directory is created
// automatically on first write if it does not already exist (mode 0755).
define('PERFORMANCE_LOG_DIR', __DIR__ . '/logs');

// Log file rotation settings
// Maximum log file size in bytes (10MB default)
// When the active daily log file reaches this size, performance_monitor
// renames it to .1 and shifts older rotated files up (.1→.2, etc.).
define('PERFORMANCE_LOG_MAX_SIZE', 10 * 1024 * 1024);

// Maximum number of log files to keep
// Once PERFORMANCE_LOG_MAX_FILES rotated copies exist, the oldest is deleted.
define('PERFORMANCE_LOG_MAX_FILES', 10);

// Log format: 'json' or 'text'
// 'json'  — one JSON object per line; machine-readable, consumed by the
//           performance_viewer_api.php dashboard backend.
// 'text'  — single-line human-readable summary; useful for quick tail -f
//           inspection but cannot be parsed by the dashboard.
define('PERFORMANCE_LOG_FORMAT', 'json');

// Include detailed checkpoint data in logs
// When true, each log entry includes the 'checkpoints' array with per-stage
// timing (request_parsed, before_dd_manager, after_dd_manager, etc.).
// Disable to reduce per-entry size while keeping summary metrics.
define('PERFORMANCE_LOG_CHECKPOINTS', true);

// Include memory profiling data
// When true, start_memory_mb, end_memory_mb, peak_memory_mb, and
// memory_delta_mb are added to every log entry and get_metrics() result.
define('PERFORMANCE_LOG_MEMORY', true);

// Include request metadata (action, dd_api, user info)
// When true, the 'request' and 'response' sub-objects (action, dd_api,
// result, error_count, etc.) are included in each log entry.
// Disable when the log format is 'text' or to reduce sensitive-data exposure.
define('PERFORMANCE_LOG_METADATA', true);

// Minimum log level for performance logs
// Controls which monitored requests are actually written to disk:
// 'all'   = log all monitored requests
// 'slow'  = only log requests whose total_time_ms exceeds PERFORMANCE_SLOW_THRESHOLD_MS
// 'error' = only log requests whose API response contains at least one error
// Use 'slow' in production to suppress noise while capturing problematic requests.
define('PERFORMANCE_LOG_LEVEL', 'all');
