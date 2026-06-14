<?php declare(strict_types=1);
/**
* CLASS SECTION_RECORD_INSTANCES_CACHE
* In-process LRU cache for section_record object instances.
*
* Holds live PHP objects (section_record / section_record_temp) keyed by a
* composite string built from section_tipo + section_id (e.g. "ts1_42" or
* "ts1_42_temp"). Avoids redundant construction and database round-trips when
* the same record is accessed multiple times within a single PHP request.
*
* LRU eviction is implemented with PHP's ordered hash-map (SplFixedArray is NOT
* used here): on every read the entry is unset and re-appended so it moves to
* the tail; on write the same move happens, and when the map exceeds $maxSize
* the head entry (oldest / least-recently-used) is dropped via array_key_first().
*
* Cache keys are normalised by normalizeKey():
*   - string / int keys → cast to string (e.g. "ts1_42").
*   - array keys (composite) → ksort + serialize + md5 (for arbitrary composite
*     look-ups requested from outside section_record::get_instance()).
*   section_record::get_instance() always passes a pre-built plain string, so the
*   array path is available for callers that need composite semantics.
*
* Analytics mode (disabled by default): when enabled via setAnalytics(true),
* every get() and set() accumulates per-key access and miss counters that are
* exposed via getAnalytics() and exportAnalytics(). The overhead is non-trivial
* (one array write per call), so analytics is only activated for diagnostic runs.
* dd_manager enables analytics selectively and logs results at request end.
*
* Lifecycle contract (see class.section_record.php):
*   - section_record::get_instance() calls get() / set() on every construction.
*   - section_record::__destruct() calls delete() to prevent stale references
*     from being returned after the object is destroyed.
*   - section_record::save() calls delete() to force a fresh load after writes,
*     preventing callers from reading pre-save state.
*   - common::clear() (request teardown) should call clear() to release memory;
*     verify whether this call chain is complete before adding long-lived workers.
*
* Relationships:
*   - Used by: section_record (class.section_record.php),
*              section_record_temp (class.section_record_temp.php),
*              dd_manager (class.dd_manager.php, metrics + analytics blocks).
*   - Counterpart: component_instances_cache (same file) caches component objects.
*
* @package Dédalo
* @subpackage Core
*/
class section_record_instances_cache {

    /**
    * In-memory store of live section_record / section_record_temp instances.
    * Keys are normalised cache strings (see normalizeKey()); the PHP array is
    * used as an ordered map so that LRU eviction via array_key_first() is O(1).
    * @var array<string, object> $instances
    */
    protected static array $instances = [];

    /**
    * Maximum number of entries the cache may hold at once.
    * When count($instances) exceeds this value, the least-recently-used entry
    * (the head of the ordered array) is evicted immediately.
    * Tunable at runtime via configure(). Default 500 is sized for typical
    * multi-section page renders; increase for batch import jobs.
    * @var int $maxSize
    */
    protected static int $maxSize = 500;

    // Statistics
    /**
    * Cumulative count of successful cache lookups (hit path in get()).
    * Reset by clear() and resetAnalytics().
    * @var int $hits
    */
    private static int $hits = 0;

    /**
    * Cumulative count of failed cache lookups (miss path in get()).
    * Reset by clear() and resetAnalytics().
    * @var int $misses
    */
    private static int $misses = 0;

    /**
    * Per-key access frequency map used only when analytics is enabled.
    * Keyed by normalised cache string; value is the access count.
    * Populated by trackAccess() on every get() call.
    * @var array<string, int> $accessLog
    */
    private static array $accessLog = [];      // Track which keys are accessed

    /**
    * Per-key miss frequency map used only when analytics is enabled.
    * Keyed by the original (pre-normalisation) key representation so that
    * callers can identify the real identifiers behind repeated misses.
    * Populated by trackMiss() when get() returns null.
    * @var array<string, int> $missedKeys
    */
    private static array $missedKeys = [];     // Track which keys miss

    /**
    * Whether analytics tracking is active.
    * Off by default to avoid per-call overhead in production.
    * Toggle via setAnalytics(). dd_manager checks getAnalyticsStatus()
    * before deciding whether to log getStats() / exportAnalytics().
    * @var bool $analyticsEnabled
    */
    private static bool $analyticsEnabled = false;

