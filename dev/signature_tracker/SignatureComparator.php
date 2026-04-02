<?php declare(strict_types=1);
/**
 * SignatureComparator
 * Compares PHP class signatures against baseline to detect breaking changes
 *
 * @package Tools
 * @subpackage SignatureTracker
 */

require_once __DIR__ . '/SignatureExtractor.php';

class SignatureComparator {

    /**
     * BASELINES_DIR
     * Directory for storing baseline signature files
     */
    private string $baselines_dir;

    /**
     * EXTRACTOR
     * Signature extractor instance
     */
    private SignatureExtractor $extractor;

    /**
     * BREAKING_CHANGE_SEVERITY
     * Severity levels for breaking changes
     */
    public const SEVERITY_BREAKING = 'breaking';
    public const SEVERITY_WARNING = 'warning';
    public const SEVERITY_INFO = 'info';

    /**
     * Constructor
     * @param string|null $baselines_dir Optional custom baselines directory
     */
    public function __construct(?string $baselines_dir = null) {
        $this->baselines_dir = $baselines_dir ?? __DIR__ . '/baselines';
        $this->extractor = new SignatureExtractor();

        if (!is_dir($this->baselines_dir)) {
            mkdir($this->baselines_dir, 0755, true);
        }
    }

    /**
     * COMPARE_ALL
     * Compare all tracked classes against baseline
     *
     * @return array Comparison results with changes per class
     */
    public function compareAll(): array {
        $current = $this->extractor->extractAllSignatures();
        $baseline = $this->loadBaseline('signatures');

        if ($baseline === null) {
            return [
                'status' => 'no_baseline',
                'message' => 'No baseline found. Run with --create-baseline to create one.',
                'changes' => [],
            ];
        }

        $changes = [];
        $all_classes = array_unique(array_merge(
            array_keys($current),
            array_keys($baseline)
        ));

        foreach ($all_classes as $class_name) {
            $class_changes = $this->compareClass(
                $current[$class_name] ?? null,
                $baseline[$class_name] ?? null
            );

            if (!empty($class_changes)) {
                $changes[$class_name] = $class_changes;
            }
        }

        return [
            'status' => empty($changes) ? 'unchanged' : 'changed',
            'message' => empty($changes) 
                ? 'All signatures match baseline'
                : sprintf('Found changes in %d class(es)', count($changes)),
            'changes' => $changes,
            'breaking_count' => $this->countBreakingChanges($changes),
            'warning_count' => $this->countWarningChanges($changes),
        ];
    }

    /**
     * COMPARE_CLASS
     * Compare a single class signature against baseline
     *
     * @param array|null $current Current class signature
     * @param array|null $baseline Baseline class signature
     * @return array List of changes
     */
    private function compareClass(?array $current, ?array $baseline): array {
        $changes = [];

        // Class added
        if ($baseline === null && $current !== null) {
            return [[
                'type' => 'class_added',
                'severity' => self::SEVERITY_INFO,
                'message' => "New class '{$current['name']}' added",
            ]];
        }

        // Class removed
        if ($current === null && $baseline !== null) {
            return [[
                'type' => 'class_removed',
                'severity' => self::SEVERITY_BREAKING,
                'message' => "Class '{$baseline['name']}' removed",
            ]];
        }

        // Compare parent class
        if ($current['parent'] !== $baseline['parent']) {
            $changes[] = [
                'type' => 'parent_changed',
                'severity' => self::SEVERITY_BREAKING,
                'message' => sprintf(
                    "Parent class changed from '%s' to '%s'",
                    $baseline['parent'] ?? '(none)',
                    $current['parent'] ?? '(none)'
                ),
            ];
        }

        // Compare constants
        $changes = array_merge(
            $changes,
            $this->compareConstants($current['constants'], $baseline['constants'], $current['name'])
        );

        // Compare properties
        $changes = array_merge(
            $changes,
            $this->compareProperties($current['properties'], $baseline['properties'], $current['name'])
        );

        // Compare methods
        $changes = array_merge(
            $changes,
            $this->compareMethods($current['methods'], $baseline['methods'], $current['name'])
        );

        return $changes;
    }

