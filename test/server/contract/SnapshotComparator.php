<?php declare(strict_types=1);
/**
 * SnapshotComparator
 * Utility class for comparing API response snapshots to detect breaking changes
 *
 * @package Test
 * @subpackage Contract
 */

class SnapshotComparator {

    /**
     * Dynamic fields to exclude from comparison
     * These fields change between runs and should not be considered in structure validation
     */
    private const DYNAMIC_FIELDS = [
        'timestamp',
        'session_id',
        'request_id',
        'created_at',
        'updated_at',
        'execution_time',
        'memory_usage',
        'id', // Auto-generated IDs
        'section_id', // Test-specific IDs
        'matrix_id',
        'cache_key',
        'token',
        'nonce',
        'unique_id'
    ];

    /**
     * SNAPSHOTS_DIR
     * Base directory for snapshot storage
     */
    private string $snapshots_dir;

    /**
     * Constructor
     * @param string|null $snapshots_dir Optional custom snapshots directory
     */
    public function __construct(?string $snapshots_dir = null) {
        $this->snapshots_dir = $snapshots_dir ?? __DIR__ . '/snapshots';
        
        if (!is_dir($this->snapshots_dir)) {
            mkdir($this->snapshots_dir, 0755, true);
        }
    }

    /**
     * COMPARE
     * Compare current data against stored snapshot
     *
     * @param object|array $current Current API response
     * @param string $snapshot_name Name of the snapshot file
     * @return array Result with 'matches' (bool), 'differences' (array), 'message' (string)
     */
    public function compare(object|array $current, string $snapshot_name): array {
        $snapshot = $this->loadSnapshot($snapshot_name);
        
        if ($snapshot === null) {
            return [
                'matches' => false,
                'differences' => [],
                'message' => "Snapshot '$snapshot_name' does not exist. Run with UPDATE_SNAPSHOTS=true to create it.",
                'current' => null,
                'snapshot' => null
            ];
        }

        $normalized_current = $this->normalizeForComparison($current);
        $normalized_snapshot = $this->normalizeForComparison($snapshot);

        $differences = $this->findDifferences($normalized_current, $normalized_snapshot);

        return [
            'matches' => empty($differences),
            'differences' => $differences,
            'message' => empty($differences) 
                ? "Structure matches snapshot '$snapshot_name'"
                : "Structure differs from snapshot '$snapshot_name': " . $this->formatDifferences($differences),
            'current' => $normalized_current,
            'snapshot' => $normalized_snapshot
        ];
    }

    /**
     * MATCHES_STRUCTURE
     * Strict structure comparison - returns boolean
     *
     * @param object|array $current Current data
     * @param object|array $snapshot Expected structure
     * @return bool True if structures match
     */
    public function matchesStructure(object|array $current, object|array $snapshot): bool {
        $normalized_current = $this->normalizeForComparison($current);
        $normalized_snapshot = $this->normalizeForComparison($snapshot);
        
        $differences = $this->findDifferences($normalized_current, $normalized_snapshot);
        
        return empty($differences);
    }

    /**
     * NORMALIZE_FOR_COMPARISON
     * Remove dynamic fields and normalize for comparison
     *
     * @param object|array $data Data to normalize
     * @return object Normalized object
     */
    public function normalizeForComparison(object|array $data): object {
        $data = is_array($data) ? (object) $data : $data;
        $result = new stdClass();

        foreach ($data as $key => $value) {
            // Skip dynamic fields
            if (in_array($key, self::DYNAMIC_FIELDS, true)) {
                continue;
            }

            if (is_object($value)) {
                $result->$key = $this->normalizeForComparison($value);
            } elseif (is_array($value)) {
                $result->$key = $this->normalizeArray($value);
            } else {
                // Store type information for primitives
                $result->$key = $this->getTypeDescriptor($value);
            }
        }

        return $result;
    }

    /**
     * NORMALIZE_ARRAY
     * Normalize array values recursively
     *
     * @param array $array Array to normalize
     * @return array Normalized array
     */
    private function normalizeArray(array $array): array {
        $result = [];
        
        foreach ($array as $key => $value) {
            if (is_object($value)) {
                $result[$key] = $this->normalizeForComparison($value);
            } elseif (is_array($value)) {
                $result[$key] = $this->normalizeArray($value);
            } else {
                $result[$key] = $this->getTypeDescriptor($value);
            }
        }

        return $result;
    }

    /**
     * GET_TYPE_DESCRIPTOR
     * Get type descriptor for value (preserves type info without storing actual value)
     *
     * @param mixed $value Value to describe
     * @return object Type descriptor with 'type' and 'nullable'
     */
    private function getTypeDescriptor(mixed $value): object {
        $type = gettype($value);
        
        return (object) [
            '__type' => $type === 'NULL' ? 'null' : $type,
            '__nullable' => $value === null
        ];
    }

