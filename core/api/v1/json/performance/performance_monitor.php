<?php

declare(strict_types=1);
/**
 * PERFORMANCE MONITOR CLASS
 * Lightweight performance monitoring for Dédalo API requests
 * Tracks execution time, memory usage, and provides detailed metrics
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
     * GET INSTANCE
     * Singleton pattern to ensure only one monitor per request
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
     * Private constructor for singleton pattern
     */
    private function __construct()
    {
        // Private to enforce singleton
    }//end __construct



    /**
     * START
     * Initialize performance monitoring for the current request
     * @param float|null $start_time_override - Optional override for start time (use existing global start time)
     * @return bool
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
     * Record a timing checkpoint at a specific point in execution
     * @param string $name - Checkpoint name (e.g., 'request_parsed', 'before_manager', 'after_manager')
     * @param array $metadata - Optional additional metadata for this checkpoint
     * @return bool
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
     * SET REQUEST DATA
     * Store request metadata for logging
     * @param object $rqo - Request query object
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
     * SET RESPONSE DATA
     * Store response metadata for logging
     * @param object $response - API response object
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
     * Complete monitoring and finalize metrics
     * @return bool
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
     * GET METRICS
     * Retrieve collected performance metrics
     * @return object
     */
    public function get_metrics(): object
    {

        $total_time_ms = isset($this->end_time)
            ? exec_time_unit($this->start_time, 'ms', 3)
            : exec_time_unit($this->start_time, 'ms', 3);

        $metrics = (object)[
            'total_time_ms' => $total_time_ms,
            'start_memory_mb' => round($this->start_memory / 1024 / 1024, 2),
            'end_memory_mb' => isset($this->end_memory) ? round($this->end_memory / 1024 / 1024, 2) : null,
            'peak_memory_mb' => isset($this->peak_memory) ? round($this->peak_memory / 1024 / 1024, 2) : null,
            'memory_delta_mb' => isset($this->end_memory) ? round(($this->end_memory - $this->start_memory) / 1024 / 1024, 2) : null,
            'is_slow' => $total_time_ms > (defined('PERFORMANCE_SLOW_THRESHOLD_MS') ? PERFORMANCE_SLOW_THRESHOLD_MS : 1000),
            'checkpoint_count' => count($this->checkpoints),
            'request' => $this->request_data,
            'response' => $this->response_data
        ];

        // Add checkpoint details if enabled
        if (defined('PERFORMANCE_LOG_CHECKPOINTS') && PERFORMANCE_LOG_CHECKPOINTS === true) {
            $metrics->checkpoints = $this->format_checkpoints();
        }

        return $metrics;
    }//end get_metrics



    /**
     * FORMAT CHECKPOINTS
     * Format checkpoint data for output
     * @return array
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
     * LOG PERFORMANCE
     * Write performance data to log file
     * @return bool
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
     * ROTATE LOGS
     * Rotate log files when they exceed maximum size
     * @param string $log_file
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
     * FORMAT TEXT LOG
     * Format metrics as human-readable text
     * @param object $metrics
     * @return string
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
     * IS ACTIVE
     * Check if monitoring is currently active
     * @return bool
     */
    public function is_active(): bool
    {

        return $this->is_active;
    } //end is_active


}//end class performance_monitor
