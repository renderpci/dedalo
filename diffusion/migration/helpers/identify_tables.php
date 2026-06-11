<?php
require_once __DIR__ . '/../../../config/bootstrap.php';

$diffusion_element_tipo = 'oh88';
$section_tipo = 'oh1';

try {
    $tables_map = diffusion_sql::get_diffusion_element_tables_map($diffusion_element_tipo);
    echo "Tables Map: " . print_r($tables_map, true) . PHP_EOL;

    $target_table = $tables_map->{$section_tipo}->name ?? null;
    $target_db = $tables_map->{$section_tipo}->database_name ?? null;

    if ($target_table && $target_db) {
        echo "Target Table: {$target_db}.{$target_table}" . PHP_EOL;
        echo "DROP COMMAND: DROP TABLE IF EXISTS `$target_db`.`$target_table`;" . PHP_EOL;
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . PHP_EOL;
}
