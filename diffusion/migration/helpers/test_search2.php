<?php
require_once __DIR__ . '/../../../config/config.php';

$locator = new locator();
$locator->set_section_tipo('oh1');
$locator->set_section_id(1);

$sqo = (object)[
    'section_tipo'       => ['oh1'],
    'limit'              => 1,
    'offset'             => 0,
    'filter_by_locators' => [$locator]
];

$search = search::get_instance($sqo);

try {
    $count = $search->count();
    echo "Count total: " . ($count->total ?? 'unknown') . "\n";
    $rows_data = $search->search();
    if ($rows_data) {
        echo "Found " . $rows_data->row_count() . " records!\n";
    } else {
        echo "No records or query failed.\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