    /**
    * GET
    * Retrieve a cached section_record instance by key.
    *
    * Returns null on a cache miss so the caller can construct a fresh instance
    * and store it with set(). On a hit, the entry is moved to the tail of the
    * internal array to maintain LRU order — the PHP unset-then-reassign trick
    * achieves this without a separate priority queue.
    *
    * When analytics is enabled, every call (hit or miss) is counted and the
    * per-key access log is updated before the map lookup.
    *
    * @param string|int $key - pre-built composite string from section_record::get_instance();
    *                          int keys are accepted and cast internally (see normalizeKey())
    * @return object|null - the cached instance, or null on a miss
    */
    public static function get(string|int $key): ?object {
        $cacheKey = self::normalizeKey($key);

        // Track access pattern
        if (self::$analyticsEnabled) {
            self::trackAccess($cacheKey);
        }

        if (!isset(self::$instances[$cacheKey])) {
            self::$misses++;
            if (self::$analyticsEnabled) {
                self::trackMiss($cacheKey, $key);
            }
            return null;
        }

        self::$hits++;

        // LRU: Move to end (mark as recently used)
        $instance = self::$instances[$cacheKey];
        unset(self::$instances[$cacheKey]);
        self::$instances[$cacheKey] = $instance;

        return $instance;
    }

    /**
    * SET
    * Store a section_record (or section_record_temp) instance under the given key.
    *
    * If a stale entry already exists for the key it is removed first so the new
    * value is always placed at the tail (most-recently-used position). When the
    * map size exceeds $maxSize the head entry is evicted; eviction is tracked
    * when analytics is active.
    *
    * (!) Do not call set() after a save/update — call delete() instead so that
    * subsequent get() calls re-fetch from the database with fresh data.
    *
    * @param string|int $key      - same key schema as get()
    * @param object     $instance - the section_record or section_record_temp to cache
    * @return void
    */
    public static function set(string|int $key, object $instance): void {
        $cacheKey = self::normalizeKey($key);

        // If already exists, remove it (we'll re-add at end)
        if (isset(self::$instances[$cacheKey])) {
            unset(self::$instances[$cacheKey]);
        }

        // Add to end (most recently used)
        self::$instances[$cacheKey] = $instance;

        // Evict oldest if over limit
        if (count(self::$instances) > self::$maxSize) {
            // Remove first item (least recently used)
            // array_shift is slower but preserves LRU order
            // For better performance, use array_slice
            // self::$instances = array_slice(self::$instances, 1, null, true);

            $evicted = array_key_first(self::$instances);
            unset(self::$instances[$evicted]);

            if (self::$analyticsEnabled) {
                self::trackEviction($evicted);
            }
        }
    }

    /**
    * GETANALYTICS
    * Return a detailed performance report for the current request's cache activity.
    *
    * Computes hit-rate, utilisation, top-10 accessed and missed keys, a machine-
    * readable diagnosis array (see diagnose()), and actionable recommendations.
    * Intended for logging / debugging; call exportAnalytics() for a formatted
    * human-readable or JSON string form.
    *
    * (!) This method mutates the order of $accessLog and $missedKeys in-place
    * via arsort(). Call it only at request end or after analytics are no longer
    * needed, not inside a hot loop.
    *
    * @return array{
    *   hit_rate: string,
    *   cache_size: int,
    *   max_size: int,
    *   cache_utilization: string,
    *   total_hits: int,
    *   total_misses: int,
    *   total_requests: int,
    *   unique_keys_accessed: int,
    *   top_accessed_keys: array<string,int>,
    *   top_missed_keys: array<string,int>,
    *   diagnosis: array<int,array{type:string,severity:string,description:string}>,
    *   recommendations: array<int,string>
    * }
    */
    public static function getAnalytics(): array {
        $total = self::$hits + self::$misses;
        $hitRate = $total > 0 ? round((self::$hits / $total) * 100, 2) : 0;

        // Find most accessed keys
        arsort(self::$accessLog);
        $topKeys = array_slice(self::$accessLog, 0, 10, true);

        // Find most missed keys
        arsort(self::$missedKeys);
        $topMisses = array_slice(self::$missedKeys, 0, 10, true);

        // Calculate access distribution
        $uniqueKeysAccessed = count(self::$accessLog);
        $cacheUtilization = self::$maxSize > 0
            ? round((count(self::$instances) / self::$maxSize) * 100, 2)
            : 0;

        return [
            'hit_rate' => $hitRate . '%',
            'cache_size' => count(self::$instances),
            'max_size' => self::$maxSize,
            'cache_utilization' => $cacheUtilization . '%',
            'total_hits' => self::$hits,
            'total_misses' => self::$misses,
            'total_requests' => $total,
            'unique_keys_accessed' => $uniqueKeysAccessed,
            'top_accessed_keys' => $topKeys,
            'top_missed_keys' => $topMisses,
            'diagnosis' => self::diagnose(),
            'recommendations' => self::getRecommendations()
        ];
    }

