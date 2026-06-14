<?php

declare(strict_types=1);
/**
* CLASS PERFORMANCE_MONITOR
* Lightweight, opt-in performance monitor for Dédalo API requests.
*
* One instance is created per PHP process via the singleton accessor and is wired
* into the API entry point (core/api/v1/json/index.php).  The typical lifecycle is:
*
*   1. index.php calls  get_instance()->start($global_start_time)  immediately after
*      including this file.  $global_start_time is the hrtime(true) nanosecond stamp
*      captured before any heavy processing begins.
*   2. Callers sprinkle checkpoint() calls at key milestones
*      (e.g. 'request_parsed', 'before_dd_manager', 'after_dd_manager', 'before_output').
*   3. set_request_data() and set_response_data() attach sanitised request/response
*      metadata so log entries are self-contained for post-hoc analysis.
*   4. finish() snapshots end-time/memory, then calls log_performance() which writes
*      a JSON or text log entry, subject to the PERFORMANCE_LOG_LEVEL filter.
*
* All behaviour is controlled by constants defined in performance_config.php:
*   PERFORMANCE_MONITORING_ENABLED  — master on/off switch (default false)
*   PERFORMANCE_SAMPLING_RATE       — float 0.0–1.0; < 1.0 enables probabilistic sampling
*   PERFORMANCE_SLOW_THRESHOLD_MS   — request duration that sets the 'is_slow' flag
*   PERFORMANCE_LOG_LEVEL           — 'all' | 'slow' | 'error'
*   PERFORMANCE_LOG_FORMAT          — 'json' | 'text'
*   PERFORMANCE_LOG_DIR             — directory for daily rotating log files
*   PERFORMANCE_LOG_MAX_SIZE        — bytes before a log file is rotated (default 10 MB)
*   PERFORMANCE_LOG_MAX_FILES       — maximum number of rotated files to keep (default 10)
*   PERFORMANCE_LOG_CHECKPOINTS     — include per-checkpoint breakdown in each entry
*   PERFORMANCE_LOG_MEMORY          — include memory fields in each entry
*   PERFORMANCE_LOG_METADATA        — include request/response metadata in each entry
*
* get_metrics() bridges this monitor with the subsystem-level metrics class
* (core/common/class.metrics.php): when class metrics exists, metrics::get_summary()
* is embedded in the output so file logs and any dashboard receive the same subsystem
* detail that dd_manager writes to its debug log.
*
* (!) exec_time_unit() is a Dédalo global helper function (not defined in this file).
*     It computes elapsed milliseconds from an hrtime(true) nanosecond start stamp.
*
* @package Dédalo
* @subpackage API
*/
class performance_monitor
{

    // Timing data
    private float $start_time;
    private float $end_time;
    private array $checkpoints = [];

    // Memory data
    private int $start_memory;
    private int $peak_memory;
    private int $end_memory;

    // Request metadata
    private ?object $request_data = null;
    private ?object $response_data = null;

    // Monitoring state
    private bool $is_active = false;
    private bool $should_sample = true;

    // Singleton instance
    private static ?performance_monitor $instance = null;



    /**
    * GET_INSTANCE
    * Singleton accessor. Returns — or creates on first call — the single
    * performance_monitor instance for this PHP process.
    *
    * A singleton is appropriate here because only one request is handled per
    * PHP-FPM worker at a time, and the monitor must be reachable from any
    * call site without passing the instance through the call stack.
    *
    * (!) In persistent-worker environments (RoadRunner, Swoole) the static
    *     $instance survives between requests.  Ensure start() is called at the
    *     beginning of every new request so $is_active is correctly reset.
    * @return performance_monitor
    */
    public static function get_instance(): performance_monitor
    {

        if (self::$instance === null) {
            self::$instance = new self();
        }

        return self::$instance;
    }//end get_instance



    /**
    * __CONSTRUCT
    * Private constructor — enforces the singleton pattern.
    * All initialisation happens in start(); the constructor intentionally does nothing.
    */
    private function __construct()
    {
        // Private to enforce singleton
    }//end __construct



