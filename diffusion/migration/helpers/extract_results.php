<?php
require_once __DIR__ . '/../../../config/config.php';

function extract_database_results($db_name, $output_file) {
    echo "Extracting results from database: $db_name to $output_file" . PHP_EOL;
    $conn = DBi::_getConnection_mysql();
    
    $tables_res = $conn->query("SHOW TABLES FROM `$db_name`");
    $data = [];
    
    while ($table_row = $tables_res->fetch_array()) {
        $table_name = $table_row[0];
        echo " - Reading table: $table_name" . PHP_EOL;
        
        $res = $conn->query("SELECT * FROM `$db_name`.`$table_name` ORDER BY 1 ASC");
        $rows = [];
        while ($row = $res->fetch_assoc()) {
            // Sort keys to ensure comparison is consistent
            ksort($row);
            $rows[] = $row;
        }
        $data[$table_name] = $rows;
    }
    
    file_put_contents($output_file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo "Extraction complete." . PHP_EOL;
}

if (isset($argv[1]) && isset($argv[2])) {
    extract_database_results($argv[1], $argv[2]);
} else {
    echo "Usage: php extract_results.php <db_name> <output_file>" . PHP_EOL;
}
