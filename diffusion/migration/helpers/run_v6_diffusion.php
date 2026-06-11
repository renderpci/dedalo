<?php
// USE V6 CODEBASE
require_once '/Users/render/Desktop/trabajos/dedalo/v6/master_dedalo/config/bootstrap.php';

$diffusion_element_tipo = $argv[1] ?? 'oh63';
$section_tipo = $argv[2] ?? 'rsc167';
$section_id = (int)($argv[3] ?? 1);
$levels = 1;
$target_db = 'web_default';
$target_table = 'audiovisual';

try {
    echo "\n1. Dropping ALL MariaDB tables in $target_db" . PHP_EOL;
    $conn = DBi::_getConnection_mysql();
    if ($conn->connect_error) {
        die("Connection failed: " . $conn->connect_error);
    }
    
    $tables_res = $conn->query("SHOW TABLES FROM `$target_db`");
    while ($table_row = $tables_res->fetch_array()) {
        $found_table = $table_row[0];
        $conn->query("DROP TABLE `$target_db`.`$found_table`");
        echo "Table '$target_db.$found_table' dropped." . PHP_EOL;
    }

    echo "\n2. Running v6 Diffusion using dd_tools_api" . PHP_EOL;
    // Set resolve_levels before invoking
    $_SESSION['dedalo']['config']['DEDALO_DIFFUSION_RESOLVE_LEVELS'] = $levels;
    $_SESSION['dedalo']['auth']['user_id'] = 1;
    $_SESSION['dedalo']['auth']['username'] = 'render';
    $_SESSION['dedalo']['auth']['is_developer'] = true;
    $_SESSION['dedalo']['auth']['is_global_admin'] = true;
    
    require_once DEDALO_CORE_PATH . '/api/v1/common/class.dd_tools_api.php';

    $rqo = (object)[
        'dd_api' => 'dd_tools_api',
        'action' => 'tool_request',
        'source' => (object)[
            'model' => 'tool_diffusion',
            'action' => 'export'
        ],
        'options' => (object)[
            'background_running' => false,
            'section_tipo' => $section_tipo,
            'section_id' => $section_id,
            'mode' => 'edit',
            'diffusion_element_tipo' => $diffusion_element_tipo,
            'resolve_levels' => $levels,
            'skip_publication_state_check' => 1,
            'additions_options' => (object)[]
        ]
    ];
    
    $result = dd_tools_api::tool_request($rqo);
    
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