    /**
     * COMPARE_CONSTANTS
     * Compare class constants
     *
     * @param array $current Current constants
     * @param array $baseline Baseline constants
     * @param string $class_name Class name for messages
     * @return array Constant changes
     */
    private function compareConstants(array $current, array $baseline, string $class_name): array {
        $changes = [];

        foreach ($current as $name => $info) {
            if (!isset($baseline[$name])) {
                $changes[] = [
                    'type' => 'constant_added',
                    'severity' => self::SEVERITY_INFO,
                    'message' => "Constant '{$class_name}::{$name}' added",
                ];
                continue;
            }

            // Type change
            if ($info['type'] !== $baseline[$name]['type']) {
                $changes[] = [
                    'type' => 'constant_type_changed',
                    'severity' => self::SEVERITY_WARNING,
                    'message' => sprintf(
                        "Constant '{$class_name}::{$name}' type changed from '%s' to '%s'",
                        $baseline[$name]['type'],
                        $info['type']
                    ),
                ];
            }

            // Visibility change (breaking if made private)
            if ($info['visibility'] !== $baseline[$name]['visibility']) {
                $severity = $info['visibility'] === 'private' 
                    ? self::SEVERITY_BREAKING 
                    : self::SEVERITY_WARNING;
                
                $changes[] = [
                    'type' => 'constant_visibility_changed',
                    'severity' => $severity,
                    'message' => sprintf(
                        "Constant '{$class_name}::{$name}' visibility changed from '%s' to '%s'",
                        $baseline[$name]['visibility'],
                        $info['visibility']
                    ),
                ];
            }
        }

        // Removed constants
        foreach ($baseline as $name => $info) {
            if (!isset($current[$name])) {
                $changes[] = [
                    'type' => 'constant_removed',
                    'severity' => self::SEVERITY_BREAKING,
                    'message' => "Constant '{$class_name}::{$name}' removed",
                ];
            }
        }

        return $changes;
    }

    /**
     * COMPARE_PROPERTIES
     * Compare class properties
     *
     * @param array $current Current properties
     * @param array $baseline Baseline properties
     * @param string $class_name Class name for messages
     * @return array Property changes
     */
    private function compareProperties(array $current, array $baseline, string $class_name): array {
        $changes = [];

        foreach ($current as $name => $info) {
            if (!isset($baseline[$name])) {
                $changes[] = [
                    'type' => 'property_added',
                    'severity' => self::SEVERITY_INFO,
                    'message' => "Property '{$class_name}::\${$name}' added",
                ];
                continue;
            }

            // Type change
            if ($info['type'] !== $baseline[$name]['type']) {
                $changes[] = [
                    'type' => 'property_type_changed',
                    'severity' => self::SEVERITY_BREAKING,
                    'message' => sprintf(
                        "Property '{$class_name}::\${$name}' type changed from '%s' to '%s'",
                        $baseline[$name]['type'],
                        $info['type']
                    ),
                ];
            }

            // Visibility change
            if ($info['visibility'] !== $baseline[$name]['visibility']) {
                $severity = $info['visibility'] === 'private' || $baseline[$name]['visibility'] === 'public'
                    ? self::SEVERITY_BREAKING 
                    : self::SEVERITY_WARNING;
                
                $changes[] = [
                    'type' => 'property_visibility_changed',
                    'severity' => $severity,
                    'message' => sprintf(
                        "Property '{$class_name}::\${$name}' visibility changed from '%s' to '%s'",
                        $baseline[$name]['visibility'],
                        $info['visibility']
                    ),
                ];
            }

            // Static change
            if ($info['static'] !== $baseline[$name]['static']) {
                $changes[] = [
                    'type' => 'property_static_changed',
                    'severity' => self::SEVERITY_BREAKING,
                    'message' => "Property '{$class_name}::\${$name}' static modifier changed",
                ];
            }
        }

        // Removed properties
        foreach ($baseline as $name => $info) {
            if (!isset($current[$name])) {
                $changes[] = [
                    'type' => 'property_removed',
                    'severity' => self::SEVERITY_BREAKING,
                    'message' => "Property '{$class_name}::\${$name}' removed",
                ];
            }
        }

        return $changes;
    }