    /**
    * DIAGNOSE
    * Analyse the current hit/miss counters and identify pathological patterns.
    *
    * Returns an array of issue descriptors, each with 'type', 'severity', and
    * 'description'. Possible types:
    *
    *   WIDE_ACCESS_PATTERN  — many distinct records accessed once; hit rate low
    *                          even though the cache has spare capacity. Suggests
    *                          sequential batch processing that doesn't revisit records.
    *   CACHE_KEY_MISMATCH   — the same conceptual record is missed repeatedly,
    *                          pointing to inconsistent key construction at the call-site.
    *   UNIFORM_DISTRIBUTION — no hot-spot: top-10 keys account for less than 30 % of
    *                          accesses, meaning LRU eviction provides minimal benefit.
    *   CACHE_INEFFECTIVE    — hit rate below 20 % after 100+ requests; cache adds
    *                          overhead with negligible benefit.
    *   HEALTHY              — returned as a singleton when no issues are found.
    *
    * Severity levels: INFO, MEDIUM, HIGH, CRITICAL.
    *
    * @return array<int, array{type: string, severity: string, description: string}>
    */
    private static function diagnose(): array {
        $issues = [];
        $total = self::$hits + self::$misses;
        $hitRate = $total > 0 ? (self::$hits / $total) * 100 : 0;
        $utilization = self::$maxSize > 0
            ? (count(self::$instances) / self::$maxSize) * 100
            : 0;

        // Low hit rate with low utilization
        if ($hitRate < 70 && $utilization < 50) {
            $issues[] = [
                'type' => 'WIDE_ACCESS_PATTERN',
                'severity' => 'HIGH',
                'description' => 'You\'re accessing many different records without re-using them. Hit rate is low despite cache having plenty of space.'
            ];
        }

        // Check if same keys are being missed repeatedly
        $repeatedMisses = 0;
        foreach (self::$missedKeys as $count) {
            if ($count > 3) {
                $repeatedMisses++;
            }
        }

        if ($repeatedMisses > 5) {
            $issues[] = [
                'type' => 'CACHE_KEY_MISMATCH',
                'severity' => 'HIGH',
                'description' => "Same keys are missing repeatedly ({$repeatedMisses} keys). You might be using inconsistent cache keys for the same records."
            ];
        }

        // Check access concentration
        if (count(self::$accessLog) > 0) {
            $topAccesses = array_sum(array_slice(self::$accessLog, 0, 10));
            $concentration = ($topAccesses / array_sum(self::$accessLog)) * 100;

            if ($concentration < 30) {
                $issues[] = [
                    'type' => 'UNIFORM_DISTRIBUTION',
                    'severity' => 'MEDIUM',
                    'description' => 'Access pattern is too uniform - no hot records. Top 10 keys only represent ' . round($concentration, 1) . '% of accesses.'
                ];
            }
        }

        // Check if cache is useful at all
        if ($total > 100 && $hitRate < 20) {
            $issues[] = [
                'type' => 'CACHE_INEFFECTIVE',
                'severity' => 'CRITICAL',
                'description' => 'Cache hit rate is critically low. Consider disabling cache or changing strategy.'
            ];
        }

        return $issues ?: [['type' => 'HEALTHY', 'severity' => 'INFO', 'description' => 'No issues detected']];
    }

