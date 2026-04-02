<?php declare(strict_types=1);
/**
 * OntologyComparator
 * Compares ontology snapshots against baseline to detect breaking changes
 *
 * @package Tools
 * @subpackage OntologyTracker
 */

require_once __DIR__ . '/OntologySnapshotExtractor.php';

class OntologyComparator {

    /**
     * BASELINES_DIR
     * Directory for storing baseline files
     */
    private string $baselines_dir;

    /**
     * EXTRACTOR
     * Ontology snapshot extractor instance
     */
    private OntologySnapshotExtractor $extractor;

    /**
     * SEVERITY_LEVELS
     * Change severity classifications
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
        $this->extractor = new OntologySnapshotExtractor();

        if (!is_dir($this->baselines_dir)) {
            mkdir($this->baselines_dir, 0755, true);
        }
    }

    /**
     * COMPARE_ALL
     * Compare current ontology against baseline
     *
     * @return array Comparison results
     */
    public function compareAll(): array {
        $current = $this->extractor->extractAllOntologySnapshots();
        $baseline = $this->loadBaseline('ontology');

        if ($baseline === null) {
            return [
                'status' => 'no_baseline',
                'message' => 'No ontology baseline found. Run with --create-baseline first.',
                'changes' => [],
            ];
        }

        $changes = [];

        // Compare table structures
        $table_changes = $this->compareTableStructures(
            $current['dd_ontology_structure'] ?? [],
            $baseline['dd_ontology_structure'] ?? [],
            'dd_ontology'
        );
        if (!empty($table_changes)) {
            $changes['dd_ontology_structure'] = $table_changes;
        }

        // Compare tipo -> model mappings
        $mapping_changes = $this->compareTipoMappings(
            $current['tipo_model_mapping'] ?? [],
            $baseline['tipo_model_mapping'] ?? []
        );
        if (!empty($mapping_changes)) {
            $changes['tipo_model_mapping'] = $mapping_changes;
        }

        // Compare critical tipos
        $critical_changes = $this->compareCriticalTipos(
            $current['critical_tipos'] ?? [],
            $baseline['critical_tipos'] ?? []
        );
        if (!empty($critical_changes)) {
            $changes['critical_tipos'] = $critical_changes;
        }

        return [
            'status' => empty($changes) ? 'unchanged' : 'changed',
            'message' => empty($changes)
                ? 'Ontology structure matches baseline'
                : sprintf('Found %d ontology changes', count($changes)),
            'changes' => $changes,
            'breaking_count' => $this->countBreakingChanges($changes),
            'warning_count' => $this->countWarningChanges($changes),
        ];
    }

    /**
     * COMPARE_TABLE_STRUCTURES
     * Compare database table structures
     *
     * @param array $current Current table structure
     * @param array $baseline Baseline table structure
     * @param string $table_name Table name
     * @return array List of changes
     */
    private function compareTableStructures(array $current, array $baseline, string $table_name): array {
        $changes = [];

        // Table added
        if (empty($baseline) && !empty($current)) {
            return [[
                'type' => 'table_added',
                'severity' => self::SEVERITY_INFO,
                'message' => "Table '$table_name' added",
            ]];
        }

        // Table removed
        if (!empty($baseline) && empty($current)) {
            return [[
                'type' => 'table_removed',
                'severity' => self::SEVERITY_BREAKING,
                'message' => "Table '$table_name' removed",
            ]];
        }

        // Compare columns
        $current_cols = $current['columns'] ?? [];
        $baseline_cols = $baseline['columns'] ?? [];

        // Check for added columns
        foreach ($current_cols as $col_name => $col_info) {
            if (!isset($baseline_cols[$col_name])) {
                $changes[] = [
                    'type' => 'column_added',
                    'severity' => self::SEVERITY_INFO,
                    'message' => "Column '$table_name.$col_name' added (type: {$col_info['type']})",
                ];
                continue;
            }

            // Type change
            if ($col_info['type'] !== $baseline_cols[$col_name]['type']) {
                $changes[] = [
                    'type' => 'column_type_changed',
                    'severity' => self::SEVERITY_BREAKING,
                    'message' => sprintf(
                        "Column '$table_name.$col_name' type changed from '%s' to '%s'",
                        $baseline_cols[$col_name]['type'],
                        $col_info['type']
                    ),
                ];
            }

            // Nullable change
            if ($col_info['nullable'] !== $baseline_cols[$col_name]['nullable']) {
                $severity = !$col_info['nullable'] && $baseline_cols[$col_name]['nullable']
                    ? self::SEVERITY_BREAKING  // Made NOT NULL
                    : self::SEVERITY_WARNING;

                $changes[] = [
                    'type' => 'column_nullable_changed',
                    'severity' => $severity,
                    'message' => sprintf(
                        "Column '$table_name.$col_name' nullable changed from %s to %s",
                        $baseline_cols[$col_name]['nullable'] ? 'true' : 'false',
                        $col_info['nullable'] ? 'true' : 'false'
                    ),
                ];
            }
        }

        // Check for removed columns
        foreach ($baseline_cols as $col_name => $col_info) {
            if (!isset($current_cols[$col_name])) {
                $changes[] = [
                    'type' => 'column_removed',
                    'severity' => self::SEVERITY_BREAKING,
                    'message' => "Column '$table_name.$col_name' removed",
                ];
            }
        }

        // Compare indexes
        $current_indexes = $current['indexes'] ?? [];
        $baseline_indexes = $baseline['indexes'] ?? [];

        foreach ($current_indexes as $idx_name => $idx_def) {
            if (!isset($baseline_indexes[$idx_name])) {
                $changes[] = [
                    'type' => 'index_added',
                    'severity' => self::SEVERITY_INFO,
                    'message' => "Index '$idx_name' added to '$table_name'",
                ];
            }
        }

        foreach ($baseline_indexes as $idx_name => $idx_def) {
            if (!isset($current_indexes[$idx_name])) {
                $changes[] = [
                    'type' => 'index_removed',
                    'severity' => self::SEVERITY_WARNING,
                    'message' => "Index '$idx_name' removed from '$table_name'",
                ];
            }
        }

        return $changes;
    }