    /**
     * COMPARE_METHODS
     * Compare class methods
     *
     * @param array $current Current methods
     * @param array $baseline Baseline methods
     * @param string $class_name Class name for messages
     * @return array Method changes
     */
    private function compareMethods(array $current, array $baseline, string $class_name): array {
        $changes = [];

        foreach ($current as $name => $info) {
            if (!isset($baseline[$name])) {
                $changes[] = [
                    'type' => 'method_added',
                    'severity' => self::SEVERITY_INFO,
                    'message' => "Method '{$class_name}::{$name}()' added",
                ];
                continue;
            }

            // Visibility change
            if ($info['visibility'] !== $baseline[$name]['visibility']) {
                $severity = $info['visibility'] === 'private' || $baseline[$name]['visibility'] === 'public'
                    ? self::SEVERITY_BREAKING 
                    : self::SEVERITY_WARNING;
                
                $changes[] = [
                    'type' => 'method_visibility_changed',
                    'severity' => $severity,
                    'message' => sprintf(
                        "Method '{$class_name}::{$name}()' visibility changed from '%s' to '%s'",
                        $baseline[$name]['visibility'],
                        $info['visibility']
                    ),
                ];
            }

            // Static change
            if ($info['static'] !== $baseline[$name]['static']) {
                $changes[] = [
                    'type' => 'method_static_changed',
                    'severity' => self::SEVERITY_BREAKING,
                    'message' => "Method '{$class_name}::{$name}()' static modifier changed",
                ];
            }

            // Abstract change
            if ($info['abstract'] !== $baseline[$name]['abstract']) {
                $severity = $baseline[$name]['abstract'] && !$info['abstract']
                    ? self::SEVERITY_INFO  // Made concrete - safe
                    : self::SEVERITY_BREAKING; // Made abstract - breaking
                
                $changes[] = [
                    'type' => 'method_abstract_changed',
                    'severity' => $severity,
                    'message' => "Method '{$class_name}::{$name}()' abstract modifier changed",
                ];
            }

            // Return type change
            if ($info['return_type'] !== $baseline[$name]['return_type']) {
                $changes[] = [
                    'type' => 'method_return_type_changed',
                    'severity' => self::SEVERITY_BREAKING,
                    'message' => sprintf(
                        "Method '{$class_name}::{$name}()' return type changed from '%s' to '%s'",
                        $this->formatReturnType($baseline[$name]['return_type']),
                        $this->formatReturnType($info['return_type'])
                    ),
                ];
            }

            // Parameter changes
            $param_changes = $this->compareParameters(
                $info['parameters'],
                $baseline[$name]['parameters'],
                $class_name,
                $name
            );
            $changes = array_merge($changes, $param_changes);
        }

        // Removed methods
        foreach ($baseline as $name => $info) {
            if (!isset($current[$name])) {
                $changes[] = [
                    'type' => 'method_removed',
                    'severity' => self::SEVERITY_BREAKING,
                    'message' => "Method '{$class_name}::{$name}()' removed",
                ];
            }
        }

        return $changes;
    }

    /**
     * COMPARE_PARAMETERS
     * Compare method parameters
     *
     * @param array $current Current parameters
     * @param array $baseline Baseline parameters
     * @param string $class_name Class name
     * @param string $method_name Method name
     * @return array Parameter changes
     */
    private function compareParameters(
        array $current,
        array $baseline,
        string $class_name,
        string $method_name
    ): array {
        $changes = [];

        // Check parameter count
        if (count($current) !== count($baseline)) {
            $changes[] = [
                'type' => 'method_parameter_count_changed',
                'severity' => self::SEVERITY_BREAKING,
                'message' => sprintf(
                    "Method '{$class_name}::{$method_name}()' parameter count changed from %d to %d",
                    count($baseline),
                    count($current)
                ),
            ];
        }

        // Compare each parameter
        $param_count = min(count($current), count($baseline));
        for ($i = 0; $i < $param_count; $i++) {
            $current_param = $current[$i];
            $baseline_param = $baseline[$i];

            // Name change (warning, not breaking)
            if ($current_param['name'] !== $baseline_param['name']) {
                $changes[] = [
                    'type' => 'parameter_name_changed',
                    'severity' => self::SEVERITY_WARNING,
                    'message' => sprintf(
                        "Parameter %d of '{$class_name}::{$method_name}()' renamed from '\$%s' to '\$%s'",
                        $i + 1,
                        $baseline_param['name'],
                        $current_param['name']
                    ),
                ];
            }

            // Type change
            if ($current_param['type'] !== $baseline_param['type']) {
                $changes[] = [
                    'type' => 'parameter_type_changed',
                    'severity' => self::SEVERITY_BREAKING,
                    'message' => sprintf(
                        "Parameter %d (\$%s) of '{$class_name}::{$method_name}()' type changed from '%s' to '%s'",
                        $i + 1,
                        $current_param['name'],
                        $baseline_param['type'],
                        $current_param['type']
                    ),
                ];
            }

            // Optional status change (breaking if made required)
            if ($current_param['optional'] !== $baseline_param['optional']) {
                $severity = !$current_param['optional'] && $baseline_param['optional']
                    ? self::SEVERITY_BREAKING  // Made required
                    : self::SEVERITY_WARNING;  // Made optional
                
                $changes[] = [
                    'type' => 'parameter_optional_changed',
                    'severity' => $severity,
                    'message' => sprintf(
                        "Parameter %d (\$%s) of '{$class_name}::{$method_name}()' %s",
                        $i + 1,
                        $current_param['name'],
                        $current_param['optional'] ? 'made optional' : 'made required'
                    ),
                ];
            }
        }

        return $changes;
    }