    /**
    * START
    * Activate monitoring for the current request.
    *
    * Must be called once per request, before any checkpoints are recorded.
    * Returns false without side-effects when:
    *   - PERFORMANCE_MONITORING_ENABLED is not defined or is not true.
    *   - Probabilistic sampling determines this request should be skipped
    *     (random draw vs. PERFORMANCE_SAMPLING_RATE).
    *
    * When $start_time_override is supplied (typically $global_start_time from
    * index.php, captured via hrtime(true) before any includes), the monitor
    * uses that timestamp so total elapsed time covers the entire request, not
    * just the time from when start() is called.
    * @param float|null $start_time_override = null - hrtime(true) nanosecond timestamp
    *   captured at the very beginning of the request; null uses the current hrtime
    * @return bool - true when monitoring was activated, false when skipped
    */
    public function start(?float $start_time_override = null): bool
    {

        // Check if monitoring is enabled
        if (!defined('PERFORMANCE_MONITORING_ENABLED') || PERFORMANCE_MONITORING_ENABLED !== true) {
            return false;
        }

        // Apply sampling rate
        if (defined('PERFORMANCE_SAMPLING_RATE')) {
            $sampling_rate = (float)PERFORMANCE_SAMPLING_RATE;
            if ($sampling_rate < 1.0) {
                $this->should_sample = (mt_rand() / mt_getrandmax()) <= $sampling_rate;
                if (!$this->should_sample) {
                    return false;
                }
            }
        }

        // Initialize timing
        $this->start_time = $start_time_override ?? hrtime(true);
        $this->start_memory = memory_get_usage(true);

        // Mark as active
        $this->is_active = true;

        return true;
    }//end start



    /**
    * CHECKPOINT
    * Record a named timing milestone within the active request.
    *
    * Each checkpoint captures the wall-clock nanosecond timestamp, real memory
    * footprint, and elapsed milliseconds from $start_time.  The 'elapsed_ms'
    * value is computed via exec_time_unit() using the nanosecond start stamp.
    *
    * Typical checkpoint names used by index.php:
    *   'request_parsed', 'before_dd_manager', 'after_dd_manager',
    *   'before_output', 'after_output'
    *
    * No-op (returns false) when monitoring is not active.
    * @param string $name - human-readable milestone label
    * @param array $metadata = [] - optional key/value pairs to attach to this checkpoint
    *   (e.g. action name, section tipo) for richer log analysis
    * @return bool - true on success, false when monitoring is inactive
    */
    public function checkpoint(string $name, array $metadata = []): bool
    {

        if (!$this->is_active) {
            return false;
        }

        $checkpoint = [
            'name' => $name,
            'time' => hrtime(true),
            'memory' => memory_get_usage(true),
            'elapsed_ms' => exec_time_unit($this->start_time, 'ms', 3),
            'metadata' => $metadata
        ];

        $this->checkpoints[] = $checkpoint;

        return true;
    }//end checkpoint



    /**
    * SET_REQUEST_DATA
    * Capture a sanitised snapshot of the incoming RQO (request query object)
    * for inclusion in the log entry.
    *
    * Only a small, non-sensitive subset of the RQO is stored: action, dd_api,
    * prevent_lock, recovery_mode, and the wall-clock timestamp.  Full RQO data
    * (which may contain filter values, credentials, or large payload) is intentionally
    * excluded to prevent sensitive information reaching the performance log files.
    *
    * No-op when monitoring is inactive.
    * @param object $rqo - request query object (stdClass) passed to dd_manager
    * @return void
    */
    public function set_request_data(object $rqo): void
    {

        if (!$this->is_active) {
            return;
        }

        // Extract relevant request data (avoid storing sensitive information)
        $this->request_data = (object)[
            'action' => $rqo->action ?? null,
            'dd_api' => $rqo->dd_api ?? null,
            'prevent_lock' => $rqo->prevent_lock ?? null,
            'recovery_mode' => $rqo->recovery_mode ?? null,
            'timestamp' => date('Y-m-d H:i:s')
        ];
    }//end set_request_data



    /**
    * SET_RESPONSE_DATA
    * Capture a lightweight snapshot of the API response for inclusion in the log entry.
    *
    * Records only the top-level result flag and error count so that the
    * 'error' log level filter (see log_performance()) can operate without
    * serialising the full response object.
    *
    * No-op when monitoring is inactive.
    * @param object $response - API response object (stdClass) with at minimum
    *   a 'result' bool property and an optional 'errors' array
    * @return void
    */
    public function set_response_data(object $response): void
    {

        if (!$this->is_active) {
            return;
        }

        // Extract relevant response data
        $this->response_data = (object)[
            'result' => $response->result ?? null,
            'has_errors' => !empty($response->errors ?? []),
            'error_count' => count($response->errors ?? [])
        ];
    }//end set_response_data



