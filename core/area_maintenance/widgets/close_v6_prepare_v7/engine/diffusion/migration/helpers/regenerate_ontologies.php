<?php
// CLI ONLY -- checked BEFORE the bootstrap, deliberately.
// This script forges an is_developer + is_global_admin session with no credential check and
// then does destructive work. The guard exists to keep it unreachable over HTTP: the package
// .htaccess ('Require all denied') is Apache-only and INERT under nginx, where the operator
// must hand-add a deny rule. Same position and reason as run/lib/engine_boot.php:28.
if (PHP_SAPI !== 'cli' || isset($_SERVER['REQUEST_METHOD'])) {
    header('HTTP/1.1 403 Forbidden', true, 403);
    die("This helper can only be run from the command line\n");
}

require_once __DIR__ . '/../../../config/bootstrap.php';

$_SESSION['dedalo']['auth']['user_id'] = 1;
$_SESSION['dedalo']['auth']['username'] = 'render';
$_SESSION['dedalo']['auth']['is_developer'] = true;
$_SESSION['dedalo']['auth']['is_global_admin'] = true;

echo "1. Getting all ontologies..." . PHP_EOL;
$ontologies_response = tool_ontology_parser::get_ontologies();
if (!$ontologies_response->result) {
    die("Error getting ontologies: " . print_r($ontologies_response->errors, true));
}

$tlds = array_map(fn($o) => $o->tld, $ontologies_response->result);
echo "2. Regenerating " . count($tlds) . " ontologies..." . PHP_EOL;

$options = (object)['selected_ontologies' => $tlds];
$response = tool_ontology_parser::regenerate_ontologies($options);

echo "Result: " . ($response->result ? 'SUCCESS' : 'FAILED') . PHP_EOL;
if (!empty($response->msg)) echo "Message: " . $response->msg . PHP_EOL;
if (!empty($response->errors)) echo "Errors: " . print_r($response->errors, true) . PHP_EOL;