    /**
     * FORMAT_RETURN_TYPE
     * Format return type for display
     *
     * @param array $return_type Return type data
     * @return string Formatted type
     */
    private function formatReturnType(array $return_type): string {
        $type = $return_type['type'];
        if ($return_type['nullable']) {
            $type = '?' . $type;
        }
        return $type;
    }

    /**
     * COUNT_BREAKING_CHANGES
     * Count total breaking changes
     *
     * @param array $changes All changes
     * @return int Breaking change count
     */
    private function countBreakingChanges(array $changes): int {
        $count = 0;
        foreach ($changes as $class_changes) {
            foreach ($class_changes as $change) {
                if ($change['severity'] === self::SEVERITY_BREAKING) {
                    $count++;
                }
            }
        }
        return $count;
    }

    /**
     * COUNT_WARNING_CHANGES
     * Count total warning-level changes
     *
     * @param array $changes All changes
     * @return int Warning count
     */
    private function countWarningChanges(array $changes): int {
        $count = 0;
        foreach ($changes as $class_changes) {
            foreach ($class_changes as $change) {
                if ($change['severity'] === self::SEVERITY_WARNING) {
                    $count++;
                }
            }
        }
        return $count;
    }

    /**
     * CREATE_BASELINE
     * Create new baseline from current signatures
     *
     * @param string $name Baseline name
     * @return bool True on success
     */
    public function createBaseline(string $name = 'signatures'): bool {
        $signatures = $this->extractor->extractAllSignatures();
        
        $data = [
            'created_at' => date('Y-m-d H:i:s'),
            'version' => $this->getDedaloVersion(),
            'classes' => $signatures,
        ];

        $filepath = $this->getBaselinePath($name);
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        
        return file_put_contents($filepath, $json) !== false;
    }

    /**
     * LOAD_BASELINE
     * Load baseline from disk
     *
     * @param string $name Baseline name
     * @return array|null Baseline data or null
     */
    public function loadBaseline(string $name = 'signatures'): ?array {
        $filepath = $this->getBaselinePath($name);
        
        if (!file_exists($filepath)) {
            return null;
        }

        $json = file_get_contents($filepath);
        $data = json_decode($json, true);
        
        return $data['classes'] ?? null;
    }

    /**
     * GET_BASELINE_PATH
     * Get full path for baseline file
     *
     * @param string $name Baseline name
     * @return string Full path
     */
    private function getBaselinePath(string $name): string {
        return $this->baselines_dir . '/' . $name . '.json';
    }

    /**
     * GET_DEDALO_VERSION
     * Get current Dédalo version
     *
     * @return string Version string
     */
    private function getDedaloVersion(): string {
        return defined('DEDALO_VERSION') ? DEDALO_VERSION : 'unknown';
    }

    /**
     * HAS_BASELINE
     * Check if baseline exists
     *
     * @param string $name Baseline name
     * @return bool True if exists
     */
    public function hasBaseline(string $name = 'signatures'): bool {
        return file_exists($this->getBaselinePath($name));
    }

    /**
     * GET_REPORT
     * Generate human-readable report
     *
     * @param array $result Comparison result
     * @return string Formatted report
     */
    public function getReport(array $result): string {
        if ($result['status'] === 'no_baseline') {
            return "⚠️  {$result['message']}\n";
        }

        if ($result['status'] === 'unchanged') {
            return "✅ {$result['message']}\n";
        }

        $report = [];
        $report[] = "❌ {$result['message']}";
        $report[] = sprintf(
            "   Breaking: %d | Warnings: %d",
            $result['breaking_count'],
            $result['warning_count']
        );
        $report[] = "";

        foreach ($result['changes'] as $class_name => $changes) {
            $report[] = "Class: {$class_name}";
            
            foreach ($changes as $change) {
                $icon = match ($change['severity']) {
                    self::SEVERITY_BREAKING => '🔴',
                    self::SEVERITY_WARNING => '🟡',
                    default => '🟢',
                };
                
                $report[] = "  {$icon} {$change['message']}";
            }
            
            $report[] = "";
        }

        return implode("\n", $report);
    }

}//end SignatureComparator