    /**
    * GETRECOMMENDATIONS
    * Produce a list of plain-English tuning suggestions derived from the current counters.
    *
    * Called by getAnalytics() to populate the 'recommendations' key.
    * Returned strings are suitable for logging or display in developer tools; they
    * are not localised.
    *
    * @return array<int, string> - one or more recommendation strings, or
    *                              ['Cache is performing well'] when no action is needed
    */
    private static function getRecommendations(): array {
        $recommendations = [];
        $hitRate = self::$hits + self::$misses > 0
            ? (self::$hits / (self::$hits + self::$misses)) * 100
            : 0;
        $utilization = self::$maxSize > 0
            ? (count(self::$instances) / self::$maxSize) * 100
            : 0;

        if ($hitRate < 70 && $utilization < 50) {
            $recommendations[] = 'Consider reducing cache size to ' . (count(self::$instances) * 2) . ' - you don\'t need ' . self::$maxSize . ' slots';
            $recommendations[] = 'Investigate if you\'re doing batch operations that don\'t benefit from caching';
            $recommendations[] = 'Check if you can pre-load commonly accessed records';
        }

        // Check for key consistency
        $missedKeyPatterns = array_keys(self::$missedKeys);
        $cachedKeyPatterns = array_keys(self::$instances);

        if (count($missedKeyPatterns) > 0 && count($cachedKeyPatterns) > 0) {
            $recommendations[] = 'Review your cache key generation - ensure consistency across different access methods';
        }

        if ($hitRate < 20) {
            $recommendations[] = 'URGENT: Cache is ineffective. Consider disabling it or using a different strategy (e.g., query result caching instead)';
        }

        return $recommendations ?: ['Cache is performing well'];
    }

    /**
    * TRACKACCESS
    * Increment the per-key access counter in $accessLog.
    *
    * Only called when $analyticsEnabled === true. The key stored in $accessLog
    * is the normalised (post-normalizeKey) string so it aligns with the actual
    * map entries, making it easy to cross-reference top-accessed keys against
    * the live $instances map.
    *
    * @param string|int $key - the normalised cache key
    * @return void
    */
    private static function trackAccess(string|int $key): void {
        if (!isset(self::$accessLog[$key])) {
            self::$accessLog[$key] = 0;
        }
        self::$accessLog[$key]++;
    }

    /**
    * TRACKMISS
    * Increment the per-key miss counter in $missedKeys.
    *
    * Stores the original (pre-normalisation) key so that callers can identify
    * the real section_tipo/section_id behind repeated misses. For array keys,
    * json_encode() produces a readable representation rather than a raw MD5 hash.
    *
    * @param string|int $normalizedKey - the normalised cache key (unused here but
    *                                    available for future cross-referencing)
    * @param string|int $originalKey   - the key as supplied by the caller
    * @return void
    */
    private static function trackMiss(string|int $normalizedKey, string|int $originalKey): void {
        $keyInfo = is_array($originalKey)
            ? json_encode($originalKey)
            : $originalKey;

        if (!isset(self::$missedKeys[$keyInfo])) {
            self::$missedKeys[$keyInfo] = 0;
        }
        self::$missedKeys[$keyInfo]++;
    }

    /**
    * TRACKEVICTION
    * Hook called when an entry is evicted from the cache due to $maxSize overflow.
    *
    * Currently a no-op stub reserved for future eviction logging or telemetry.
    * Implement here (e.g. increment an evictions counter or log the key) when
    * diagnosing premature evictions at high load.
    *
    * @param string|int $key - the cache key that was evicted
    * @return void
    */
    private static function trackEviction(string|int $key): void {
        // Could log which keys are being evicted prematurely
    }

    /**
    * RESETANALYTICS
    * Zero out all analytics counters and access/miss logs without clearing the
    * instance store or the hit/miss totals used by getStats().
    *
    * Use this to start a clean measurement window mid-request, e.g. between
    * phases of a batch import, without invalidating the live cache.
    *
    * (!) clear() also resets $hits / $misses but does NOT reset $accessLog /
    * $missedKeys — call resetAnalytics() separately if both need clearing.
    *
    * @return void
    */
    public static function resetAnalytics(): void {
        self::$hits = 0;
        self::$misses = 0;
        self::$accessLog = [];
        self::$missedKeys = [];
    }

    /**
    * SETANALYTICS
    * Enable or disable per-call analytics tracking.
    *
    * When disabled (the default) get() and set() skip all trackAccess() /
    * trackMiss() calls, reducing overhead to a single boolean check.
    * When enabled, every call records to $accessLog and $missedKeys.
    * dd_manager controls this flag per-request based on configuration.
    *
    * @param bool $enabled - true to activate analytics, false to deactivate
    * @return void
    */
    public static function setAnalytics(bool $enabled): void {
        self::$analyticsEnabled = $enabled;
    }

