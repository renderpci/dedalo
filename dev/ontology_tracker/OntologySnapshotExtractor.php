<?php declare(strict_types=1);
/**
 * OntologySnapshotExtractor
 * Extracts snapshots of ontology structure for breaking change detection
 * Tracks dd_ontology, matrix_dd, and tipo->model mappings
 *
 * @package Tools
 * @subpackage OntologyTracker
 */

class OntologySnapshotExtractor {

    /**
     * CRITICAL_TABLES
     * Tables that affect data integrity and should be tracked
     */
    private static array $critical_tables = [
        'dd_ontology',      // Main ontology definitions
        'matrix_dd',        // Ontology matrix data
    ];

    /**
     * CRITICAL_COLUMNS
     * Columns to track for each table
     */
    private static array $critical_columns = [
        'dd_ontology' => [
            'tipo', 'parent', 'model', 'lang', 'section_tipo',
            'term', 'properties', 'order'
        ],
        'matrix_dd' => [
            'id', 'section_id', 'section_tipo', 'datos'
        ],
    ];

    /**
     * Base directory for operations
     */
    private string $base_path;

    /**
     * Constructor
     * @param string|null $base_path Optional custom base path
     */
    public function __construct(?string $base_path = null) {
        $this->base_path = $base_path ?? DEDALO_CORE_PATH;
    }

    /**
     * EXTRACT_ALL_ONTOLOGY_SNAPSHOTS
     * Extract complete ontology snapshots
     *
     * @return array All ontology data
     */
    public function extractAllOntologySnapshots(): array {
        return [
            'dd_ontology_structure' => $this->extractTableStructure('dd_ontology'),
            'matrix_dd_structure' => $this->extractTableStructure('matrix_dd'),
            'tipo_model_mapping' => $this->extractTipoModelMapping(),
            'critical_tipos' => $this->extractCriticalTipos(),
            'hierarchy_structure' => $this->extractHierarchyStructure(),
            'timestamp' => date('Y-m-d H:i:s'),
            'version' => defined('DEDALO_VERSION') ? DEDALO_VERSION : 'unknown',
        ];
    }

    /**
     * EXTRACT_TABLE_STRUCTURE
     * Extract structure information for a specific table
     *
     * @param string $table_name Table to extract
     * @return array Table structure data
     */
    public function extractTableStructure(string $table_name): array {
        $structure = [];
        
        try {
            // Get column information from PostgreSQL
            $sql = "
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = '$table_name'
                ORDER BY ordinal_position
            ";
            
            $result = $this->query($sql);
            
            foreach ($result as $row) {
                $structure['columns'][$row['column_name']] = [
                    'type' => $row['data_type'],
                    'nullable' => $row['is_nullable'] === 'YES',
                    'default' => $row['column_default'],
                ];
            }

            // Get indexes
            $index_sql = "
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE tablename = '$table_name'
            ";
            
            $indexes = $this->query($index_sql);
            foreach ($indexes as $index) {
                $structure['indexes'][$index['indexname']] = $index['indexdef'];
            }

            // Get constraints
            $constraint_sql = "
                SELECT conname, pg_get_constraintdef(oid) as condef
                FROM pg_constraint
                WHERE conrelid = '$table_name'::regclass
            ";
            
            $constraints = $this->query($constraint_sql);
            foreach ($constraints as $constraint) {
                $structure['constraints'][$constraint['conname']] = $constraint['condef'];
            }

            // Get row count (for sanity checking)
            $count_sql = "SELECT COUNT(*) as count FROM $table_name";
            $count_result = $this->query($count_sql);
            $structure['row_count'] = $count_result[0]['count'] ?? 0;

        } catch (Exception $e) {
            $structure['error'] = $e->getMessage();
        }

        return $structure;
    }