    /**
    * FINISH
    * Finalise monitoring for the current request and write the log entry.
    *
    * Snapshots $end_time, $end_memory, and $peak_memory, then delegates to
    * log_performance() which applies the PERFORMANCE_LOG_LEVEL filter and
    * writes the entry to the daily rotating log file.
    *
    * Must be called after set_response_data() so that the 'error' log level
    * filter can inspect $response_data->has_errors.
    *
    * No-op (returns false) when monitoring is inactive.
    * @return bool - true when the log write was attempted, false when inactive
    */
    public function finish(): bool
    {

        if (!$this->is_active) {
            return false;
        }

        $this->end_time = hrtime(true);
        $this->end_memory = memory_get_usage(true);
        $this->peak_memory = memory_get_peak_usage(true);

        // Log performance data
        $this->log_performance();

        return true;
    }//end finish



    /**
    * GET_METRICS
    * Assemble and return the full performance metrics object for this request.
    *
    * The returned object always contains:
    *   total_time_ms    float  — elapsed ms from $start_time to now (via exec_time_unit)
    *   is_slow          bool   — true when total_time_ms > PERFORMANCE_SLOW_THRESHOLD_MS (default 1000)
    *   checkpoint_count int    — number of recorded checkpoints
    *
    * Additional fields are conditionally included based on config constants:
    *   PERFORMANCE_LOG_MEMORY (default true):
    *     start_memory_mb, end_memory_mb, peak_memory_mb, memory_delta_mb
    *   PERFORMANCE_LOG_METADATA (default true):
    *     request  — sanitised RQO snapshot (see set_request_data)
    *     response — sanitised response snapshot (see set_response_data)
    *   metrics class present:
    *     subsystems — output of metrics::get_summary(), bridging the subsystem
    *                  counters (search, ontology, matrix, db, tools …) into the
    *                  performance log entry
    *   PERFORMANCE_LOG_CHECKPOINTS = true:
    *     checkpoints — array of formatted checkpoint objects (see format_checkpoints)
    *
    * (!) end_memory_mb, peak_memory_mb, and memory_delta_mb are null when
    *     finish() has not yet been called (properties are unset).
    *
    * Called both by finish() (for the final log entry) and externally by
    * performance_viewer_api.php when serving the live dashboard.
    * @return object - stdClass metrics object
    */
    public function get_metrics(): object
    {

        $total_time_ms = exec_time_unit($this->start_time, 'ms', 3);

        $metrics = (object)[
            'total_time_ms' => $total_time_ms,
            'is_slow' => $total_time_ms > (defined('PERFORMANCE_SLOW_THRESHOLD_MS') ? PERFORMANCE_SLOW_THRESHOLD_MS : 1000),
            'checkpoint_count' => count($this->checkpoints)
        ];

        // Memory profiling fields (gated by PERFORMANCE_LOG_MEMORY)
        if (!defined('PERFORMANCE_LOG_MEMORY') || PERFORMANCE_LOG_MEMORY === true) {
            $metrics->start_memory_mb  = round($this->start_memory / 1024 / 1024, 2);
            $metrics->end_memory_mb    = isset($this->end_memory) ? round($this->end_memory / 1024 / 1024, 2) : null;
            $metrics->peak_memory_mb   = isset($this->peak_memory) ? round($this->peak_memory / 1024 / 1024, 2) : null;
            $metrics->memory_delta_mb  = isset($this->end_memory) ? round(($this->end_memory - $this->start_memory) / 1024 / 1024, 2) : null;
        }

        // Request/response metadata (gated by PERFORMANCE_LOG_METADATA)
        if (!defined('PERFORMANCE_LOG_METADATA') || PERFORMANCE_LOG_METADATA === true) {
            $metrics->request  = $this->request_data;
            $metrics->response = $this->response_data;
        }

        // Subsystem breakdown bridge: include the per-subsystem metrics aggregated by the
        // metrics class (search, ontology, matrix, db, tools, presets, request_config, …)
        // so file logs / the dashboard get the same detail as the dd_manager debug log.
        if (class_exists('metrics')) {
            $metrics->subsystems = metrics::get_summary();
        }

        // Add checkpoint details if enabled
        if (defined('PERFORMANCE_LOG_CHECKPOINTS') && PERFORMANCE_LOG_CHECKPOINTS === true) {
            $metrics->checkpoints = $this->format_checkpoints();
        }

        return $metrics;
    }//end get_metrics