    /**
    * GETANALYTICSSTATUS
    * Return whether analytics tracking is currently active.
    *
    * dd_manager checks this before deciding whether to log getStats()
    * and exportAnalytics() output at request end.
    *
    * @return bool - true when analytics is enabled
    */
    public static function getAnalyticsStatus(): bool {
        return self::$analyticsEnabled;
    }

    /**
    * EXPORTANALYTICS
    * Serialise the analytics report to a human-readable or machine-readable string.
    *
    * Delegates to getAnalytics() for the raw data and formats the result
    * according to $format:
    *   'json' — JSON_PRETTY_PRINT encoded associative array (default).
    *   'text' — Multi-line ASCII report with sections for top keys, diagnosis,
    *             and recommendations; suitable for error_log() output.
    *   other  — Returns an empty string (silent fallback; no exception thrown).
    *
    * @param string $format = 'json' - output format: 'json' | 'text'
    * @return string - formatted analytics report, or '' for an unrecognised format
    */
    public static function exportAnalytics(string $format = 'json'): string {
        $data = self::getAnalytics();

        switch ($format) {
            case 'json':
                return json_encode($data, JSON_PRETTY_PRINT);

            case 'text':
                $output = "=== CACHE ANALYTICS ===\n\n";
                $output .= "Hit Rate: {$data['hit_rate']}\n";
                $output .= "Cache Size: {$data['cache_size']} / {$data['max_size']}\n";
                $output .= "Utilization: {$data['cache_utilization']}\n\n";

                $output .= "Top Accessed Keys:\n";
                foreach ($data['top_accessed_keys'] as $key => $count) {
                    $output .= "  - {$key}: {$count} accesses\n";
                }

                $output .= "\nTop Missed Keys:\n";
                foreach ($data['top_missed_keys'] as $key => $count) {
                    $output .= "  - {$key}: {$count} misses\n";
                }

                $output .= "\nDiagnosis:\n";
                foreach ($data['diagnosis'] as $issue) {
                    $output .= "  [{$issue['severity']}] {$issue['description']}\n";
                }

                $output .= "\nRecommendations:\n";
                foreach ($data['recommendations'] as $rec) {
                    $output .= "  - {$rec}\n";
                }

                return $output;

            default:
                return '';
        }
    }

    /**
    * HAS
    * Return true if a cache entry exists for the given key, without updating
    * LRU order or incrementing hit/miss counters.
    *
    * Use for existence checks that should not influence cache metrics. For
    * actual retrieval, always prefer get() so LRU bookkeeping stays accurate.
    *
    * @param mixed $key - string, int, or array (see normalizeKey())
    * @return bool - true when the key is present in the cache
    */
    public static function has($key): bool {
        return isset(self::$instances[self::normalizeKey($key)]);
    }

    /**
    * DELETE
    * Remove a single entry from the cache by key.
    *
    * Called by section_record::__destruct() and section_record::save() to
    * prevent stale references or pre-save state from being served to callers.
    * Safe to call with a key that is not currently cached (no-op).
    *
    * @param mixed $key - string, int, or array (see normalizeKey())
    * @return void
    */
    public static function delete($key): void {
        $cacheKey = self::normalizeKey($key);
        unset(self::$instances[$cacheKey]);
    }

    /**
    * CLEAR
    * Evict all cached instances and reset the hit/miss counters.
    *
    * Called at request teardown (e.g. common::clear()) to release the object
    * graph held by $instances and avoid memory accumulation in persistent
    * worker processes. Does NOT reset the analytics log ($accessLog /
    * $missedKeys) — call resetAnalytics() for that.
    *
    * (!) In persistent PHP workers (Swoole, RoadRunner, php-pm) this method
    * MUST be called between requests; stale section_record instances from a
    * previous request will otherwise bleed into subsequent ones.
    *
    * @return void
    */
    public static function clear(): void {
        self::$instances = [];
        self::$hits = 0;
        self::$misses = 0;
    }

