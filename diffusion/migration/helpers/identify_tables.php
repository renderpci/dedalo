<?php
require_once __DIR__ . '/../../../config/config.php';

$diffusion_element_tipo = 'oh88';
$section_tipo = 'oh1';

try {
    // v7: resolved from the flat virtual diffusion tree
    $table_node = diffusion_utils::get_section_node_for_element($diffusion_element_tipo, $section_tipo);
    echo "Table node: " . print_r($table_node, true) . PHP_EOL;

    $target_table = $table_node->label ?? null;
    $target_db    = diffusion_utils::get_database_name_for_element($diffusion_element_tipo);

    if ($target_table && $target_db) {
        echo "Target Table: {$target_db}.{$target_table}" . PHP_EOL;
        echo "DROP COMMAND: DROP TABLE IF EXISTS `$target_db`.`$target_table`;" . PHP_EOL;
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . PHP_EOL;
}
