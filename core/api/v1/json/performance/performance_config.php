<?php

declare(strict_types=1);
/**
 * PERFORMANCE MONITORING CONFIGURATION
 * Configuration settings for the API performance monitoring system
 */

// Enable/disable performance monitoring
define('PERFORMANCE_MONITORING_ENABLED', false);

// Slow request threshold in milliseconds
// Requests exceeding this threshold will be flagged as slow
define('PERFORMANCE_SLOW_THRESHOLD_MS', 1000);

// Sampling rate (0.0 to 1.0)
// 1.0 = monitor all requests
// 0.1 = monitor 10% of requests (useful for high-traffic environments)
define('PERFORMANCE_SAMPLING_RATE', 1.0);

// Log directory path
define('PERFORMANCE_LOG_DIR', __DIR__ . '/logs');

// Log file rotation settings
// Maximum log file size in bytes (10MB default)
define('PERFORMANCE_LOG_MAX_SIZE', 10 * 1024 * 1024);

// Maximum number of log files to keep
define('PERFORMANCE_LOG_MAX_FILES', 10);

// Log format: 'json' or 'text'
define('PERFORMANCE_LOG_FORMAT', 'json');

// Include detailed checkpoint data in logs
define('PERFORMANCE_LOG_CHECKPOINTS', true);

// Include memory profiling data
define('PERFORMANCE_LOG_MEMORY', true);

// Include request metadata (action, dd_api, user info)
define('PERFORMANCE_LOG_METADATA', true);

// Minimum log level for performance logs
// Only log requests that meet certain criteria:
// 'all' = log all monitored requests
// 'slow' = only log slow requests (exceeding threshold)
// 'error' = only log requests that resulted in errors
define('PERFORMANCE_LOG_LEVEL', 'all');