    /**
     * COMPARE_TIPO_MAPPINGS
     * Compare tipo -> model mappings
     *
     * @param array $current Current mappings
     * @param array $baseline Baseline mappings
     * @return array Changes in mappings
     */
    private function compareTipoMappings(array $current, array $baseline): array {
        $changes = [];

        // Check for tipo -> model changes
        foreach ($current as $tipo => $info) {
            if (!isset($baseline[$tipo])) {
                $changes[] = [
                    'type' => 'tipo_added',
                    'severity' => self::SEVERITY_INFO,
                    'message' => "New tipo '$tipo' (model: {$info['model']}, section: {$info['section_tipo']})",
                ];
                continue;
            }

            // Model change - CRITICAL
            if ($info['model'] !== $baseline[$tipo]['model']) {
                $changes[] = [
                    'type' => 'tipo_model_changed',
                    'severity' => self::SEVERITY_BREAKING,
                    'message' => sprintf(
                        "Tipo '$tipo' model changed from '%s' to '%s' (CRITICAL: affects data access)",
                        $baseline[$tipo]['model'],
                        $info['model']
                    ),
                ];
            }

            // Section tipo change
            if ($info['section_tipo'] !== $baseline[$tipo]['section_tipo']) {
                $changes[] = [
                    'type' => 'tipo_section_changed',
                    'severity' => self::SEVERITY_BREAKING,
                    'message' => sprintf(
                        "Tipo '$tipo' section_tipo changed from '%s' to '%s'",
                        $baseline[$tipo]['section_tipo'] ?? 'null',
                        $info['section_tipo'] ?? 'null'
                    ),
                ];
            }
        }

        // Check for removed tipos
        foreach ($baseline as $tipo => $info) {
            if (!isset($current[$tipo])) {
                $changes[] = [
                    'type' => 'tipo_removed',
                    'severity' => self::SEVERITY_BREAKING,
                    'message' => "Tipo '$tipo' (was {$info['model']}) removed from ontology",
                ];
            }
        }

        return $changes;
    }

    /**
     * COMPARE_CRITICAL_TIPOS
     * Compare critical/system tipos
     *
     * @param array $current Current critical tipos
     * @param array $baseline Baseline critical tipos
     * @return array Changes in critical tipos
     */
    private function compareCriticalTipos(array $current, array $baseline): array {
        $changes = [];

        foreach ($baseline as $tipo => $baseline_info) {
            if (!isset($current[$tipo])) {
                $changes[] = [
                    'type' => 'critical_tipo_removed',
                    'severity' => self::SEVERITY_BREAKING,
                    'message' => "CRITICAL: System tipo '$tipo' removed or inaccessible",
                ];
                continue;
            }

            $current_info = $current[$tipo];

            // Any property change in critical tipo is serious
            foreach (['model', 'parent', 'term', 'properties'] as $prop) {
                $baseline_val = $baseline_info[$prop] ?? null;
                $current_val = $current_info[$prop] ?? null;

                if ($baseline_val !== $current_val) {
                    $changes[] = [
                        'type' => 'critical_tipo_changed',
                        'severity' => self::SEVERITY_BREAKING,
                        'message' => sprintf(
                            "CRITICAL: System tipo '$tipo' property '$prop' changed",
                            $prop
                        ),
                    ];
                }
            }
        }

        return $changes;
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
        foreach ($changes as $category => $category_changes) {
            foreach ($category_changes as $change) {
                if ($change['severity'] === self::SEVERITY_BREAKING) {
                    $count++;
                }
            }
        }
        return $count;
    }

    /**
     * COUNT_WARNING_CHANGES
     * Count warning-level changes
     *
     * @param array $changes All changes
     * @return int Warning count
     */
    private function countWarningChanges(array $changes): int {
        $count = 0;
        foreach ($changes as $category => $category_changes) {
            foreach ($category_changes as $change) {
                if ($change['severity'] === self::SEVERITY_WARNING) {
                    $count++;
                }
            }
        }
        return $count;
    }

    /**
     * CREATE_BASELINE
     * Create new baseline from current ontology
     *
     * @param string $name Baseline name
     * @return bool True on success
     */
    public function createBaseline(string $name = 'ontology'): bool {
        $snapshot = $this->extractor->extractAllOntologySnapshots();
        
        $data = [
            'created_at' => date('Y-m-d H:i:s'),
            'version' => defined('DEDALO_VERSION') ? DEDALO_VERSION : 'unknown',
            'checksum' => $this->extractor->getChecksum($snapshot),
            'snapshot' => $snapshot,
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
     * @return array|null Baseline snapshot or null
     */
    public function loadBaseline(string $name = 'ontology'): ?array {
        $filepath = $this->getBaselinePath($name);
        
        if (!file_exists($filepath)) {
            return null;
        }

        $json = file_get_contents($filepath);
        $data = json_decode($json, true);
        
        return $data['snapshot'] ?? null;
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
     * HAS_BASELINE
     * Check if baseline exists
     *
     * @param string $name Baseline name
     * @return bool True if exists
     */
    public function hasBaseline(string $name = 'ontology'): bool {
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

        foreach ($result['changes'] as $category => $changes) {
            $report[] = "Category: $category";
            
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

}//end OntologyComparator
