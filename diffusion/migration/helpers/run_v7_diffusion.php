<?php
// USE V7 CODEBASE
require_once __DIR__ . '/../../../config/config.php';
require_once __DIR__ . '/../../../core/api/v1/common/class.dd_diffusion_api.php';

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

    echo "\n2. Running v7 Diffusion using Bun API" . PHP_EOL;
    
    $locator = new locator();
    $locator->set_section_tipo($section_tipo);
    $locator->set_section_id($section_id);

    // v7: resolved from the flat virtual diffusion tree (alias tipo preferred)
    $table_tipo = diffusion_utils::get_table_tipo($diffusion_element_tipo, $section_tipo);

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
    
    // Use DEDALO_DIFFUSION_API_URL. Since we are in CLI, we need the full URL.
    $api_url = DEDALO_DIFFUSION_API_URL;
    if (strpos($api_url, 'http') !== 0) {
        $api_url = 'http://localhost:8080' . $api_url;
    }
    
    echo "Requesting URL: $api_url" . PHP_EOL;

    // Get a valid session ID for authentication
    $session_output = shell_exec('php ' . __DIR__ . '/get_session_id.php');
    $session_lines = explode("\n", trim($session_output));
    $session_id = end($session_lines);
    if (!$session_id || strlen($session_id) < 10) {
        die("Error: Could not get a valid session ID. Output: $session_output");
    }
    $session_name = 'dedalo_' . DEDALO_ENTITY;

    echo "Using Session: $session_name=$session_id" . PHP_EOL;

    $ch = curl_init($api_url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($rqo));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        "Cookie: $session_name=$session_id"
    ]);
    
    // We need a session cookie to pass authentication if the API requires it.
    // However, since we're calling from CLI, let's see if it works without it first,
    // or if we can pass a session ID if we had one.
    
    $response_text = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($http_code !== 200) {
        echo "API Error (HTTP $http_code): $response_text" . PHP_EOL;
    } else {
        // The Bun API returns an SSE stream. We'll look for the final result in the last chunk.
        $lines = explode("\n", $response_text);
        $final_result = null;
        foreach (array_reverse($lines) as $line) {
            if (strpos($line, 'data:') === 0) {
                $content = trim(substr($line, 5));
                $data = json_decode($content);
                if (isset($data->result)) {
                    $final_result = $data->result;
                    break;
                }
            }
        }
        
        if (!$final_result) {
            echo "Error: Failed to parse final result from SSE stream." . PHP_EOL;
            echo "Raw response summary: " . substr($response_text, -500) . PHP_EOL;
        }
        
        file_put_contents(__DIR__ . '/../../../v7_dump.json', json_encode($final_result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        echo "Saved v7_dump.json in project root" . PHP_EOL;
        
        echo "Diffusion Result: " . (($final_result && $final_result->result) ? 'SUCCESS' : 'FAILED') . PHP_EOL;
        if ($final_result && !empty($final_result->msg)) {
            echo "Messages: " . $final_result->msg . PHP_EOL;
        }
        if ($final_result && !empty($final_result->errors)) {
            echo "Errors: " . print_r($final_result->errors, true);
        }
    }

} catch (Throwable $e) {
    echo "Exception: " . $e->getMessage() . PHP_EOL;
    echo $e->getTraceAsString() . PHP_EOL;
}
