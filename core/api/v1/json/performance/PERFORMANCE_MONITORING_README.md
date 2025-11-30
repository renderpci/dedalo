# Performance Monitoring System - Quick Start Guide

## Overview

The Dédalo API now includes a comprehensive performance monitoring system that tracks execution times, memory usage, and provides detailed metrics for every API request.

## Files Created

All files are located in `/core/api/v1/json/performance/`:

1. **`performance_config.php`** - Configuration settings
2. **`performance_monitor.php`** - Core monitoring class
3. **`performance_viewer.php`** - Web dashboard for viewing metrics
4. **`performance_viewer_api.php`** - Backend API for the dashboard
5. **`logs/`** - Directory for log files (auto-created)

## Configuration

Edit `performance_config.php` to customize:

```php
// Enable/disable monitoring
define('PERFORMANCE_MONITORING_ENABLED', true);

// Slow request threshold (ms)
define('PERFORMANCE_SLOW_THRESHOLD_MS', 1000);

// Sampling rate (1.0 = 100%, 0.1 = 10%)
define('PERFORMANCE_SAMPLING_RATE', 1.0);

// Log format: 'json' or 'text'
define('PERFORMANCE_LOG_FORMAT', 'json');
```

## How It Works

The performance monitor automatically tracks:

1. **Total execution time** - From request start to response output
2. **Memory usage** - Start, end, peak, and delta
3. **Checkpoints** - Timing at key stages:
   - `request_parsed` - After request data is parsed
   - `before_dd_manager` - Before main processing
   - `after_dd_manager` - After main processing
   - `before_output` - Before sending response
   - `after_output` - After response sent

4. **Request metadata** - Action, API endpoint, user info
5. **Response status** - Success/error detection

## Viewing Performance Data

### Web Dashboard

Access the performance viewer at:
```
https://localhost:8443/v7/core/api/v1/json/performance/performance_viewer.php
```

Features:
- Real-time metrics (total requests, slow requests, avg time, peak memory)
- Filter by date, minimum time, or action
- Expandable checkpoint details
- Auto-refresh every 30 seconds
- Highlights slow and error requests

### Log Files

Performance logs are stored in:
```
/core/api/v1/json/performance/logs/performance_YYYY-MM-DD.log
```

Each log entry is a JSON object with complete metrics.

## Performance Impact

The monitoring system is designed for minimal overhead:
- **~0.1-0.5ms** added per request
- Uses high-resolution timers (`hrtime()`)
- Efficient checkpoint recording
- Asynchronous log writing

## Sampling for High-Traffic Environments

For production environments with high traffic, enable sampling:

```php
// Monitor only 10% of requests
define('PERFORMANCE_SAMPLING_RATE', 0.1);
```

## Disabling Monitoring

To disable monitoring completely:

```php
define('PERFORMANCE_MONITORING_ENABLED', false);
```

## Log Rotation

Logs automatically rotate when they exceed 10MB (configurable):

```php
define('PERFORMANCE_LOG_MAX_SIZE', 10 * 1024 * 1024);
define('PERFORMANCE_LOG_MAX_FILES', 10);
```

## Example Log Entry

```json
{
  "total_time_ms": 245.123,
  "start_memory_mb": 12.5,
  "end_memory_mb": 15.2,
  "peak_memory_mb": 16.8,
  "memory_delta_mb": 2.7,
  "is_slow": false,
  "checkpoint_count": 5,
  "request": {
    "action": "get_data",
    "dd_api": "dd_core_api",
    "timestamp": "2025-11-22 17:45:30"
  },
  "response": {
    "result": true,
    "has_errors": false,
    "error_count": 0
  },
  "checkpoints": [
    {
      "name": "request_parsed",
      "elapsed_total_ms": 2.5,
      "elapsed_since_previous_ms": 2.5,
      "memory_mb": 12.6
    },
    {
      "name": "before_dd_manager",
      "elapsed_total_ms": 5.2,
      "elapsed_since_previous_ms": 2.7,
      "memory_mb": 12.8
    },
    {
      "name": "after_dd_manager",
      "elapsed_total_ms": 240.1,
      "elapsed_since_previous_ms": 234.9,
      "memory_mb": 15.1
    }
  ]
}
```

## Troubleshooting

### No logs appearing
- Check that `PERFORMANCE_MONITORING_ENABLED` is `true`
- Verify `performance_logs/` directory has write permissions (755)
- Check sampling rate isn't too low

### Dashboard shows no data
- Ensure log files exist in `performance_logs/`
- Check browser console for JavaScript errors
- Verify the date filter matches existing log files

### High overhead
- Reduce sampling rate: `PERFORMANCE_SAMPLING_RATE = 0.1`
- Set log level to 'slow': `PERFORMANCE_LOG_LEVEL = 'slow'`
- Disable checkpoint logging: `PERFORMANCE_LOG_CHECKPOINTS = false`

## Integration with Existing Code

The monitoring system is fully integrated into `index.php` and requires no changes to your existing API calls. It automatically monitors all requests that go through the API entry point.

## Future Enhancements

Potential additions (not yet implemented):
- Database query tracking
- External API call monitoring
- Performance alerts/notifications
- Historical trend analysis
- Export to monitoring services (Prometheus, Grafana, etc.)
