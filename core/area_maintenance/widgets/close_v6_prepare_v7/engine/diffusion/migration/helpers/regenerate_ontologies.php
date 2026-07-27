<?php
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
