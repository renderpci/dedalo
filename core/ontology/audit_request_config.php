<?php
/**
* AUDIT_REQUEST_CONFIG
* CLI batch audit: validates every properties->source->request_config
* definition stored in the ontology against the structural rules in
* request_config_object::validate_config (shape, tipo grammar, ddo_map
* sections, get_ddo_map). Malformed definitions silently degrade at runtime
* (dropped ddos, empty UI) — this audit surfaces them all at once.
*
* Usage:
* 	php core/ontology/audit_request_config.php             # full report
* 	php core/ontology/audit_request_config.php --errors-only
*
* Exit code: 0 when no 'error'-level issues are found, 1 otherwise
* (cron/CI friendly).
*
* @see request_config_object::validate_config (structural rules)
* @see ontology::parse_section_record_to_ontology_node (validate-on-save hook)
*/

if (php_sapi_name()!=='cli') {
	die('This script must be run from CLI'.PHP_EOL);
}

require_once __DIR__ . '/../../config/config.php';

$errors_only = in_array('--errors-only', $_SERVER['argv'] ?? []);

// query every ontology node whose properties mention request_config
$conn	= DBi::_getConnection();
$table	= dd_ontology_db_manager::$table;
$sql	= 'SELECT tipo, properties FROM "'.$table.'" WHERE properties IS NOT NULL AND properties::text LIKE \'%request_config%\' ORDER BY tipo';
$result	= pg_query($conn, $sql);
if ($result===false) {
	echo 'Error querying '.$table.': '.pg_last_error($conn).PHP_EOL;
	exit(1);
}

$scanned		= 0;
$with_issues	= 0;
$total_errors	= 0;
$total_warnings	= 0;

while ($row = pg_fetch_assoc($result)) {

	$properties = json_decode($row['properties']);
	if (!isset($properties->source->request_config)) {
		continue; // 'request_config' matched elsewhere in the JSON
	}

	$scanned++;

	$issues = request_config_object::validate_config($properties->source->request_config);
	if (empty($issues)) {
		continue;
	}

	$node_errors	= array_filter($issues, function($issue){ return $issue->level==='error'; });
	$node_warnings	= array_filter($issues, function($issue){ return $issue->level==='warning'; });
	$total_errors	+= count($node_errors);
	$total_warnings	+= count($node_warnings);

	$to_print = $errors_only ? $node_errors : $issues;
	if (empty($to_print)) {
		continue;
	}

	$with_issues++;
	echo PHP_EOL . $row['tipo'] . PHP_EOL;
	foreach ($to_print as $issue) {
		echo "  [{$issue->level}] {$issue->path}: {$issue->message}" . PHP_EOL;
	}
}

echo PHP_EOL
	. 'Scanned nodes with request_config: ' . $scanned . PHP_EOL
	. 'Nodes reported: ' . $with_issues . PHP_EOL
	. 'Errors: ' . $total_errors . ' | Warnings: ' . $total_warnings . PHP_EOL;

exit($total_errors>0 ? 1 : 0);
