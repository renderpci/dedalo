<?php
// USE V7 CODEBASE
require_once __DIR__ . '/../../../config/config.php';
require_once __DIR__ . '/../../../core/api/v1/common/class.dd_diffusion_api.php';

$diffusion_element_tipo = 'oh63';
$section_tipo = 'rsc197';
$section_id = 1;
$levels = 1;
$target_db = 'web_default';
$target_table = 'informant';

try {
    echo "\n1. Dropping MariaDB tables for $section_tipo" . PHP_EOL;
    $conn = DBi::_getConnection_mysql();
    if ($conn->connect_error) {
        die("Connection failed: " . $conn->connect_error);
    }
    
    $drop_query = "DROP TABLE IF EXISTS `$target_db`.`$target_table`";
    if ($conn->query($drop_query) === TRUE) {
        echo "Table '$target_db.$target_table' dropped successfully." . PHP_EOL;
    } else {
        echo "Error dropping table: " . $conn->error . PHP_EOL;
    }

    echo "\n2. Running v7 Diffusion using dd_diffusion_api" . PHP_EOL;
    $_SESSION['dedalo']['auth']['user_id'] = 1;
    $_SESSION['dedalo']['auth']['username'] = 'render';
    $_SESSION['dedalo']['auth']['is_developer'] = true;
    $_SESSION['dedalo']['auth']['is_global_admin'] = true;
    
    $locator = new locator();
    $locator->set_section_tipo($section_tipo);
    $locator->set_section_id($section_id);

    $diffusion_element_tables_map = diffusion_sql::get_diffusion_element_tables_map($diffusion_element_tipo);
    $section_tables_map = $diffusion_element_tables_map->{$section_tipo} ?? null;
    $table_tipo = !empty($section_tables_map->from_alias) 
					? $section_tables_map->from_alias
					: ($section_tables_map->table ?? null);

    $rqo = (object)[
        'dd_api' => 'dd_diffusion_api',
        'action' => 'diffuse',
        'source' => (object)[
            'component_name' => 'tool_diffusion',
            'type' => 'diffuse',
            'diffusion_element_tipo' => $diffusion_element_tipo,
            'diffusion_tipo' => $table_tipo
        ],
        'sqo' => (object)[
            'section_tipo' => [$section_tipo],
            'filter_by_locators' => [$locator]
        ],
        'options' => (object)[
            'levels' => $levels,
            'skip_publication_state_check' => 1,
            'additions_options' => (object)[],
            'total' => 1
        ]
    ];
    
    $result = dd_diffusion_api::diffuse($rqo);
    
    file_put_contents('v7_dump.json', json_encode($result, JSON_UNESCAPED_UNICODE));
    echo "Saved v7_dump.json" . PHP_EOL;
    
    echo "Diffusion Result: " . ($result->result ? 'SUCCESS' : 'FAILED') . PHP_EOL;
    if (!empty($result->msg)) {
        echo "Messages: " . print_r($result->msg, true);
    }
    if (!empty($result->errors)) {
        echo "Errors: " . print_r($result->errors, true);
    }

} catch (Throwable $e) {
    echo "Exception: " . $e->getMessage() . PHP_EOL;
    echo $e->getTraceAsString() . PHP_EOL;
}
