<?php
/**
* AUDIT_REQUEST_CONFIG
* CLI batch audit: validates every properties->source->request_config
* definition stored in the ontology against the structural rules in
* request_config_object::validate_config (shape, tipo grammar, ddo_map
* sections, get_ddo_map). Malformed definitions silently degrade at runtime
* (dropped ddos, empty UI) — this audit surfaces them all at once.
*
* This script is the offline counterpart of the ontology save hook. The hook
* (ontology::parse_section_record_to_ontology_node) validates a node on
* write, but pre-existing nodes are never re-validated automatically. Run
* this audit after a v6→v7 migration or after batch-patching ontology rows
* to catch all structural regressions in one pass.
*
* Issue objects returned by validate_config have the shape:
*   { level: 'error'|'warning', path: string, message: string }
*
* Output format (one block per node with issues):
*   <tipo>
*     [error]   request_config[0].show.ddo_map[2].tipo: Missing or invalid…
*     [warning] request_config[1].sqo.limit: Expected integer…
*   Scanned nodes with request_config: N
*   Nodes reported: M
*   Errors: E | Warnings: W
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
* @see dd_ontology_db_manager::$table (target PostgreSQL table — 'dd_ontology')
*/

// CLI guard
// Prevents accidental web invocation — this script runs raw queries without
// any HTTP auth layer and must never be reachable from a browser.
if (php_sapi_name()!=='cli') {
	die('This script must be run from CLI'.PHP_EOL);
}

// Bootstrap
// Loads the Dédalo autoloader, DB constants, and all core classes (including
// DBi, dd_ontology_db_manager, and request_config_object) via config.php.
require_once __DIR__ . '/../../config/bootstrap.php';

// --errors-only flag
// When present, warnings are still counted in the summary but are suppressed
// from per-node output so the console stays quiet in CI contexts where only
// blocking issues matter.
$errors_only = in_array('--errors-only', $_SERVER['argv'] ?? []);

// Candidate query
// The LIKE filter on the raw JSONB text is a fast pre-filter: it pulls only
// rows where the string 'request_config' appears anywhere in the serialised
// properties JSON. False positives (e.g. nodes that have 'request_config' in
// a description string) are discarded by the isset() check inside the loop.
// Using ::text LIKE avoids a JSONB path scan over every row.
$conn	= DBi::_getConnection();
$table	= dd_ontology_db_manager::$table;
$sql	= 'SELECT tipo, properties FROM "'.$table.'" WHERE properties IS NOT NULL AND properties::text LIKE \'%request_config%\' ORDER BY tipo';
$result	= pg_query($conn, $sql);
if ($result===false) {
	echo 'Error querying '.$table.': '.pg_last_error($conn).PHP_EOL;
	exit(1);
}

// Summary counters — accumulated across all nodes.
$scanned		= 0;
$with_issues	= 0;
$total_errors	= 0;
$total_warnings	= 0;

while ($row = pg_fetch_assoc($result)) {

	$properties = json_decode($row['properties']);
	if (!isset($properties->source->request_config)) {
		// False positive from LIKE filter: the string appeared somewhere else
		// in the JSON (e.g. in a label or description), not at the expected
		// properties->source->request_config path.
		continue; // 'request_config' matched elsewhere in the JSON
	}

	$scanned++;

	// Delegate structural validation to the canonical validator.
	// validate_config returns [] on a clean config. Each issue object has:
	//   level   — 'error' (blocks runtime) or 'warning' (degrades behaviour)
	//   path    — dot/bracket path inside the request_config array
	//   message — human-readable description of the violation
	$issues = request_config_object::validate_config($properties->source->request_config);
	if (empty($issues)) {
		continue;
	}

	// Partition issues by level so we can accumulate counts independently of
	// the --errors-only display filter.
	$node_errors	= array_filter($issues, function($issue){ return $issue->level==='error'; });
	$node_warnings	= array_filter($issues, function($issue){ return $issue->level==='warning'; });
	$total_errors	+= count($node_errors);
	$total_warnings	+= count($node_warnings);

	// Apply display filter: in --errors-only mode, nodes with only warnings
	// are silently skipped here but their warning count still feeds $total_warnings.
	$to_print = $errors_only ? $node_errors : $issues;
	if (empty($to_print)) {
		continue;
	}

	// Print node block: tipo header followed by indented issue lines.
	$with_issues++;
	echo PHP_EOL . $row['tipo'] . PHP_EOL;
	foreach ($to_print as $issue) {
		echo "  [{$issue->level}] {$issue->path}: {$issue->message}" . PHP_EOL;
	}
}

// Summary footer
echo PHP_EOL
	. 'Scanned nodes with request_config: ' . $scanned . PHP_EOL
	. 'Nodes reported: ' . $with_issues . PHP_EOL
	. 'Errors: ' . $total_errors . ' | Warnings: ' . $total_warnings . PHP_EOL;

// Exit code: non-zero only on errors (warnings never fail the process).
// This makes the script safe to use in cron/CI pipelines where warnings are
// informational but errors must block a deployment or migration step.
exit($total_errors>0 ? 1 : 0);