    /**
     * EXTRACT_TIPO_MODEL_MAPPING
     * Extract critical tipo -> model mappings
     *
     * @return array Tipo to model mapping
     */
    public function extractTipoModelMapping(): array {
        $mapping = [];
        
        try {
            // Get all tipo -> model mappings from dd_ontology
            $sql = "
                SELECT DISTINCT tipo, model, section_tipo, parent
                FROM dd_ontology
                WHERE tipo IS NOT NULL AND model IS NOT NULL
                ORDER BY tipo
            ";
            
            $result = $this->query($sql);
            
            foreach ($result as $row) {
                $mapping[$row['tipo']] = [
                    'model' => $row['model'],
                    'section_tipo' => $row['section_tipo'],
                    'parent' => $row['parent'],
                ];
            }

        } catch (Exception $e) {
            $mapping['error'] = $e->getMessage();
        }

        return $mapping;
    }

    /**
     * EXTRACT_CRITICAL_TIPOS
     * Extract tipos that are critical for system operation
     *
     * @return array Critical tipo definitions
     */
    public function extractCriticalTipos(): array {
        $critical_tipos = [];
        
        // Define critical system tipos that must not change
        $system_tipos = [
            // Core sections
            'dd1',      // Dédalo section
            'dd2',      // Numismatic section (or main entity section)
            
            // Core components
            'rsc36',    // Publication - common test tipo
            'rsc197',   // State
            
            // Hierarchy related
            'hierarchy1',
            'hierarchy2',
            
            // User/permission related
            'dd153',    // User section tipo
            'dd170',    // Password tipo
        ];

        try {
            foreach ($system_tipos as $tipo) {
                $sql = "
                    SELECT tipo, model, parent, term, properties
                    FROM dd_ontology
                    WHERE tipo = '$tipo'
                    LIMIT 1
                ";
                
                $result = $this->query($sql);
                
                if (!empty($result)) {
                    $critical_tipos[$tipo] = $result[0];
                }
            }

        } catch (Exception $e) {
            $critical_tipos['error'] = $e->getMessage();
        }

        return $critical_tipos;
    }

    /**
     * EXTRACT_HIERARCHY_STRUCTURE
     * Extract hierarchy definitions
     *
     * @return array Hierarchy structure
     */
    public function extractHierarchyStructure(): array {
        $hierarchy = [];
        
        try {
            // Get all hierarchy definitions
            $sql = "
                SELECT section_tipo, term, properties
                FROM dd_ontology
                WHERE model = 'section' AND section_tipo IS NOT NULL
                ORDER BY section_tipo
            ";
            
            $result = $this->query($sql);
            
            foreach ($result as $row) {
                $hierarchy[$row['section_tipo']] = [
                    'term' => $row['term'],
                    'properties' => $this->safeJsonDecode($row['properties']),
                ];
            }

        } catch (Exception $e) {
            $hierarchy['error'] = $e->getMessage();
        }

        return $hierarchy;
    }

    /**
     * QUERY
     * Execute database query
     *
     * @param string $sql SQL query
     * @return array Query results
     */
    private function query(string $sql): array {
        // Use Dédalo's DBi if available
        if (class_exists('DBi')) {
            return DBi::get_connection()->query($sql)->fetchAll(PDO::FETCH_ASSOC);
        }

        // Fallback: return empty if DB not available
        return [];
    }

    /**
     * SAFE_JSON_DECODE
     * Safely decode JSON, return empty object on failure
     *
     * @param string|null $json JSON string
     * @return object Decoded object
     */
    private function safeJsonDecode(?string $json): object {
        if (empty($json)) {
            return new stdClass();
        }

        $decoded = json_decode($json);
        
        return $decoded !== null ? $decoded : new stdClass();
    }

    /**
     * GET_CHECKSUM
     * Generate checksum for a snapshot
     *
     * @param array $snapshot Snapshot data
     * @return string MD5 checksum
     */
    public function getChecksum(array $snapshot): string {
        return md5(json_encode($snapshot));
    }

    /**
     * GET_CRITICAL_TABLES
     * Get list of tables being tracked
     *
     * @return array Table names
     */
    public function getCriticalTables(): array {
        return self::$critical_tables;
    }

}//end OntologySnapshotExtractor