    /**
     * FIND_DIFFERENCES
     * Find structural differences between two objects
     *
     * @param object $current Current normalized data
     * @param object $snapshot Snapshot normalized data
     * @param string $path Current path for nested comparison
     * @return array List of differences
     */
    private function findDifferences(object $current, object $snapshot, string $path = ''): array {
        $differences = [];
        
        $current_keys = get_object_vars($current);
        $snapshot_keys = get_object_vars($snapshot);

        // Check for added fields
        foreach ($current_keys as $key => $value) {
            $full_path = $path ? "$path.$key" : $key;
            
            if (!array_key_exists($key, $snapshot_keys)) {
                $differences[] = [
                    'type' => 'added',
                    'path' => $full_path,
                    'message' => "Field '$full_path' exists in current but not in snapshot"
                ];
                continue;
            }

            // Recursively compare nested objects
            if (is_object($value) && isset($snapshot->$key) && is_object($snapshot->$key)) {
                $nested_diffs = $this->findDifferences($value, $snapshot->$key, $full_path);
                $differences = array_merge($differences, $nested_diffs);
            } elseif (is_array($value) && isset($snapshot->$key) && is_array($snapshot->$key)) {
                // For arrays, compare first element structure if both non-empty
                if (!empty($value) && !empty($snapshot->$key)) {
                    if (is_object($value[0]) && is_object($snapshot->$key[0])) {
                        $nested_diffs = $this->findDifferences($value[0], $snapshot->$key[0], $full_path . '[0]');
                        $differences = array_merge($differences, $nested_diffs);
                    }
                }
            }
        }

        // Check for removed fields
        foreach ($snapshot_keys as $key => $value) {
            $full_path = $path ? "$path.$key" : $key;
            
            if (!array_key_exists($key, $current_keys)) {
                $differences[] = [
                    'type' => 'removed',
                    'path' => $full_path,
                    'message' => "Field '$full_path' exists in snapshot but not in current (BREAKING CHANGE)"
                ];
            }
        }

        return $differences;
    }

    /**
     * FORMAT_DIFFERENCES
     * Format differences array as readable string
     *
     * @param array $differences Differences array
     * @return string Formatted message
     */
    private function formatDifferences(array $differences): string {
        $lines = [];
        
        foreach ($differences as $diff) {
            $icon = $diff['type'] === 'removed' ? '⚠️' : 'ℹ️';
            $lines[] = "$icon {$diff['message']}";
        }

        return "\n" . implode("\n", $lines);
    }

    /**
     * SAVE_SNAPSHOT
     * Save data as snapshot to disk
     *
     * @param string $name Snapshot name (without extension)
     * @param object|array $data Data to save
     * @return bool True on success
     */
    public function saveSnapshot(string $name, object|array $data): bool {
        $filepath = $this->getSnapshotPath($name);
        $normalized = $this->normalizeForComparison($data);
        
        $json = json_encode($normalized, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        
        $result = file_put_contents($filepath, $json);
        
        return $result !== false;
    }

    /**
     * LOAD_SNAPSHOT
     * Load snapshot from disk
     *
     * @param string $name Snapshot name (without extension)
     * @return object|null Snapshot data or null if not found
     */
    public function loadSnapshot(string $name): ?object {
        $filepath = $this->getSnapshotPath($name);
        
        if (!file_exists($filepath)) {
            return null;
        }

        $json = file_get_contents($filepath);
        $data = json_decode($json);
        
        return $data !== null ? $data : null;
    }

    /**
     * GET_SNAPSHOT_PATH
     * Get full path for snapshot file
     *
     * @param string $name Snapshot name
     * @return string Full file path
     */
    public function getSnapshotPath(string $name): string {
        return $this->snapshots_dir . '/' . $name . '.json';
    }

    /**
     * SNAPSHOT_EXISTS
     * Check if snapshot exists
     *
     * @param string $name Snapshot name
     * @return bool True if exists
     */
    public function snapshotExists(string $name): bool {
        return file_exists($this->getSnapshotPath($name));
    }

    /**
     * GET_ALL_SNAPSHOTS
     * Get list of all available snapshots
     *
     * @return array List of snapshot names (without extension)
     */
    public function getAllSnapshots(): array {
        $snapshots = [];
        $files = glob($this->snapshots_dir . '/*.json');
        
        foreach ($files as $file) {
            $snapshots[] = basename($file, '.json');
        }
        
        return $snapshots;
    }

}//end SnapshotComparator