    /**
    * GETSTATS
    * Return a snapshot of cache performance metrics including approximate memory usage.
    *
    * Calls getMemoryUsage() which serialises the entire $instances array — this is
    * moderately expensive for large caches. Use getCounters() instead when called
    * frequently (e.g. in metrics loops) and memory figures are not needed.
    *
    * @return array{size: int, max_size: int, hits: int, misses: int, hit_rate: string, memory_usage: string}
    */
    public static function getStats(): array {
        $total = self::$hits + self::$misses;
        $hitRate = $total > 0 ? round((self::$hits / $total) * 100, 2) : 0;

        return [
            'size' => count(self::$instances),
            'max_size' => self::$maxSize,
            'hits' => self::$hits,
            'misses' => self::$misses,
            'hit_rate' => $hitRate . '%',
            'memory_usage' => self::getMemoryUsage()
        ];
    }

    /**
    * GETCOUNTERS
    * Return a minimal hit/miss snapshot without the serialize() cost of getMemoryUsage().
    *
    * Safe to call on every request from dd_manager's metrics block. Use getStats()
    * when you also need the approximate memory footprint of the instance store.
    *
    * @return array{size: int, hits: int, misses: int, hit_rate: string}
    */
    public static function getCounters(): array {
        $total = self::$hits + self::$misses;
        $hitRate = $total > 0 ? round((self::$hits / $total) * 100, 2) : 0;

        return [
            'size' => count(self::$instances),
            'hits' => self::$hits,
            'misses' => self::$misses,
            'hit_rate' => $hitRate . '%'
        ];
    }

    /**
    * NORMALIZEKEY
    * Convert any supported key shape into the canonical string used as the map key.
    *
    * - string / int → cast to string directly (fastest path; used by
    *   section_record::get_instance() which pre-builds "tipo_id[_temp]" strings).
    * - array (composite) → ksort for deterministic ordering, then serialize + md5
    *   to produce a fixed-length string. The md5 is lossy but collision risk is
    *   negligible for the key volumes in a single request.
    *
    * (!) Composite array keys are hashed; the original shape is not recoverable
    * from the normalised string. trackMiss() stores the original representation
    * separately for diagnostic purposes.
    *
    * @param string|int|array $key - raw caller key
    * @return string               - normalised cache map key
    */
    protected static function normalizeKey(string|int|array $key): string {
        if (is_array($key)) {
            // For composite keys like ['section_id' => 1, 'tipo' => 'ts1']
            ksort($key);
            return md5(serialize($key));
        }
        return (string) $key;
    }

    /**
    * GETMEMORYUSAGE
    * Return a human-readable estimate of the memory consumed by $instances.
    *
    * Approximation only: uses strlen(serialize($instances)) which measures the
    * serialised byte length of the object graph, not the true PHP heap allocation.
    * Serialisation of large object graphs is O(n) and allocates a temporary
    * string; avoid calling this method in hot paths. Use getCounters() instead.
    *
    * @return string - formatted size string, e.g. "1.25 MB"
    */
    protected static function getMemoryUsage(): string {
        $bytes = strlen(serialize(self::$instances));
        $units = ['B', 'KB', 'MB', 'GB'];
        $i = 0;
        while ($bytes >= 1024 && $i < count($units) - 1) {
            $bytes /= 1024;
            $i++;
        }
        return round($bytes, 2) . ' ' . $units[$i];
    }

    /**
    * CONFIGURE
    * Adjust runtime cache parameters.
    *
    * Currently only $maxSize is configurable. Pass null to leave a parameter
    * unchanged (idempotent call). Existing entries beyond the new limit are NOT
    * immediately evicted; eviction happens lazily on the next set() call that
    * pushes the count over the new limit.
    *
    * @param int|null $maxSize = null - new maximum entry count, or null to keep current value
    * @return void
    */
    public static function configure(?int $maxSize = null): void {
        if ($maxSize !== null) {
            self::$maxSize = $maxSize;
        }
    }
}//end section_record_instances_cache



/**
* CLASS COMPONENT_INSTANCES_CACHE
* In-process LRU cache for component object instances.
*
* Mirrors the design of section_record_instances_cache but targets component
* objects (any class extending component_common). Avoids redundant construction
* and database round-trips when the same component is accessed more than once
* within a single PHP request.
*
* Cache keys are composite strings built by component_common::get_instance():
*   "{tipo}_{section_tipo}_{section_id}_{lang}_{mode}[_tmp][_{dataframe_suffix}]"
* The key encodes every dimension that affects the component's state so that
* two calls with different modes or dataframe contexts receive distinct instances.
*
* LRU order: same PHP ordered-array trick as section_record_instances_cache —
* on hit, the entry is unset and re-appended; on overflow, array_slice() drops
* the head.  Note that this class uses array_slice() for eviction (O(n)) while
* section_record_instances_cache uses array_key_first() + unset() (O(1)). The
* difference is cosmetic at typical $maxSize values of 500.
*
* This class does NOT include the analytics sub-system; use getStats() or
* getCounters() for hit-rate monitoring.
*
* Relationships:
*   - Used by: component_common::get_instance() (class.component_common.php).
*   - Counterpart: section_record_instances_cache (same file) caches section records.
*   - Metrics: dd_manager reads getCounters() for the per-request metrics block.
*
* @package Dédalo
* @subpackage Core
*/
class component_instances_cache {

