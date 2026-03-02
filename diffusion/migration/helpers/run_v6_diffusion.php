<?php
// USE V6 CODEBASE
require_once '/Users/render/Desktop/trabajos/dedalo/v6/master_dedalo/config/config.php';

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
