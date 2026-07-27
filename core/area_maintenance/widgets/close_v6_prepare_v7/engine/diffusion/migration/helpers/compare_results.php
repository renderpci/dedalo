<?php
$v6_file = __DIR__ . '/v6_result.json';
$v7_file = __DIR__ . '/v7_result.json';

if (!file_exists($v6_file) || !file_exists($v7_file)) {
    die("Error: v6 or v7 result files missing.\n");
}

$v6_data = json_decode(file_get_contents($v6_file), true);
$v7_data = json_decode(file_get_contents($v7_file), true);

$tables = array_unique(array_merge(array_keys($v6_data), array_keys($v7_data)));

echo "Comparison Report" . PHP_EOL;
echo "=================" . PHP_EOL . PHP_EOL;

foreach ($tables as $table) {
    echo "Table: $table" . PHP_EOL;
    
    if (!isset($v6_data[$table])) {
        echo " - Missing in V6" . PHP_EOL;
        continue;
    }
    if (!isset($v7_data[$table])) {
        echo " - Missing in V7" . PHP_EOL;
        continue;
    }
    
    $v6_rows = $v6_data[$table];
    $v7_rows = $v7_data[$table];
    
    echo " - Row count: V6=" . count($v6_rows) . ", V7=" . count($v7_rows) . PHP_EOL;
    
    if (count($v6_rows) !== count($v7_rows)) {
        echo " - ERROR: Row count mismatch!" . PHP_EOL;
    }
    
    $diff_found = false;
    
    // Index both datasets by section_id + lang for direct comparison
    $index_data = function($rows) {
        $indexed = [];
        foreach ($rows as $row) {
            $key = ($row['section_id'] ?? 'unknown') . '_' . ($row['lang'] ?? 'unknown');
            $indexed[$key] = $row;
        }
        return $indexed;
    };
    
    $v6_indexed = $index_data($v6_rows);
    $v7_indexed = $index_data($v7_rows);
    
    // Find all unique keys
    $keys = array_unique(array_merge(array_keys($v6_indexed), array_keys($v7_indexed)));
    sort($keys);

    foreach ($keys as $key) {
        if (!isset($v6_indexed[$key])) {
            echo " - ERROR: Key '$key' present in V7 but missing in V6" . PHP_EOL;
            $diff_found = true;
            continue;
        }
        if (!isset($v7_indexed[$key])) {
            echo " - ERROR: Key '$key' present in V6 but missing in V7" . PHP_EOL;
            $diff_found = true;
            continue;
        }
        
        $v6_row = $v6_indexed[$key];
        $v7_row = $v7_indexed[$key];
        
        // Remove ignored columns
        unset($v6_row['id']);
        unset($v7_row['id']);
        
        $diff = array_diff_assoc($v6_row, $v7_row);
        $diff_extra = array_diff_assoc($v7_row, $v6_row);
        
        if (!empty($diff) || !empty($diff_extra)) {
            echo " - ERROR: Discrepancy in record [$key]" . PHP_EOL;
            foreach ($diff as $k => $v) {
                echo "   Column [$k]: V6='$v', V7='" . ($v7_row[$k] ?? 'NULL') . "'" . PHP_EOL;
            }
            foreach ($diff_extra as $k => $v) {
                if (!isset($v6_row[$k])) {
                    echo "   Column [$k]: V6='MISSING', V7='$v'" . PHP_EOL;
                }
            }
            $diff_found = true;
        }
    }
    
    if (!$diff_found && count($v6_rows) === count($v7_rows)) {
        echo " - SUCCESS: Data matches exactly." . PHP_EOL;
    }
    echo PHP_EOL;
}