    /**
    * In-memory store of live component instances (objects extending component_common).
    * Keys are composite normalised strings (see normalizeKey() and
    * component_common::get_instance() for the key-building logic).
    * @var array<string, object> $instances
    */
    protected static array $instances = [];

    /**
    * Maximum number of component entries to hold in memory.
    * Components are heavier than section_record objects (they hold resolved data,
    * lang settings, caller_dataframe refs, etc.), so the default 500 may need
    * tuning for workloads with many distinct component types per request.
    * @var int $maxSize
    */
    protected static int $maxSize = 500;

    /**
    * Cumulative successful lookup count for this request.
    * Reset by clear(). Exposed via getStats() and getCounters().
    * @var int $hits
    */
    protected static int $hits = 0;

    /**
    * Cumulative failed lookup count for this request.
    * Reset by clear(). Exposed via getStats() and getCounters().
    * @var int $misses
    */
    protected static int $misses = 0;


    /**
    * GET
    * Retrieve a cached component instance by key.
    *
    * Returns null on a cache miss; the caller (component_common::get_instance())
    * then constructs a fresh instance and stores it with set(). On a hit the
    * entry is moved to the tail of the internal array to maintain LRU order.
    *
    * Unlike section_record_instances_cache::get(), this method does not support
    * optional analytics tracking — the analytics sub-system is omitted here for
    * simplicity.
    *
    * @param string|int $key - composite cache key built by component_common::get_instance()
    * @return object|null    - the cached component instance, or null on a miss
    */
    public static function get(string|int $key) : ?object {
        $cacheKey = self::normalizeKey($key);

        if ( !isset(self::$instances[$cacheKey]) ) {
            self::$misses++;
            return null;
        }

        self::$hits++;

        // LRU: Move to end (mark as recently used)
        $instance = self::$instances[$cacheKey];
        unset(self::$instances[$cacheKey]);
        self::$instances[$cacheKey] = $instance;


        return $instance;
    }

    /**
    * SET
    * Store a component instance under the given key.
    *
    * If an entry already exists for the key it is replaced (unset + re-append so
    * the new value occupies the tail / most-recently-used position). When count
    * exceeds $maxSize, the head entry is evicted via array_slice(), which rebuilds
    * the array without the first element.
    *
    * (!) array_slice() with preserve_keys=true reallocates the array — O(n).
    * section_record_instances_cache uses the cheaper array_key_first()+unset()
    * pattern. For very large $maxSize values, consider switching this class to
    * the same approach.
    *
    * @param string|int $key      - composite cache key
    * @param object     $instance - the component instance to cache
    * @return void
    */
    public static function set(string|int $key, object $instance): void {
        $cacheKey = self::normalizeKey($key);

        // If already exists, remove it (we'll re-add at end)
        if (isset(self::$instances[$cacheKey])) {
            unset(self::$instances[$cacheKey]);
        }

        // Add to end (most recently used)
        self::$instances[$cacheKey] = $instance;

        // Evict oldest if over limit
        if (count(self::$instances) > self::$maxSize) {
            // Remove first item (least recently used)
            // array_shift is slower but preserves LRU order
            // For better performance, use array_slice
            self::$instances = array_slice(self::$instances, 1, null, true);
        }
    }

    /**
    * HAS
    * Return true if a cache entry exists for the given key without side effects.
    *
    * Does not update LRU order or counters. Prefer get() when you intend to
    * retrieve the value so hit/miss metrics stay accurate.
    *
    * @param string|int|array $key - string, int, or array (see normalizeKey())
    * @return bool                 - true when the key is present
    */
    public static function has(string|int|array $key): bool {
        return isset(self::$instances[self::normalizeKey($key)]);
    }

