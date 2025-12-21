<?php declare(strict_types=1);
/**
* Optimized cache for section_record instances
* Uses LRU (Least Recently Used) eviction strategy.
* If hit rate is below 70%, consider increasing cache size or changing strategy.
*
*    // 1. Basic usage
*    $section = section_record_instances_cache::get($section_id);
*    if ($section === null) {
*        // Cache miss - load from database
*        $section = new section_record($section_id);
*        section_record_instances_cache::set($section_id, $section);
*    }
*
*    // 2. Composite keys (section + type)
*    $key = ['section_id' => 5, 'tipo' => 'ts1'];
*    $section = section_record_instances_cache::get($key);
*    if ($section === null) {
*        $section = new section_record($section_id, $tipo);
*        section_record_instances_cache::set($key, $section);
*    }
*
*    // 3. Get cache statistics
*    $stats = section_record_instances_cache::getStats();
*    error_log("Cache hit rate: " . $stats['hit_rate']);
*
*    // 4. Clear specific record when updated
*    section_record_instances_cache::delete($section_id);
*
*    // 5. Configure cache size
*    section_record_instances_cache::configure(maxSize: 2000);
*
*   // ============================================
*   // analytics USAGE
*   // ============================================
*
*   // 1. Enable analytics (enabled by default)
*   section_record_instances_cache::setAnalytics(true);
*
*   // 2. Use cache normally
*   $section_record = section_record_instances_cache::get($id);
*   if (!$section_record) {
*       $section_record = new section_record($id);
*       section_record_instances_cache::set($id, $section_record);
*   }
*
*   // 3. After some usage, get analytics
*   $analytics = section_record_instances_cache::getAnalytics();
*   print_r($analytics);
*
*   // 4. Or export as readable text
*   echo section_record_instances_cache::exportAnalytics('text');
*
*   // 5. Export as JSON for logging
*   error_log(section_record_instances_cache::exportAnalytics('json'));
*/
class section_record_instances_cache {
    
    protected static array $instances = [];
    protected static int $maxSize = 500;

    // Statistics
    private static int $hits = 0;
    private static int $misses = 0;
    private static array $accessLog = [];      // Track which keys are accessed
    private static array $missedKeys = [];     // Track which keys miss
    private static bool $analyticsEnabled = false;    
    
    /**
     * Get a cached section_record instance
     * 
     * @param string|int $key Unique identifier (section_id, tipo, etc.)
     * @return section_record|null
     */
    public static function get($key): ?object {
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
     * Store a section_record instance in cache
     * 
     * @param string|int $key Unique identifier
     * @param section_record $instance The record instance
     */
    public static function set($key, object $instance): void {
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
     * Get detailed analytics report
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
     * Diagnose cache performance issues
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
     * Get actionable recommendations
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
     * Track access patterns
     */
    private static function trackAccess(string $key): void {
        if (!isset(self::$accessLog[$key])) {
            self::$accessLog[$key] = 0;
        }
        self::$accessLog[$key]++;
    }
    
    /**
     * Track cache misses
     */
    private static function trackMiss(string $normalizedKey, $originalKey): void {
        $keyInfo = is_array($originalKey) 
            ? json_encode($originalKey) 
            : $originalKey;
        
        if (!isset(self::$missedKeys[$keyInfo])) {
            self::$missedKeys[$keyInfo] = 0;
        }
        self::$missedKeys[$keyInfo]++;
    }
    
    /**
     * Track evictions (future use)
     */
    private static function trackEviction(string $key): void {
        // Could log which keys are being evicted prematurely
    }
    
    /**
     * Reset analytics data
     */
    public static function resetAnalytics(): void {
        self::$hits = 0;
        self::$misses = 0;
        self::$accessLog = [];
        self::$missedKeys = [];
    }
    
    /**
     * Enable/disable analytics
     */
    public static function setAnalytics(bool $enabled): void {
        self::$analyticsEnabled = $enabled;
    }

    /**
     * Get analytics status
     */
    public static function getAnalyticsStatus(): bool {
        return self::$analyticsEnabled;
    }
    
    /**
     * Export analytics for external analysis
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
     * Check if key exists in cache
     */
    public static function has($key): bool {
        return isset(self::$instances[self::normalizeKey($key)]);
    }
    
    /**
     * Remove specific item from cache
     */
    public static function delete($key): void {
        $cacheKey = self::normalizeKey($key);
        unset(self::$instances[$cacheKey]);
    }
    
    /**
     * Clear entire cache
     */
    public static function clear(): void {
        self::$instances = [];
        self::$hits = 0;
        self::$misses = 0;
    }
    
    /**
     * Get cache statistics
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
     * Normalize cache key to string
     */
    protected static function normalizeKey($key): string {
        if (is_array($key)) {
            // For composite keys like ['section_id' => 1, 'tipo' => 'ts1']
            ksort($key);
            return md5(serialize($key));
        }
        return (string) $key;
    }
    
    /**
     * Get approximate memory usage
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
     * Configure cache settings
     */
    public static function configure(?int $maxSize = null): void {
        if ($maxSize !== null) {
            self::$maxSize = $maxSize;
        }
    }
}//end section_record_instances_cache



class component_instances_cache {

    protected static array $instances = [];
    protected static int $maxSize = 500;
    protected static int $hits = 0;
    protected static int $misses = 0;
    
    
    /**
     * Get a cached section_record instance
     * 
     * @param string|int $key Unique identifier (section_id, tipo, etc.)
     * @return section_record|null
     */
    public static function get($key): ?object {
        $cacheKey = self::normalizeKey($key);
        
        if (!isset(self::$instances[$cacheKey])) {
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
     * Store a section_record instance in cache
     * 
     * @param string|int $key Unique identifier
     * @param section_record $instance The record instance
     */
    public static function set($key, object $instance): void {
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
     * Check if key exists in cache
     */
    public static function has($key): bool {
        return isset(self::$instances[self::normalizeKey($key)]);
    }
    
    /**
     * Remove specific item from cache
     */
    public static function delete($key): void {
        $cacheKey = self::normalizeKey($key);
        unset(self::$instances[$cacheKey]);
    }
    
    /**
     * Clear entire cache
     */
    public static function clear(): void {
        self::$instances = [];
        self::$hits = 0;
        self::$misses = 0;
    }
    
    /**
     * Get cache statistics
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
     * Normalize cache key to string
     */
    protected static function normalizeKey($key): string {
        if (is_array($key)) {
            // For composite keys like ['section_id' => 1, 'tipo' => 'ts1']
            ksort($key);
            return md5(serialize($key));
        }
        return (string) $key;
    }
    
    /**
     * Get approximate memory usage
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
     * Configure cache settings
     */
    public static function configure(?int $maxSize = null): void {
        if ($maxSize !== null) {
            self::$maxSize = $maxSize;
        }
    }

}//end component_instances_cache