    /**
    * FORMAT_CHECKPOINTS
    * Convert the raw checkpoint array into a developer-friendly output structure.
    *
    * Each formatted entry carries:
    *   name                    — checkpoint label (e.g. 'before_dd_manager')
    *   elapsed_total_ms        — ms from request start to this checkpoint
    *   elapsed_since_previous_ms — ms from the preceding checkpoint (or request start
    *                               for the first checkpoint), enabling per-phase profiling
    *   memory_mb               — real memory at the checkpoint in megabytes
    *   metadata                — caller-supplied key/value annotations
    *
    * The $previous_time cursor starts at $start_time so the first checkpoint's
    * 'elapsed_since_previous_ms' measures the bootstrapping phase before any
    * checkpoint was recorded.
    * @return array - array of associative checkpoint arrays in recording order
    */
    private function format_checkpoints(): array
    {

        $formatted = [];
        $previous_time = $this->start_time;

        foreach ($this->checkpoints as $checkpoint) {
            $formatted[] = [
                'name' => $checkpoint['name'],
                'elapsed_total_ms' => $checkpoint['elapsed_ms'],
                'elapsed_since_previous_ms' => exec_time_unit($previous_time, 'ms', 3),
                'memory_mb' => round($checkpoint['memory'] / 1024 / 1024, 2),
                'metadata' => $checkpoint['metadata']
            ];
            $previous_time = $checkpoint['time'];
        }

        return $formatted;
    }//end format_checkpoints