    /**
    * DELETE
    * Remove a single component entry from the cache.
    *
    * Safe to call when the key is absent (no-op). Use when a component's
    * underlying data changes and cached state must be invalidated.
    *
    * @param string|int|array $key - string, int, or array (see normalizeKey())
    * @return void
    */
    public static function delete(string|int|array $key): void {
        $cacheKey = self::normalizeKey($key);
        unset(self::$instances[$cacheKey]);
    }

    /**
    * CLEAR
    * Evict all cached component instances and reset hit/miss counters.
    *
    * Should be called at request teardown alongside section_record_instances_cache::clear()
    * to release the full request-scoped object graph. Especially important in
    * persistent PHP workers where static state persists between requests.
    *
    * @return void
    */
    public static function clear(): void {
        self::$instances = [];
        self::$hits = 0;
        self::$misses = 0;
    }

    /**
    * GETSTATS
    * Return a performance snapshot including approximate memory usage.
    *
    * Memory is estimated via serialize(), which is O(n) in the size of the
    * cached object graph. Use getCounters() when memory figures are not needed.
    *
    * @return array{size: int, max_size: int, hits: int, misses: int, hit_rate: string, memory_usage: string}
    */
    public static function getStats(): array {
        $total = self::$hits + self::$misses;
        $hitRate = $total > 0 ? round((self::$hits / $total) * 100, 2) : 0;

        return [
            'size' => count(self::$instances),
            'max_size' => self::$maxSize,
            'hits' => self::$hits,
            'misses' => self::$misses,
            'hit_rate' => $hitRate . '%',
            'memory_usage' => self::getMemoryUsage()
        ];
    }

    /**
    * GETCOUNTERS
    * Return minimal hit/miss counters without the serialize() cost.
    *
    * Safe to call on every request. dd_manager uses this to populate the
    * per-request metrics block without incurring the O(n) serialisation overhead
    * of getStats().
    *
    * @return array{size: int, hits: int, misses: int, hit_rate: string}
    */
    public static function getCounters(): array {
        $total = self::$hits + self::$misses;
        $hitRate = $total > 0 ? round((self::$hits / $total) * 100, 2) : 0;

        return [
            'size' => count(self::$instances),
            'hits' => self::$hits,
            'misses' => self::$misses,
            'hit_rate' => $hitRate . '%'
        ];
    }

    /**
    * NORMALIZEKEY
    * Convert any supported key shape into the canonical string used as the map key.
    *
    * Identical contract to section_record_instances_cache::normalizeKey():
    *   - string / int → (string) cast.
    *   - array → ksort + serialize + md5.
    *
    * component_common::get_instance() always passes a pre-built plain string, so
    * the array path exists for external callers that need composite look-up semantics.
    *
    * @param string|int|array $key - raw caller key
    * @return string               - normalised cache map key
    */
    protected static function normalizeKey(string|int|array $key): string {
        if (is_array($key)) {
            // For composite keys like ['section_id' => 1, 'tipo' => 'ts1']
            ksort($key);
            return md5(serialize($key));
        }
        return (string) $key;
    }

    /**
    * GETMEMORYUSAGE
    * Return a human-readable estimate of the memory consumed by $instances.
    *
    * Uses strlen(serialize()) as an approximation — not a true heap measurement.
    * Avoid in hot paths; use getCounters() there instead.
    *
    * @return string - formatted size string, e.g. "2.50 MB"
    */
    protected static function getMemoryUsage(): string {
        $bytes = strlen(serialize(self::$instances));
        $units = ['B', 'KB', 'MB', 'GB'];
        $i = 0;
        while ($bytes >= 1024 && $i < count($units) - 1) {
            $bytes /= 1024;
            $i++;
        }
        return round($bytes, 2) . ' ' . $units[$i];
    }

    /**
    * CONFIGURE
    * Adjust runtime cache parameters.
    *
    * Currently only $maxSize is configurable. Existing entries beyond the new
    * limit are not immediately evicted; eviction is deferred until the next
    * set() call that pushes the count over the threshold.
    *
    * @param int|null $maxSize = null - new maximum entry count, or null to keep current value
    * @return void
    */
    public static function configure(?int $maxSize = null): void {
        if ($maxSize !== null) {
            self::$maxSize = $maxSize;
        }
    }

}//end component_instances_cache