    /**
    * LOG_PERFORMANCE
    * Apply the PERFORMANCE_LOG_LEVEL filter and, when the request passes,
    * write a formatted entry to the daily rotating log file.
    *
    * Log level semantics:
    *   'all'   — every monitored request is logged (default when the constant
    *             is not defined, but note the early filter below re-evaluates
    *             after PERFORMANCE_LOG_LEVEL is defined)
    *   'slow'  — only requests where metrics->is_slow is true
    *   'error' — only requests where the response reported at least one error
    *
    * The daily log file is named performance_YYYY-MM-DD.log inside PERFORMANCE_LOG_DIR.
    * rotate_logs() is called before writing to keep file sizes under control.
    *
    * Log format is controlled by PERFORMANCE_LOG_FORMAT:
    *   'json' (default) — one JSON object per line (NDJSON-compatible)
    *   'text'           — human-readable single-line format via format_text_log()
    *
    * (!) get_metrics() is called twice when PERFORMANCE_LOG_LEVEL is defined
    *     (once for the level check, once for the actual entry).  This is
    *     intentional — the first call may return early before finish() populates
    *     the end-memory fields, so a second call after the level check ensures
    *     the logged entry always reflects the final state.
    * @return bool - true when the entry was written successfully, false otherwise
    */
    private function log_performance(): bool
    {

        // Check if we should log based on level
        if (defined('PERFORMANCE_LOG_LEVEL')) {
            $log_level = PERFORMANCE_LOG_LEVEL;
            $metrics = $this->get_metrics();

            if ($log_level === 'slow' && !$metrics->is_slow) {
                return false;
            }

            if ($log_level === 'error' && !($metrics->response->has_errors ?? false)) {
                return false;
            }
        }

        // Ensure log directory exists
        $log_dir = defined('PERFORMANCE_LOG_DIR') ? PERFORMANCE_LOG_DIR : __DIR__ . '/logs';
        if (!is_dir($log_dir)) {
            mkdir($log_dir, 0755, true);
        }

        // Determine log file path
        $log_file = $log_dir . '/performance_' . date('Y-m-d') . '.log';

        // Check log rotation
        $this->rotate_logs($log_file);

        // Get metrics
        $metrics = $this->get_metrics();

        // Format log entry
        $log_format = defined('PERFORMANCE_LOG_FORMAT') ? PERFORMANCE_LOG_FORMAT : 'json';
        if ($log_format === 'json') {
            $log_entry = json_encode($metrics, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
        } else {
            $log_entry = $this->format_text_log($metrics);
        }

        // Write to log file
        $result = file_put_contents($log_file, $log_entry, FILE_APPEND | LOCK_EX);

        return $result !== false;
    }//end log_performance



    /**
    * ROTATE_LOGS
    * Rotate the given log file when it exceeds PERFORMANCE_LOG_MAX_SIZE bytes.
    *
    * Rotation scheme (numbered suffix, oldest deleted):
    *   performance_YYYY-MM-DD.log      ← current (written to)
    *   performance_YYYY-MM-DD.log.1    ← most recent rotated copy
    *   …
    *   performance_YYYY-MM-DD.log.N    ← oldest kept copy (N = PERFORMANCE_LOG_MAX_FILES)
    *
    * When the current file exceeds the size limit the loop walks from
    * (max_files - 1) down to 1, shifting each .N file to .(N+1) and deleting
    * the file at position (max_files - 1) if it already exists.  The current
    * file is then renamed to .1 and a fresh empty file will be created by the
    * next file_put_contents() call in log_performance().
    *
    * No-op when the log file does not yet exist or is still under the size limit.
    * @param string $log_file - absolute path to the current day's log file
    * @return void
    */
    private function rotate_logs(string $log_file): void
    {

        if (!file_exists($log_file)) {
            return;
        }

        $max_size = defined('PERFORMANCE_LOG_MAX_SIZE') ? PERFORMANCE_LOG_MAX_SIZE : 10 * 1024 * 1024;
        $max_files = defined('PERFORMANCE_LOG_MAX_FILES') ? PERFORMANCE_LOG_MAX_FILES : 10;

        if (filesize($log_file) < $max_size) {
            return;
        }

        // Rotate existing files
        for ($i = $max_files - 1; $i > 0; $i--) {
            $old_file = $log_file . '.' . $i;
            $new_file = $log_file . '.' . ($i + 1);

            if (file_exists($old_file)) {
                if ($i === $max_files - 1) {
                    unlink($old_file); // Delete oldest file
                } else {
                    rename($old_file, $new_file);
                }
            }
        }

        // Rotate current file
        rename($log_file, $log_file . '.1');
    }//end rotate_logs



    /**
    * FORMAT_TEXT_LOG
    * Render a metrics object as a single human-readable log line.
    *
    * Output format:
    *   [YYYY-MM-DD HH:MM:SS] [SLOW] dd_api->action | Time: X.XXXms | Memory: X.XXMb (peak: X.XXMb, delta: X.XXMb)<newline>
    *
    * The [SLOW] token is included only when metrics->is_slow is true.
    * Memory fields fall back to 0 when finish() has not yet been called.
    *
    * Used when PERFORMANCE_LOG_FORMAT is set to 'text'; the default format is 'json'.
    * @param object $metrics - metrics object returned by get_metrics()
    * @return string - formatted log line including trailing PHP_EOL
    */
    private function format_text_log(object $metrics): string
    {

        $timestamp = date('Y-m-d H:i:s');
        $action = $metrics->request->action ?? 'unknown';
        $dd_api = $metrics->request->dd_api ?? 'unknown';
        $slow_flag = $metrics->is_slow ? '[SLOW]' : '';

        $log = sprintf(
            "[%s] %s %s->%s | Time: %.3fms | Memory: %.2fMB (peak: %.2fMB, delta: %.2fMB)%s",
            $timestamp,
            $slow_flag,
            $dd_api,
            $action,
            $metrics->total_time_ms,
            $metrics->end_memory_mb ?? 0,
            $metrics->peak_memory_mb ?? 0,
            $metrics->memory_delta_mb ?? 0,
            PHP_EOL
        );

        return $log;
    }//end format_text_log



    /**
    * IS_ACTIVE
    * Return whether monitoring is currently active for this request.
    *
    * Used by index.php to cache the active state in $perf_active so that
    * checkpoint() and finish() calls can be guarded with a simple boolean check
    * rather than re-calling is_active() on every milestone.
    * @return bool - true when start() completed successfully for this request
    */
    public function is_active(): bool
    {

        return $this->is_active;
    } //end is_active


}//end class performance_monitor
