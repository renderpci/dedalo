<?php

/**
 * Migration Script: Diffusion Ontology Properties (v6 -> v7)
 * 
 * Usage: php diffusion/migration/migrate_diffusion_properties.php
 */

// Bootstrap
$config_path = dirname(dirname(__DIR__)) . '/config/bootstrap.php';
if (!file_exists($config_path)) {
	die("Error: Config file not found at $config_path\n");
}
require_once $config_path;

set_error_handler(function($errno, $errstr, $errfile, $errline) {
    if (!(error_reporting() & $errno)) return false;
    echo "\nERROR [$errno] $errstr in $errfile on line $errline\n";
    debug_print_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS);
    return true;
});


if (!class_exists('ontology_node')) {
	die("Error: class 'ontology_node' not found. Check environment.\n");
}
if (!class_exists('component_common')) {
	// Try to load it? usually handled by autoloader if config included
	// But let's check
}
if (!class_exists('dd_ontology_db_manager')) {
	die("Error: class 'dd_ontology_db_manager' not found.\n");
}

include_once __DIR__ . '/v1_get_dato.php';
include_once __DIR__ . '/v1_get_diffusion_dato.php';
include_once __DIR__ . '/v1_get_diffusion_value.php';
include_once __DIR__ . '/v1_get_valor.php';

/**
 * DIFFUSION_BUILD_ADD_PARENTS_PROCESS
 * Canonical ancestor-chain process for v6 add_parents columns (the thesaurus "parents"
 * family). Uses the single resolver fn 'add_parents' (component_relation_common, which
 * already includes the relation_parent hierarchy-root fallback) — it emits the per-locator
 * ancestor chains into the diffusion_data_object meta — and shapes them with
 * parser_locator::parents. This replaces the former per-ddo get_diffusion_data_recursive
 * fn (removed): one canonical resolver, output shaping in the parser. The 'value' selects
 * the output (term_id | term | section_id), mirroring the parser the column would have used.
 * @param string $value  parser_locator::parents value mode (default 'term_id')
 * @return stdClass  process object
 */
function diffusion_build_add_parents_process(string $value='term_id') : stdClass {
	return (object)[
		'fn'     => 'add_parents',
		'parser' => [ (object)[
			'fn'      => 'parser_locator::parents',
			'options' => (object)[
				'merge'               => 'unique',
				'value'               => $value,
				'include_parents'     => true,
				'fields_separator'    => ', ',
				'records_separator'   => null,
				'parent_section_tipo' => null
			]
		]],
		'output_format' => 'json'
	];
}

/**
* MIGRATE_DIFFUSION_OVERRIDES
* Install-specific data that used to be hardcoded in this script (a shared rsc tipo pair,
* a "standard code component" tipo, a per-node post-override). It lives in overrides.json
* next to this file so that migrating a DIFFERENT ontology does not inherit another
* install's exceptions.
*
* Path: getenv('MIGRATE_DIFFUSION_OVERRIDES') or <this dir>/overrides.json.
* A missing or unreadable file simply means "no overrides" — never fatal, because the
* overrides are exceptions, not the mapping itself.
*
* @return stdClass  decoded overrides (empty object when there are none)
*/
function migrate_diffusion_overrides() : stdClass {

	static $overrides = null;
	if ($overrides !== null) {
		return $overrides;
	}

	$overrides   = new stdClass();
	$env_path    = getenv('MIGRATE_DIFFUSION_OVERRIDES');
	$is_explicit = !empty($env_path);
	$path        = $is_explicit ? $env_path : __DIR__ . '/overrides.json';

	// ABSENT is a supported state and means "no overrides". BROKEN is not: silently running with
	// every override inactive produces different properties than a run with a valid file, and would
	// otherwise still exit 0. Absent -> silent no-op; present-but-unusable -> counted as a failure.
	if (!is_file($path) || !is_readable($path)) {
		if ($is_explicit) {
			echo "  [WARN] MIGRATE_DIFFUSION_OVERRIDES points to an unreadable file: $path (no overrides applied)\n";
			$GLOBALS['migrate_diffusion_failures'] = (int)($GLOBALS['migrate_diffusion_failures'] ?? 0) + 1;
		}
		return $overrides;
	}

	$decoded = json_decode((string)file_get_contents($path));
	if (!is_object($decoded)) {
		echo "  [WARN] Could not parse overrides file $path (no overrides applied)\n";
		$GLOBALS['migrate_diffusion_failures'] = (int)($GLOBALS['migrate_diffusion_failures'] ?? 0) + 1;
		return $overrides;
	}

	$overrides = $decoded;
	echo "Loaded diffusion migration overrides from: $path\n";

	return $overrides;
}//end migrate_diffusion_overrides

/**
* MIGRATE_DIFFUSION_SCOPE_MATCHES
* Optional scope of an overrides.json rule, so an exception cannot fire outside the
* ontology it was written for. Two independent, OR-ed keys:
*   "tld":   ["numisdata"]    → only on nodes whose tipo belongs to one of these tlds
*   "roots": ["numisdata29"]  → only on these exact node tipos
* A rule carrying NEITHER key is UNSCOPED and fires on every node — that is exactly the
* old hardcoded behaviour, so the shipped overrides.json scopes every rule it seeds.
*
* (`post_overrides` keeps its own, root-oriented check: there the unit of scoping is the
* subtree the caller asked to migrate, not the node being written.)
*
* @param object $rule  overrides.json rule
* @param string $tipo  node being migrated
* @return bool
*/
function migrate_diffusion_scope_matches(object $rule, string $tipo) : bool {

	$ar_tld  = (array)($rule->tld ?? []);
	$ar_root = (array)($rule->roots ?? []);

	if (empty($ar_tld) && empty($ar_root)) {
		return true;
	}
	if (!empty($ar_root) && in_array($tipo, $ar_root, true)) {
		return true;
	}
	if (!empty($ar_tld) && in_array((string)get_tld_from_tipo($tipo), $ar_tld, true)) {
		return true;
	}

	return false;
}//end migrate_diffusion_scope_matches

/**
* MIGRATE_DIFFUSION_APPLY_DDO_ORDER_SWAP
* Declarative replacement of the hardcoded rsc85/rsc86 "flip_people" swap: for every
* configured pair, when BOTH tipos are present in the given ddo_map their positions are
* exchanged. The pairs are install data (rsc85/rsc86 are SHARED rsc tipos, so the old
* hardcode fired on ANY node of ANY ontology reusing them), so they come from
* overrides.json — and each rule carries the optional tld/roots scope enforced by
* migrate_diffusion_scope_matches().
*
* @param array $ddo_map  list of ddo entries (objects with a ->tipo)
* @param string $tipo    node being migrated (scope subject, reported in the [OVERRIDE] line)
* @return array  the ddo_map, with any configured pair swapped
*/
function migrate_diffusion_apply_ddo_order_swap(array $ddo_map, string $tipo) : array {

	$rules = migrate_diffusion_overrides()->ddo_order_swap ?? [];
	if (empty($rules) || !is_array($rules)) {
		return $ddo_map;
	}

	$tipos = array_column($ddo_map, 'tipo');

	foreach ($rules as $rule) {
		if (!is_object($rule) || !migrate_diffusion_scope_matches($rule, $tipo)) {
			continue;
		}
		$pair = $rule->pair ?? null;
		if (!is_array($pair) || count($pair) !== 2) {
			continue;
		}
		$index_a = array_search($pair[0], $tipos, true);
		$index_b = array_search($pair[1], $tipos, true);
		if ($index_a === false || $index_b === false) {
			continue;
		}

		$temp              = $ddo_map[$index_a];
		$ddo_map[$index_a] = $ddo_map[$index_b];
		$ddo_map[$index_b] = $temp;
		$tipos             = array_column($ddo_map, 'tipo');

		$rule_name = $rule->rule ?? ('ddo_order_swap:' . $pair[0] . '/' . $pair[1]);
		echo "  [OVERRIDE] $rule_name applied on $tipo\n";
	}

	return $ddo_map;
}//end migrate_diffusion_apply_ddo_order_swap

/**
* MIGRATE_DIFFUSION_DERIVE_SECTION_TIPO
* Resolves the section a component hop points at. The ontology lookup itself is the
* engine's own diffusion_utils::get_related_section_tipo() — reused rather than
* re-implemented: the local copy called get_ar_tipo_by_model_and_relation() WITHOUT the
* 4th arg, so $search_exact defaulted to false and 'section' str_contains-matched
* section_list, section_group, section_record, section_tab and component_section_id.
* Only the sqo fallback (autocomplete/portal hops that declare their target sections in
* the search query object instead of relating to them) stays local.
*
* @param string|null $hop_tipo  component tipo whose target section is wanted
* @return string|null  section tipo, or null when it cannot be derived
*/
function migrate_diffusion_derive_section_tipo(?string $hop_tipo) : ?string {

	if (empty($hop_tipo)) {
		return null;
	}

	$related_section_tipo = diffusion_utils::get_related_section_tipo($hop_tipo);
	if (!empty($related_section_tipo)) {
		return $related_section_tipo;
	}

	// Autocomplete/portal hops declare their target sections in the search query object
	$hop_properties = ontology_node::get_instance($hop_tipo)->get_properties();
	$ar_request_config = $hop_properties->source->request_config ?? [];
	foreach ($ar_request_config as $request_config) {
		$ar_section_tipo = $request_config->sqo->section_tipo ?? [];
		foreach ($ar_section_tipo as $section_tipo) {
			$value = $section_tipo->value ?? null;
			if (is_array($value) && !empty($value[0])) {
				return $value[0];
			}
			if (is_string($value) && $value !== '') {
				return $value;
			}
		}
	}

	return null;
}//end migrate_diffusion_derive_section_tipo

/**
* MIGRATE_DIFFUSION_TERM_IS_CODE
* Does an ontology term name a section's "official code" component?
*
* Accent-folded, case-insensitive, WHOLE-WORD match against a fixed multi-language token
* set. The former /\bcod/iu was wrong in both directions:
*   - it never matched 'Código oficial' / 'Codi oficial' is fine but 'Código' does not even
*     CONTAIN the literal substring 'cod' (the accent sits between the c and the d), so the
*     rule was inert on any install whose data lang is Spanish or Portuguese;
*   - it matched 'Codex Vaticanus', 'Codificación', … because a prefix is not a word.
*
* @param string $term  ontology term in the data lang (or the lg-eng retry)
* @return bool
*/
function migrate_diffusion_term_is_code(string $term) : bool {

	static $ar_token = [
		'cod', 'cods', 'code', 'codes', 'codi', 'codis', 'codice', 'codici',
		'codigo', 'codigos', 'kod', 'kode', 'koodi'
	];
	static $ar_fold = [
		'á'=>'a', 'à'=>'a', 'ä'=>'a', 'â'=>'a', 'ã'=>'a', 'å'=>'a',
		'é'=>'e', 'è'=>'e', 'ë'=>'e', 'ê'=>'e',
		'í'=>'i', 'ì'=>'i', 'ï'=>'i', 'î'=>'i',
		'ó'=>'o', 'ò'=>'o', 'ö'=>'o', 'ô'=>'o', 'õ'=>'o',
		'ú'=>'u', 'ù'=>'u', 'ü'=>'u', 'û'=>'u',
		'ç'=>'c', 'ñ'=>'n'
	];

	if ($term === '') {
		return false;
	}

	$normalized = strtr(mb_strtolower($term, 'UTF-8'), $ar_fold);
	$ar_word    = preg_split('/[^a-z0-9]+/', $normalized, -1, PREG_SPLIT_NO_EMPTY);

	foreach ((array)$ar_word as $word) {
		if (in_array($word, $ar_token, true)) {
			return true;
		}
	}

	return false;
}//end migrate_diffusion_term_is_code

/**
* MIGRATE_DIFFUSION_DERIVE_CODE_COMPONENT
* Resolves the "code" component of the section a hop points at (v6 hardcoded 'hierarchy41',
* the code component of the lg1 langs thesaurus, for every install). Derivation: the hop's
* own section → its structure (related) nodes → their input_text components → the one whose
* term reads as a code. A successful derivation prints [DERIVED]; when it cannot be derived
* the (scoped) overrides.json value is used and a [FALLBACK] line is printed — never silently.
*
* Returns null when it is neither derivable nor configured IN SCOPE. Callers must treat that
* as a migration FAILURE and write nothing: a null ddo tipo round-trips through save_node()
* as a clean [TEST PASS] and silently publishes 'lg-' instead of 'lg-cat'.
*
* @param string|null $hop_tipo  component tipo whose section carries the code component
* @param string $tipo           node being migrated (reported in the [FALLBACK] line)
* @param string $indent         current log indent
* @return string|null  code component tipo, or null when neither derived nor configured
*/
function migrate_diffusion_derive_code_component(?string $hop_tipo, string $tipo, string $indent='') : ?string {

	$section_tipo = migrate_diffusion_derive_section_tipo($hop_tipo);

	if (!empty($section_tipo)) {
		// The section's components live under the structure nodes the section relates to
		$ar_structure = ontology_node::get_relation_nodes($section_tipo, true, true);
		$ar_candidate = [];
		foreach ((array)$ar_structure as $structure_tipo) {
			$ar_components = ontology_node::get_ar_tipo_by_model_and_relation($structure_tipo, 'component_input_text', 'children_recursive');
			foreach ($ar_components as $component_tipo) {
				// $fallback=false (4th arg): get_term_by_tipo() otherwise falls back to the
				// default data lang, so it NEVER returned '' and the lg-eng retry below was
				// unreachable — an install whose terms are only translated to English matched
				// nothing at all.
				$term = (string)ontology_node::get_term_by_tipo($component_tipo, DEDALO_DATA_LANG, true, false);
				if ($term === '') {
					$term = (string)ontology_node::get_term_by_tipo($component_tipo, 'lg-eng', true, false);
				}
				// 'code' / 'codi' / 'codice' / 'código' …
				if (migrate_diffusion_term_is_code($term)) {
					$ar_candidate[$component_tipo] = true;
				}
			}
		}
		$ar_candidate = array_keys($ar_candidate);
		if (count($ar_candidate) === 1) {
			echo "{$indent}  [DERIVED] code component for $tipo: {$ar_candidate[0]} (from section $section_tipo)\n";
			return $ar_candidate[0];
		}
	}

	// Announced fallback. The rule is scoped like every other overrides.json rule, so a
	// foreign install does not inherit this one's "standard code component".
	$rule     = migrate_diffusion_overrides()->code_component ?? null;
	$in_scope = is_object($rule) ? migrate_diffusion_scope_matches($rule, $tipo) : false;
	$fallback = $in_scope ? ($rule->default ?? null) : null;
	$reason   = !is_object($rule)
		? 'none configured in overrides.json'
		: (!$in_scope
			? 'code_component override out of scope for this tipo'
			: 'no code_component.default in overrides.json');

	echo "{$indent}  [FALLBACK] code component not derivable for $tipo"
		. (empty($section_tipo) ? ' (no section in scope)' : " (section $section_tipo)")
		. ' → ' . (empty($fallback) ? $reason : $fallback) . "\n";

	if (empty($fallback)) {
		return null;
	}

	echo "{$indent}  [OVERRIDE] code_component applied on $tipo\n";

	return (string)$fallback;
}//end migrate_diffusion_derive_code_component

/**
* MIGRATE_DIFFUSION_APPLY_POST_OVERRIDES
* Applies the overrides.json `post_overrides` entries — whole `properties` values that
* replace what the mapping computed for one specific node — AFTER a subtree migration.
* Each entry is scoped BY TLD, not by reachability: it is applied when the requested root is
* listed in the entry's `roots`, or — when `roots` is empty — when the entry's tipo has the
* SAME TLD as the requested root. So migrating another ontology can never rewrite a foreign
* install's node, but migrating `numisdata50` does still rewrite `numisdata1285` even though
* the latter is not under it. Use `roots` when an entry must be pinned to one subtree root.
*
* @param string $root_tipo  root the caller migrated
* @return int  number of entries applied (write verified)
*/
function migrate_diffusion_apply_post_overrides(string $root_tipo) : int {

	$ar_entry = migrate_diffusion_overrides()->post_overrides ?? [];
	if (empty($ar_entry) || !is_array($ar_entry)) {
		return 0;
	}

	$root_tld = get_tld_from_tipo($root_tipo);
	$applied  = 0;

	foreach ($ar_entry as $entry) {

		$entry_tipo = $entry->tipo ?? null;
		$properties = $entry->properties ?? null;
		if (empty($entry_tipo) || !is_object($properties)) {
			continue;
		}

		$ar_root  = (array)($entry->roots ?? []);
		$in_scope = in_array($root_tipo, $ar_root, true)
			|| (empty($ar_root) && get_tld_from_tipo($entry_tipo) === $root_tld);

		if (!$in_scope) {
			echo "  [POST-OVERRIDE SKIPPED - other tld than root $root_tipo] $entry_tipo\n";
			continue;
		}

		if (defined('MIGRATE_DIFFUSION_DRY_RUN') && MIGRATE_DIFFUSION_DRY_RUN === true) {
			echo "  [DRY RUN] would apply post-override on $entry_tipo: " . json_encode($properties) . "\n";
			continue;
		}

		// The write can fail (bad tipo, DB error). It used to be discarded and the
		// [POST-OVERRIDE] line printed anyway, so a failed override looked identical to an
		// applied one — and, unlike save_node(), nothing here reads the value back.
		$updated = dd_ontology_db_manager::update($entry_tipo, (object)['properties' => $properties]);
		if ($updated !== true) {
			echo "  [WARN] post-override write FAILED on $entry_tipo (dd_ontology_db_manager::update returned false)\n";
			$GLOBALS['migrate_diffusion_failures'] = (int)($GLOBALS['migrate_diffusion_failures'] ?? 0) + 1;
			continue;
		}
		if (isset(ontology_node::$instances[$entry_tipo])) {
			unset(ontology_node::$instances[$entry_tipo]);
		}
		if (isset(dd_ontology_db_manager::$load_cache[$entry_tipo])) {
			unset(dd_ontology_db_manager::$load_cache[$entry_tipo]);
		}
		$applied++;
		echo "  [POST-OVERRIDE] $entry_tipo" . (isset($entry->info) ? ' - ' . $entry->info : '') . "\n";
	}

	return $applied;
}//end migrate_diffusion_apply_post_overrides

/**
* DRY RUN
* --dry-run computes and prints the full v6→v7 mapping for every diffusion node
* (the "V6: … / V7: …" pair each node already reports) and writes NOTHING: the two
* writes in save_node() — dd_ontology.properties and the matrix_ontology component —
* are skipped, as is their read-back verification.
*
* It is a review pass, not a safety net: this migration only ever READS the v6
* `propiedades` column and only WRITES the v7 `properties` one, so a real run can
* always be repeated after correcting a mapping. Use the dry run to read the diff
* before committing it.
*
* Requires dd_ontology, i.e. it can only run AFTER the v6→v7 pre_update
* (update::pre_update_version) has built dd_ontology from jer_dd.
*/
define('MIGRATE_DIFFUSION_DRY_RUN', in_array('--dry-run', (array)($argv ?? []), true));

if (MIGRATE_DIFFUSION_DRY_RUN) {
	echo "=== DRY RUN: computing the v6 → v7 diffusion properties mapping, writing NOTHING ===\n";
}

// No activity logging while migrating: this script self-boots its own engine process, so it
// does not inherit the runner's setting. Until phase 2 rewrites matrix_activity to the v7
// typed columns, every deferred log line fails on the still-v6 `datos` layout.
if (class_exists('logger_backend_activity')) {
	logger_backend_activity::$enable_log = false;
}

if (class_exists('DBi') && DBi::check_table_exists('dd_ontology') === false) {
	echo "Error: table 'dd_ontology' does not exist yet. It is created by the v6→v7 pre_update\n"
		. "(update::pre_update_version) from jer_dd — run the database migration first.\n";
	exit(3);
}

force_login(-1);

$root_tipo = DEDALO_DIFFUSION_TIPO; // Diffusion Root
echo "Starting migration analysis from root: $root_tipo\n";

// Global counter
$total_nodes = 0;

// Nodes a dry run would have written (never incremented on a real run)
$dry_run_pending = 0;

// FAILURE / WARNING COUNTERS
// A node that did not round-trip (read-back mismatch), a node whose mapping could not be
// completed (an underivable ddo tipo, a failed post-override) or an exception escaping the
// traversal used to be printed and forgotten: the process still exited 0,
// so the only way to notice was to grep the log. They are counted here and turned into exit 1 by
// the shutdown handler below. Unmapped nodes are a COVERAGE warning, never a failure.
$GLOBALS['migrate_diffusion_failures'] = 0;
$GLOBALS['migrate_diffusion_unmapped'] = 0;

register_shutdown_function(function() : void {

	$failures = (int)($GLOBALS['migrate_diffusion_failures'] ?? 0);
	$unmapped = (int)($GLOBALS['migrate_diffusion_unmapped'] ?? 0);

	if ($failures===0 && $unmapped===0) {
		return;
	}

	fwrite(STDERR, 'diffusion migration summary: failures=' . $failures
		. ' unmapped(warning)=' . $unmapped . PHP_EOL);

	if ($unmapped > 0) {
		fwrite(STDERR, 'WARNING: ' . $unmapped . ' node(s) carry v6 propiedades that matched no mapping '
			. 'branch. Search "[UNMAPPED]" in the log — they are a coverage gap, not a failure.' . PHP_EOL);
	}

	if ($failures > 0) {
		fwrite(STDERR, 'ERROR: ' . $failures . ' node(s) failed to migrate. Search "[TEST FAIL]" / '
			. '"[WARN]" in the log.' . PHP_EOL);
		exit(1);
	}
});

function traverse_ontology_recursive($current_tipo, $level = 0) {
	global $total_nodes;
    $total_nodes++;
    
    $model = ontology_node::get_model_by_tipo($current_tipo);
    $term = ontology_node::get_term_by_tipo($current_tipo, DEDALO_DATA_LANG);
    echo "\nProcessing [{$current_tipo}] {$model} ({$term})...\n";
    
	$children = ontology_node::get_ar_children($current_tipo);
	// Process current node.
	// No "could not load" branch: ontology_node::get_instance() is declared `: self` and always
	// returns an object (it constructs an empty one for an unknown tipo), so the former else
	// branch — and the failure it counted — was unreachable.
	$node = ontology_node::get_instance($current_tipo);
	process_node($node, $level);
	$total_nodes++;

	// Find children using dd_ontology_db_manager
	// We search for nodes where 'parent' column is $current_tipo
	$children_tipos = dd_ontology_db_manager::search(['parent' => $current_tipo], true); // true = order by order_number
	
	if ($children_tipos && count($children_tipos) > 0) {
		foreach ($children_tipos as $child_tipo) {
			traverse_ontology_recursive($child_tipo, $level + 1);
		}
	}
}


function process_node($node, $level) {
	$indent = str_repeat("  ", $level);
	$tipo       = $node->get_tipo();
	$data_to_be_used = null;
	$letter_ids      = [];
	$model_tipo = $node->get_model_tipo(); // Keep for reference if needed
	$model_name = $node->get_legacy_model();      // Human readable name: component_input_text
	$propiedades = $node->get_propiedades();
	$relations  = $node->get_relations();
	
	// Resolve relations
	$relations_info = [];
	if ($relations) {
		$rels = is_string($relations) ? json_decode($relations) : $relations;
		if (is_array($rels)) {
			foreach ($rels as $rel) {
				$rel_tipo = is_object($rel) ? $rel->tipo : $rel; 
				
				$rel_node = ontology_node::get_instance($rel_tipo);
				if ($rel_node) {
					$rel_model_name = $rel_node->get_legacy_model();
					$rel_model_tipo = $rel_node->get_model_tipo();
					
					$relations_info[] = [
						'tipo' => $rel_tipo,
						'model' => $rel_model_name // . " ($rel_model_tipo)" // User wants clear names
					];
				} else {
					$relations_info[] = [
						'tipo' => $rel_tipo,
						'model' => 'NOT_FOUND'
					];
				}
			}
		}
	}

	$node_info = [
		'tipo'          => $tipo,
		'model_tipo'    => $model_tipo,
		'model_name'    => $model_name,
		'propiedades'   => $propiedades,
		'relations'     => $relations,
		'relations_info'=> $relations_info
	];

	// Prepare common variables
	$props = is_string($propiedades) ? json_decode($propiedades) : $propiedades;

	// diffusion_sql::split_data — FILTER THE COMPONENT'S LOCATORS, then resolve as normal.
	// v6 (class.diffusion_sql.php :4418-4471) keeps a subset of the stored locators per the `q`
	// rules and, with resolve_value:true, hands that subset back to the component and asks for its
	// ordinary diffusion value. So the published value is the component's NORMAL value restricted
	// to a slice — which v7 expresses as the normal chain plus one slicing parser:
	//   {key:0, q_operator:'='} -> only the first  -> parser_helper::get_first
	//   {key:0, q_operator:'>'} -> all but the first -> parser_helper::get_tail  (drops the first
	//                                                   item per lang — the same thing)
	// Rather than re-derive the component's base chain here (each component model builds it
	// differently), the node is handed to its model's DEFAULT branch by removing process_dato, and
	// the slice parser is appended to whatever that branch produced. Any other q shape is NOT
	// expressible with the current parser set and is deliberately left unmapped (it will show up
	// as [UNMAPPED]) rather than silently mis-published.
	$split_data_slice = null;
	if (is_object($props) && ($props->process_dato ?? null) === 'diffusion_sql::split_data') {
		$split_q = $props->process_dato_arguments->q ?? [];
		if (is_array($split_q) && count($split_q) === 1) {
			$q0       = $split_q[0];
			$q_key    = $q0->key ?? null;
			$q_op     = $q0->q_operator ?? null;
			$resolve  = $props->process_dato_arguments->resolve_value ?? false;
			if ($resolve === true) {
				// v6 slices the stored LOCATORS by the q rule, then resolves normally:
				//   {key:N, '='} -> that one locator      -> offset N, length 1
				//   {key:N, '>'} -> everything after it   -> offset N+1, to end
				if ($q_op === '=') {
					$split_data_slice = (object)['offset' => (int)$q_key, 'length' => 1];
				} elseif ($q_op === '>') {
					$split_data_slice = (object)['offset' => (int)$q_key + 1];
				}
			}
		}
		if ($split_data_slice !== null) {
			unset($props->process_dato);
			unset($props->process_dato_arguments);
		}
	}

	// DES_ / DES__ PREFIX = DISABLED, v6's convention for commenting a propiedad out
	// without deleting it (DES__process_dato, global_table_maps_DES…). The v6 engine never
	// reads them, so the node behaves as if they were absent — and if what remains is
	// nothing, v6 falls back to its DEFAULT behaviour for the component model.
	// Keeping them made a node look non-empty, so it missed the "empty propiedades ->
	// default" branches entirely and migrated to NO process at all: games.childrens
	// (dd708, {"DES__process_dato": …}) published 480 rows of NULL against a full v6
	// column. TOP-LEVEL keys only — `DES_display` inside a css block is not a propiedad.
	// ts_map* is EDITOR STATE, never diffusion behaviour. Every $is_empty_*() closure in this file
	// already unsets `ts_map` before deciding whether propiedades are behaviourally empty, but a
	// SUFFIXED variant (oh71 carries "ts_map999999999999" — the v6 way of parking a value) slipped
	// past and made the node look non-empty, so it missed its model's default branch and migrated
	// to no process at all: interview.interview_place published NULL against v6's full ancestor
	// chain on 268 cells. Stripping it here makes every closure agree, suffix or not.
	if (is_object($props)) {
		foreach (array_keys(get_object_vars($props)) as $prop_key) {
			$key_string = (string)$prop_key;
			if (strpos($key_string, 'DES_') === 0 || strpos($key_string, 'ts_map') === 0) {
				unset($props->{$prop_key});
			}
		}
	}
	$new_props = null;

	switch ($model_name) {
		case 'diffusion_domain':
			$diffusion_type = 'diffusion_domain';
			break;

		case 'diffusion_group':
			$diffusion_type = 'diffusion_group';
			break;

		case 'diffusion_element':
			$diffusion_type = 'diffusion_element';
			
			// Rule 1, 2 & 3: Map class_name to type and consolidate props
			$class_name_map = [
				'diffusion_mysql'   => 'sql',
				'diffusion_xml'     => 'xml',
				'diffusion_rdf'     => 'rdf',
				'diffusion_socrata' => 'socrata',
			];
			
			if (isset($props->diffusion->class_name) && isset($class_name_map[$props->diffusion->class_name])) {
				$target_type = $class_name_map[$props->diffusion->class_name];
				
				$new_props = new stdClass();
				$new_props->diffusion = new stdClass();
				$new_props->diffusion->type = $target_type;
				
				// Iterate over all V6 properties to move them into diffusion object
				foreach ($props as $key => $value) {
					if ($key === 'diffusion') continue; // Handled separately
					
					// Rule 2: Move property into diffusion object
					$new_props->diffusion->$key = $value;
				}
				
				echo "{$indent}- [$tipo] $model_name\n";
				echo "{$indent}  [RULE APPLIED] {$props->diffusion->class_name} -> type: $target_type + consolidate props\n";
			}
			break;
		case 'database':
			$diffusion_type = 'database';
			break;
		case 'table':
			$diffusion_type = 'table';
			// Carry global_table_maps (v6 secondary aggregate-table write) verbatim to v7
			// properties. The Bun engine derives the global table rows from this source
			// table's already-parsed columns (composite key {section_tipo}_{section_id} +
			// columns_map source→target). See diffusion_processor.ts build_global_tables.
			if (isset($props->global_table_maps)) {
				$new_props = new stdClass();
				$new_props->global_table_maps = $props->global_table_maps;
			}
			break;
		// All Field Types
		case 'field_enum':
		case 'field_text':
		case 'field_date':
		case 'field_datetime':
		case 'field_int':
		case 'field_varchar':
		case 'field_year':
		case 'field_boolean':
		case 'field_decimal':
		case 'field_point':
		case 'field_mediumtext':
			$diffusion_type = 'field';

				// RDF-in-column (nomisma_rdf): v6 process_dato=diffusion_sql::generate_rdf embeds a
				// per-record RDF doc from another element. v7 routes it via properties.diffusion.type
				// ='rdf' + diffusion_element_tipo (dd_diffusion_api rdf_field_nodes → diffusion_rdf::
				// build_rdf_xml). NOT YET ENABLED: that embedded-RDF path currently aborts the whole
				// diffuse in the harness (needs the build_rdf_xml 'pure' path debugged). The EasyRdf
				// autoload bug it surfaced (class.diffusion_rdf.php → composer autoload) IS fixed.
				// Re-enable once the engine path is stable:
				//   if (($props->process_dato ?? null) === 'diffusion_sql::generate_rdf') {
				//       $new_props = new stdClass();
				//       $new_props->diffusion = (object)['type'=>'rdf','diffusion_element_tipo'=>$props->diffusion_element_tipo ?? null];
				//       break;
				//   }
			
			// Calculate effective count ignoring behavioral properties (info, exclude_column, is_publicable)
			$props_check = is_object($props) ? clone $props : (object)[];
			if (isset($props_check->info)) unset($props_check->info);
			if (isset($props_check->exclude_column)) unset($props_check->exclude_column);
			if (isset($props_check->is_publicable)) unset($props_check->is_publicable);
			$clean_count = count((array)$props_check);

			if (!empty($relations_info)) {
				foreach ($relations_info as $rel_info) {
					switch ($rel_info['model']) {
						case 'component_publication':

							// Specific complex object for Enum + Relation
							$parser_process = [
								(object)[
									'fn' => 'parser_locator::get_v6_section_id'
								],
								(object)[
									'fn' => 'parser_helper::get_first'
								],
								(object)[
									'fn' => 'parser_text::map_value',
									'options' => (object)[
										'map' => [
											(object)[
												'a' => $props->enum ?? (object)["1"=>"Yes", "0"=>"No"]
											]
										]
									]
								]
							];

							$new_props = new stdClass();
							$new_props->process = new stdClass();

							// THE ENUM MAPPING IS THE field_enum COLUMN'S BEHAVIOUR, NOT the
							// component's. The same component_publication relation is published by
							// both a field_enum column (interview.publication, oh67 -> 'yes') and a
							// field_text one (document.publication, rsc445 -> '["1"]'), from
							// IDENTICAL propiedades carrying the same enum map. v6 applies the map
							// only for field_enum; the non-enum column publishes the raw locator
							// section_id array. Applying it everywhere turned document.publication
							// into 'yes' against v6's '["1"]' on 212 cells.
							if ($model_name === 'field_enum') {
								$new_props->process->parser = $parser_process;
								$new_props->process->output_sample = "Yes";

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
							} else {
								$new_props->process->parser = [
									(object)['fn' => 'parser_locator::get_v6_section_id']
								];
								$new_props->process->output_format = 'json';
								$new_props->process->output_sample = ["1"];
								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] component_publication on a non-enum column -> raw section_id json\n";
							}

							if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }
							if(isset($props->info)){ $new_props->info = $props->info; }
							break;

						case 'component_autocomplete_hi':
							// 
							$is_empty = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							// first propiedades
							$data_to_be_used        = $props->data_to_be_used ?? null;

							//0 Resolve the target section is multiple and it's not a common thesarurs
							// as collection calling to People and Entity
							$ontology_node = ontology_node::get_instance($rel_info['tipo']);
							$properties = $ontology_node->get_properties();
							
							$show = $properties->source->request_config[0]->show ?? null;
							$target_ddo_map = $show->ddo_map ?? null;

							if($target_ddo_map && !isset($props->process_dato) && !isset($data_to_be_used)){
								
								$parent_tipos = array_column($target_ddo_map, 'parent');
								// Exclude component_dataframe columns (uncertainty/qualifier frames):
								// they are skipped when the ddo_map is built, so they must not inflate
								// the target-section count and force the multi-section merge path. A
								// single hierarchical column with a sibling dataframe (e.g. place →
								// hierarchy25 + numisdata272) is NOT multi-section; it should resolve
								// through the parents path that honours value_with_parents.
								$last_items = array_filter($target_ddo_map, function($item) use ($parent_tipos) {
									if (in_array($item->tipo, $parent_tipos)) return false;
									return ontology_node::get_model_by_tipo($item->tipo) !== 'component_dataframe';
								});
								$section_tipos = array_unique(array_column($last_items, 'section_tipo'));
								$count_sections = count($section_tipos);

								$multiple_target_section = $count_sections > 1;

								if($multiple_target_section){
									if(!empty($show)) {
										$deep_ddo = [
											(object)[
												'tipo'         => $rel_info['tipo'],
												'section_tipo' => 'self'
											]
										];
										foreach ($target_ddo_map as $ddo) {
											$new_ddo = new stdClass();
											$model = ontology_node::get_model_by_tipo($ddo->tipo);
											if($model === 'component_dataframe'){
												continue;
											}						
											if($ddo->parent === 'self') {
												$new_ddo->parent = $rel_info['tipo'];
											}else{
												$new_ddo->parent = $ddo->parent;
											}									
											$new_ddo->tipo = $ddo->tipo;

											$deep_ddo[] = $new_ddo;
										}

										// Declarative ddo order swaps (formerly the hardcoded rsc85/rsc86
										// "flip_people"). rsc85/rsc86 are SHARED rsc tipos, so the pairs are
										// install data and live in overrides.json, not here.
										$deep_ddo = migrate_diffusion_apply_ddo_order_swap($deep_ddo, $tipo);

										$parser_process = (object)[										
											'parser' => [
												(object)[
													'fn' => 'parser_helper::merge',
													'options' => (object)[
														'merge' => 'string',
														'empty_columns' => false,
														'fields_separator' => ', '
													]
												]
											],
											"output_format" => "string"
										];

										$new_props = new stdClass();
											$new_props->process = $parser_process;
											$new_props->process->ddo_map = $deep_ddo;
											$new_props->process->output_sample = 'My data, other data';

										// "is_publicable" = true
										if(isset($props->is_publicable) && $props->is_publicable === true){
											$new_props->is_publishable = $props->is_publicable;
										}

										// "varchar" = 256
										if(isset($props->varchar)){
											$new_props->varchar = $props->varchar;
										}
										
										echo "{$indent}- [$tipo] $model_name\n";
										echo "{$indent}  [RULE APPLIED] diffusion_sql::map_locator_to_terminoID\n";
										break;
									}
								}
							}

							// 0 emtpy propiedades
							if($is_empty($props)) {
									// The hierarchical component (rel_info) decides whether v6 emits the full parent
									// term path (value_with_parents:true, e.g. place) or just the leaf term (no flag,
									// e.g. descriptors: "Iberian, Ordination").
									$comp_node_e  = ontology_node::get_instance($rel_info['tipo']);
									$comp_props_e = $comp_node_e ? $comp_node_e->get_propiedades(true) : null;
									$with_parents_e = (is_object($comp_props_e) && ($comp_props_e->value_with_parents ?? false) === true);


								$parser_process = (object)[
									'fn' => 'add_parents',
									'parser' => [
										(object)[
											'fn' => 'parser_locator::parents',
											'options' => (object)[
												'value' => 'term',
												'include_parents' => $with_parents_e,
												'fields_separator' => $props->source->divisor ?? ' - ',
												'records_separator' => $props->source->records_separator ?? ', '
											]
										]
									],
									'output_format' => 'string'
								];


								$new_props = new stdClass();
									$new_props->process = $parser_process;
									$new_props->process->output_sample = "Bilbao - Bizkaia - País Vasco - España, Abergement-Clémenciat (L') - Bourg-en-Bresse - Ain - France";

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
								break;
							}

							// with propiedades
							$value								= 'term'; // What to extract: "term" (default), "term_id", "section_id", "typology", "typology_section_id".
							$include_parents					= true; // If true, include all parents in the chain. Default: true.
							$include_self						= true; // If true, include the item itself (index 0). Default: true.
							$records_separator					= ', '; // Separator between different parent chains. Default: ", ". Set to false for array output.
							$fields_separator					= ' - '; // Separator between values in the same chain. Default: "								// ".
							$parents_splice						= []; // Array of two integers [start, deleteCount] to splice the parent chain. Default: [].
							$parent_end_by_term_id				= []; // Array of term_ids to truncate the parent chain at. Default: [].
							$parent_section_tipo				= []; // Array section_tipo to keep to Default: [].
							$parent_end_by_typology_term_id		= []; // Array 
							$merge								= null; // Define the way to merger the parents. nested | flat | pipe Default: null.

							// 1 "option_obj" first level
							$option_obj = isset($props->option_obj) ? $props->option_obj : null;
							if($option_obj) {								
								
								$process_dato_arguments = $props->process_dato_arguments ?? null;
								$custom_arguments       = $process_dato_arguments->custom_arguments ?? null;
								$output                 = $process_dato_arguments->output ?? null;
								$data_to_be_used        = $props->data_to_be_used ?? null;
								$ddo_map = null;

								$new_props = new stdClass();
								$new_props->process = get_diffusion_value(
									$tipo,
									'component_autocomplete_hi',
									$custom_arguments,
									$process_dato_arguments,
									$output,
									$data_to_be_used,
									$option_obj,
									$ddo_map
								);

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
								break;
							}

							// 2 "process_dato" first level
							$process_dato = isset($props->process_dato) ? $props->process_dato : null;


								// 2.1 "process_dato" = "diffusion_sql::map_locator_to_terminoID"
							if( $process_dato 
								&& $process_dato=== "diffusion_sql::map_locator_to_section_label")
							{			
								$parser_process = (object)[											
									'fn' => 'map_locator_to_section_label',
									"output_format" => "json"
								];

								$new_props = new stdClass();
									$new_props->process = $parser_process;
									$new_props->process->output_sample = ["object","catalog"];

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}
								
								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] diffusion_sql::map_locator_to_terminoID\n";
								break;
							}


							// 2.1 "process_dato" = "diffusion_sql::map_locator_to_terminoID"
							if( $process_dato 
								&& $process_dato=== "diffusion_sql::map_locator_to_terminoID"
								|| $process_dato === 'diffusion_sql::map_locator_to_term_id'){

								$process_dato_arguments = $props->process_dato_arguments ?? null;
								$add_parents = $process_dato_arguments->custom_arguments->add_parents ?? null;
								$use_parent = $process_dato_arguments->use_parent ?? null;

								// 2.1.1 "add_parents" = true (implicit "use_parent" = true)
								if(isset($process_dato_arguments) && isset($add_parents) && $add_parents === true){
									$divisor = $process_dato_arguments;

									$parser_options = new stdClass();
										$parser_options->value = "term_id";
										// merge:'unique' is REQUIRED whenever parser_locator::parents feeds a json column.
										// The oracle (v7_php_frozen diffusion/api/v1/lib/parsers/parser_locator.ts parents
										// :598-612) branches on merge_style: 'unique' flatMaps the ancestor chain into the
										// ARRAY of individual values v6 published, while the DEFAULT joins the chain into one
										// string with records_separator. Same parser, same chain — the option alone decides
										// array vs string. Without it informant.birthplace_id_full published
										// 'es1_3410, es1_8817, …' where v6 had ["es1_3410","es1_8817",…] (1272 cells).
										$parser_options->merge = 'unique';
										$parser_options->include_parents = true;

									$parser_process = (object)[											
										'fn' => 'add_parents',
										'parser' => [
											(object)[
												'fn' => 'parser_locator::parents',
												'options' => $parser_options
											]
										],
										"output_format" => "json"
									];


									$new_props = new stdClass();
										$new_props->process = $parser_process;
										$new_props->process->output_sample = ["es1_1257","es1_8844","es1_8864","es1_1","fr1_3","fr1_36686","fr1_37027","fr1_37147","fr1_1"];

									// "is_publicable" = true
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}

									// "varchar" = 256
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}
									
									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] diffusion_sql::map_locator_to_terminoID\n";
									break;
								}

								// 2.1.2 "use_parent" = true "add_parents" = false
								if(isset($process_dato_arguments) && isset($use_parent) && $use_parent === true && isset($add_parents) && $add_parents === false){
									$divisor = $process_dato_arguments;

									$parser_options = new stdClass();
										$parser_options->value 			= "term_id";
										// merge:'unique' is REQUIRED whenever parser_locator::parents feeds a json column.
										// The oracle (v7_php_frozen diffusion/api/v1/lib/parsers/parser_locator.ts parents
										// :598-612) branches on merge_style: 'unique' flatMaps the ancestor chain into the
										// ARRAY of individual values v6 published, while the DEFAULT joins the chain into one
										// string with records_separator. Same parser, same chain — the option alone decides
										// array vs string. Without it informant.birthplace_id_full published
										// 'es1_3410, es1_8817, …' where v6 had ["es1_3410","es1_8817",…] (1272 cells).
										$parser_options->merge = 'unique';
										$parser_options->parents_splice = [2];
										$parser_options->include_self   = false;

									$parser_process = (object)[							
										'fn' => 'add_parents',
										'parser' => [
											(object)[
												'fn' => 'parser_locator::parents',
													'options' => $parser_options
												]
											],
											"output_format" => "json"
										];

									$new_props = new stdClass();
										$new_props->process = new stdClass();
										$new_props = new stdClass();
										$new_props->process = $parser_process;
										$new_props->process->output_sample = ["es1_8844","fr1_36686"];

									// "is_publicable" = true
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}

									// "varchar" = 256
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}
									
									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] diffusion_sql::map_locator_to_terminoID\n";
									break;
								}

								// 2.1.3 "add_parents" = false or not defined
								$parser_options = new stdClass();

								$parser_process = (object)[					
									'parser' => [
										(object)[
											'fn' => 'parser_locator::get_term_id'
										]
									],
									"output_format" => "json"
								];
								$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props = new stdClass();
									$new_props->process = $parser_process;
									// Resolve the parent relation component so the chain fetches its diffusion
									// data (incl. the hierarchy1 root fallback for top-level thesaurus terms).
									$ddo_parent_rp = (object)['tipo' => $rel_info['tipo'], 'section_tipo' => 'self'];
								// add_parents (thesaurus 'parents' field): resolve the FULL ancestor chain
								// recursively (v6 get_parents_recursive) instead of just the direct parent.
								$add_parents_rp = $props->process_dato_arguments->custom_arguments->add_parents
									?? $props->process_dato_arguments->add_parents ?? false;
								if ($add_parents_rp === true) {
									// Canonical ancestor-chain pattern: process-level add_parents (chain → meta)
									// + parser_locator::parents (shapes it), mirroring the parents_term column.
									// Replaces the removed per-ddo get_diffusion_data_recursive fn.
									$new_props->process = diffusion_build_add_parents_process('term_id');
								} else {
									$new_props->process->ddo_map = [ $ddo_parent_rp ];
								}
									$new_props->process->output_sample = ["es1_1257","fr1_3"];

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// v6 map_locator_to_terminoID checks publishability ONLY when the node
								// asks: $check_publishable defaults to FALSE (class.diffusion_sql.php
								// :3646-3647). v7 skips unpublishable locators on a childless hop, so
								// informant.birthplace_id published NULL where v6 emits ["es1_8906"] —
								// that place record carries no publication component at all.
								// is_publishable is v7's per-locator publication-check override.
								$chk_pub_mlt = $props->process_dato_arguments->check_publishable
									?? $props->process_dato_arguments->custom_arguments->check_publishable
									?? false;
								if ($chk_pub_mlt !== true) {
									$new_props->is_publishable = true;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] diffusion_sql::map_locator_to_terminoID\n";
								break;


							}

							// 2.2 "process_dato" = "diffusion_sql::count_data_elements"
							if($process_dato && $process_dato=== "diffusion_sql::count_data_elements"){

								$parser_process = (object)[									
									'parser' => [
										(object)[
											'fn' => 'parser_helper::count'
										]
									],
									"output_format" => "int"
								];

								$new_props = new stdClass();
									$new_props->process = $parser_process;
									$new_props->process->output_sample = 2;
									// v6 count_data_elements returns (int)count($dato) — 0, never NULL, when
									// the component holds nothing (class.diffusion_sql.php :4392-4416). Same
									// empty-value contract as map_quality_to_int: publications.authors_count
									// published NULL against v6's 0 on 164 cells.
									$new_props->process->default_value = 0;
									// parser_helper::count counts the resolved data items, so it needs a
									// ddo_map that resolves the field's relation locators (e.g. authors
									// rsc139) — without it there is nothing to count and the column is 0.
									if(!empty($rel_info['tipo'])){
										$new_props->process->ddo_map = [ (object)['tipo' => $rel_info['tipo'], 'section_tipo' => 'self'] ];
									}

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] diffusion_sql::count_data_elements\n";
								break;

								// 2.3 "process_dato" = "diffusion_sql::split_data": resolve a SINGLE relation
								// entry's display (e.g. publications author_main = FIRST author "surname, name").
								if($process_dato && $process_dato === "diffusion_sql::split_data"){
									$pda_sd  = $props->process_dato_arguments ?? null;
									$q_sd    = $pda_sd->q ?? [];
									$off_sd  = (is_array($q_sd) && isset($q_sd[0]->key)) ? (int)$q_sd[0]->key : 0;
									// q_operator ">" => ALL entries AFTER index `key` (e.g. author_others =
									// authors[1:], each "surname, name" joined by ", "). No operator => a
									// SINGLE entry at `key` (e.g. author_main = authors[0]).
									$op_sd   = (is_array($q_sd) && isset($q_sd[0]->q_operator)) ? $q_sd[0]->q_operator : null;
									$rest_sd = ($op_sd === '>');
									$slice_off_sd = $rest_sd ? ($off_sd + 1) : $off_sd;
									$slice_len_sd = $rest_sd ? null : 1; // null length = all remaining (array_slice)
									$rel_sd  = $rel_info['tipo'] ?? null;
									if($rel_sd){
										$rprops_sd = ontology_node::get_instance($rel_sd)->get_properties();
										$show_sd   = $rprops_sd->source->request_config[0]->show->ddo_map ?? [];
										$ddo_sd    = [ (object)['tipo'=>$rel_sd, 'section_tipo'=>'self', 'data_slice'=>(object)['offset'=>$slice_off_sd, 'length'=>$slice_len_sd]] ];
										$lids_sd   = [];
										foreach($show_sd as $sc_sd){
											$lid_sd = chr(ord('a') + count($lids_sd)); $lids_sd[] = $lid_sd;
											$ddo_sd[] = (object)['id'=>$lid_sd, 'tipo'=>$sc_sd->tipo, 'parent'=>$rel_sd];
										}
										$pat_sd = implode(', ', array_map(fn($l)=>'${'.$l.'}', $lids_sd));
										$opts_sd = (object)['pattern'=>$pat_sd];
										// joining the multiple entries (author_others) uses the same ", " divisor
										if($rest_sd){ $opts_sd->records_separator = ', '; }
										$new_props = new stdClass();
										$new_props->process = (object)[
											'parser' => [ (object)['fn'=>'parser_text::text_format', 'options'=>$opts_sd] ],
											'ddo_map' => $ddo_sd,
											'output_format' => 'string'
										];
										if(isset($props->is_publicable) && $props->is_publicable === true){ $new_props->is_publishable = $props->is_publicable; }
										if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }
										echo "{$indent}  [RULE APPLIED] diffusion_sql::split_data -> relation display (".($rest_sd ? "entries >$off_sd" : "entry $off_sd").")\n";
										break;
									}
								}

							}

							// 2.3 "process_dato" = "diffusion_sql::resolve_component_value"
							if($process_dato && $process_dato=== "diffusion_sql::resolve_component_value"){

								$process_dato_arguments = $props->process_dato_arguments;
								$component_method = $process_dato_arguments->component_method ?? null;

								$custom_arguments = $process_dato_arguments->custom_arguments[0] ?? new stdClass();
								$custom_parents = $custom_arguments->custom_parents ?? null;

								$select_model = $custom_parents->select_model ?? null;
								$parents_slice = $custom_parents->slice ?? null;
								$parent_end_by_model = $custom_parents->parent_end_by_model ?? null;

								if($component_method === 'get_dato'){

									$new_props = new stdClass();
									$new_props->process = get_dato(										
										'component_autocomplete_hi',
										null,
										null,
										null,
										null									
									);

									// "is_publicable" = true
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}

									// "varchar" = 256
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}

									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
									break;

								}

								$parser_options = new stdClass();
								if(isset($props->value_to_extract)){
									$parser_options->value =($component_method==="get_diffusion_value") ? "term" : "term_id" ;
								}
								if(isset($select_model)){
									$parser_options->parent_typology_term_id = $select_model;
								}
								if(isset($parents_slice)){
									$parser_options->parents_slice = $parents_slice;
								}
		
								if(isset($parent_end_by_model)){
									$parser_options->parent_end_by_typology_term_id = $parent_end_by_model;
								}								

								$parser_process = (object)[
									'fn' => 'add_parents',
									'parser' => [
										(object)[
											'fn' => 'parser_locator::parents',
												'options' => $parser_options
											]
										],
									'output_format' => 'string'							
								];
								
								$new_props = new stdClass();
									$new_props->process = $parser_process;
									$new_props->process->output_sample = "Bilbao";

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
								break;
							}

							// 2.4 "process_dato" = "diffusion_sql::resolve_value"
							if($process_dato && $process_dato=== "diffusion_sql::resolve_value"){

								// direct properties
								$process_dato_arguments = $props->process_dato_arguments ?? null;
								$component_method = $process_dato_arguments->component_method ?? 'get_diffusion_value';
								$target_component_tipo = trim($process_dato_arguments->target_component_tipo ?? "");
								$output = $process_dato_arguments->output ?? null;
								$custom_arguments = $process_dato_arguments->custom_arguments[0] ?? null;
								$is_publicable = $process_dato_arguments->is_publicable ?? null;
								
								$ddo_map = [
									(object)[
										'tipo'         => $rel_info['tipo'],
										'section_tipo' => 'self'
									],
									(object)[
										'tipo'         => $target_component_tipo,
										'label'        => 'Term',
										'parent'       => $rel_info['tipo']
									]
								];

								//2.4.1 "component_method" = "get_diffusion_dato"
								if($component_method === "get_diffusion_dato" && !isset($custom_arguments)){

									$model = ontology_node::get_legacy_model_by_tipo($target_component_tipo);
									$new_props = new stdClass();
									$new_props->process = get_diffusion_dato(										
										$model,
										$custom_arguments,
										$process_dato_arguments,
										$output,
										$ddo_map								
									);

									// "is_publicable" = true
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}

									// "varchar" = 256
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}

									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
									break;
								}

								// 2.4.2  "component_method" = "get_diffusion_value"
								if($component_method === "get_diffusion_value"){	
									
									$model = ontology_node::get_legacy_model_by_tipo($target_component_tipo);

									$new_props = new stdClass();
									$new_props->process = get_diffusion_value(
										$target_component_tipo,
										$model,
										$custom_arguments,
										$process_dato_arguments,
										$output,
										$data_to_be_used,
										$option_obj,
										$ddo_map
									);

									// get_diffusion_value(input_text) emits no ddo_map (the input_text case
									// is a no-op), so attach the built [relation, target] map ourselves —
									// otherwise the column resolves only the relation locator and yields null
									// (e.g. publications authors_name/surname rsc734/rsc735 → rsc139 → rsc85/rsc86).
									if($model === 'component_input_text'){
										$new_props->process->ddo_map = $ddo_map;
									}

									// "is_publicable" = true
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}

									// "varchar" = 256
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}

									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] diffusion_sql::resolve_value with get_diffusion_value\n";
									break;
								}

								// 2.4.4 "component_method" = "get_dato"
								if($component_method === "get_dato"){

									$model = ontology_node::get_legacy_model_by_tipo($target_component_tipo);

									$output_options = $process_dato_arguments->output_options ?? null;
									$new_props = new stdClass();
									$new_props->process = get_dato(
										$model,
										$custom_arguments,
										$output,
										$output_options,
										$ddo_map
									);

									// "is_publicable" = true
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}

									// "varchar" = 256
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}

									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
									break;
									
								}

								// 2.4.6 "component_method" = "get_diffusion_resolve_value" && isset($custom_arguments)
								// second deep component
								if($component_method === "get_diffusion_resolve_value" && isset($custom_arguments)){

									$first_custom_arg = is_array($custom_arguments) ? ($custom_arguments[0] ?? null) : $custom_arguments;
									$process_dato_arguments_2 = $first_custom_arg->process_dato_arguments ?? null;
									if ($process_dato_arguments_2) {
										$component_method_2 = $process_dato_arguments_2->component_method ?? null;
										$target_component_tipo_2 = $process_dato_arguments_2->target_component_tipo ?? null;
										$output_2 = $process_dato_arguments_2->output ?? null;
										$output_options_2 = $process_dato_arguments_2->output_options ?? null;
											// $date_format_2 = $output_options_2->date_format;
											// $selected_key_2 = $output_options_2->selected_key;
											// $selected_date_2 = $output_options_2->selected_date;
										$empty_value_2 = $process_dato_arguments_2->empty_value ?? null;
										$is_publicable_2 = $process_dato_arguments_2->is_publicable ?? null;
										$process_dato_2 = $process_dato_arguments_2->process_dato ?? null;
										$fallback_2 = $process_dato_arguments_2->fallback ?? null;
											// $tipo_2 = $fallback_2->tipo;
											// $method_2 = $fallback_2->method;
										$target_component_properties_2 = $process_dato_arguments_2->target_component_properties ?? null;
											// $separator_rows_2 = $target_component_properties_2->separator_rows ?? null;
											$data_to_be_used_2 = $target_component_properties_2->data_to_be_used ?? null;
											// $separator_fields_2 = $target_component_properties_2->separator_fields ?? null;
										$divisor_2 = $process_dato_arguments_2->divisor ?? null;
										
										$process_dato_arguments_3 = $process_dato_arguments_2->process_dato_arguments ?? null;
											// $dato_3 = $process_dato_arguments_3->dato;
											// $options_3 = $process_dato_arguments_3->options;
										
										$custom_parents_2 = $process_dato_arguments_2->custom_parents ?? null;

										$custom_arguments_2 = $process_dato_arguments_2->custom_arguments ?? null;


										$ddo_map2 = [
											(object)[
												'tipo'         => $rel_info['tipo'],
												'section_tipo' => 'self'
											],
											(object)[
												'tipo'         => $target_component_tipo,							
												'parent'       => $rel_info['tipo']
											],
											(object)[
												'tipo'         => $target_component_tipo_2,
												'parent'       => $target_component_tipo
											]
										];

										// 2.4.5
										// geojson
										if(isset($fallback_2)&& $fallback_2->method === 'get_diffusion_value_as_geojson'){
											$component_tipo = $fallback_2->tipo;

											$ddo_map3 = [
												(object)[
													'tipo'         => $rel_info['tipo'],
													'section_tipo' => 'self'
												],
												(object)[
													'tipo'         => $component_tipo,							
													'parent'       => $rel_info['tipo']
												]
											];

											$parser_process = (object)[
												'parser' => [
													(object)[
														'fn' => 'parser_geo::geojson'
													]
												],
												'output_format' => 'json'							
											];
										
											$new_props = new stdClass();
												$new_props->process = $parser_process;
												$new_props->process->ddo_map = $ddo_map3;
												$new_props->process->output_sample = '[{"layer_id":1,"layer_data":{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[-2.923972570429317,43.257925269216365]}}]}}]';

											// "is_publicable" = true
											if(isset($props->is_publicable) && $props->is_publicable === true){
												$new_props->is_publishable = $props->is_publicable;
											}

											// "varchar" = 256
											if(isset($props->varchar)){
												$new_props->varchar = $props->varchar;
											}

											echo "{$indent}- [$tipo] $model_name\n";
											echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
											break;
										}

										// 2.4.6.1 "component_method" = "get_diffusion_value"
										if($component_method_2 === "get_diffusion_value" && !isset($custom_arguments_2)){

											$model = ontology_node::get_legacy_model_by_tipo($target_component_tipo_2);

											$new_props = new stdClass();
											$new_props->process = get_diffusion_value(
												$target_component_tipo_2,
												$model,
												$custom_arguments_2,
												$process_dato_arguments_2,
												$output_2,
												$data_to_be_used_2,
												$option_obj,
												$ddo_map2
											);

											if($model === 'component_input_text'){
												$new_props->process->ddo_map = $ddo_map2;
											}

											// "is_publicable" = true
											if(isset($props->is_publicable) && $props->is_publicable === true){
												$new_props->is_publishable = $props->is_publicable;
											}

											// "varchar" = 256
											if(isset($props->varchar)){
												$new_props->varchar = $props->varchar;
											}

											echo "{$indent}- [$tipo] $model_name\n";
											echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
											break;
											
										}

										// 2.4.7 "component_method": "get_dato",
										if($component_method_2 === "get_dato"){

											$model = ontology_node::get_legacy_model_by_tipo($target_component_tipo_2);

											$new_props = new stdClass();
											$new_props->process = get_dato(												
												$model,
												$custom_arguments_2,
												$output_2,
												$output_options_2,
												$ddo_map2
											);

											if($model === 'component_input_text'){
												$new_props->process->ddo_map = $ddo_map2;
											}

											// "is_publicable" = true
											if(isset($props->is_publicable) && $props->is_publicable === true){
												$new_props->is_publishable = $props->is_publicable;
											}

											// "varchar" = 256
											if(isset($props->varchar)){
												$new_props->varchar = $props->varchar;
											}

											echo "{$indent}- [$tipo] $model_name\n";
											echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
											break;

										}


										// 2.5 "component_method" = "get_diffusion_resolve_value" && isset($custom_arguments)
										// second deep component
										if($component_method_2 === "get_diffusion_resolve_value" && isset($custom_arguments_2)){

											$first_custom_arg_2 = is_array($custom_arguments_2) ? ($custom_arguments_2[0] ?? null) : $custom_arguments_2;
											$process_dato_arguments_3 = $first_custom_arg_2->process_dato_arguments ?? null;
											if ($process_dato_arguments_3) {
												$component_method_3 = $process_dato_arguments_3->component_method ?? null;
												$target_component_tipo_3 = $process_dato_arguments_3->target_component_tipo ?? null;
												$output_3 = $process_dato_arguments_3->output ?? null;
												$output_options_3 = $process_dato_arguments_3->output_options ?? null;

												$empty_value_3 = $process_dato_arguments_3->empty_value ?? null;
												$is_publicable_3 = $process_dato_arguments_3->is_publicable ?? null;
												$process_dato_3 = $process_dato_arguments_3->process_dato ?? null;
												$fallback_3 = $process_dato_arguments_3->fallback ?? null;
												$target_component_properties_3 = $process_dato_arguments_3->target_component_properties ?? null;
												$data_to_be_used_3 = $target_component_properties_3->data_to_be_used ?? null;
												$divisor_3 = $process_dato_arguments_3->divisor ?? null;
												
												$process_dato_arguments_4 = $process_dato_arguments_3->process_dato_arguments ?? null;
												
												$custom_parents_3 = $process_dato_arguments_3->custom_parents ?? null;

												$custom_arguments_3 = $process_dato_arguments_3->custom_arguments ?? null;


												$ddo_map3 = [
													(object)[
														'tipo'         => $rel_info['tipo'],
														'section_tipo' => 'self'
													],
													(object)[
														'tipo'         => $target_component_tipo,							
														'parent'       => $rel_info['tipo']
													],
													(object)[
														'tipo'         => $target_component_tipo_2,
														'parent'       => $target_component_tipo
													],
													(object)[
														'tipo'         => $target_component_tipo_3,
														'parent'       => $target_component_tipo_2
													]
												];


												// 2.5.1 "component_method" = "get_diffusion_value"
												if($component_method_3 === "get_diffusion_value" && !isset($custom_arguments_3)){

													$model = ontology_node::get_legacy_model_by_tipo($target_component_tipo_3);

													$new_props = new stdClass();
													$new_props->process = get_diffusion_value(
														$target_component_tipo_3,
														$model,
														$custom_arguments_3,
														$process_dato_arguments_3,
														$output_3,
														$data_to_be_used_3,
														$option_obj,
														$ddo_map3
													);

													// "is_publicable" = true
													if(isset($props->is_publicable) && $props->is_publicable === true){
														$new_props->is_publishable = $props->is_publicable;
													}

													// "varchar" = 256
													if(isset($props->varchar)){
														$new_props->varchar = $props->varchar;
													}

													echo "{$indent}- [$tipo] $model_name\n";
													echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
													break;
													
												}
											}
										}
									}

								}
							}

							// 2.5 "process_dato" = "diffusion_sql::map_locator_to_name"
							if($process_dato && $process_dato=== "diffusion_sql::map_locator_to_name"){

								$process_dato_arguments 	= $props->process_dato_arguments ?? null;
								$custom_arguments 			= $process_dato_arguments->custom_arguments ?? null;
								$custom_map 				= $custom_arguments->map ?? null;

								$parser_process = (object)[									
									'parser' => [
										(object)[
											'fn' => 'parser_locator::map_section_tipo_to_name',
											'options' => (object)[
												'map' => $custom_map
											]
										]
									],
									"output_format" => "string"
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process = $parser_process;
								$new_props->process->output_sample = 'ts_thematics';

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}
								
								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] diffusion_sql::map_locator_to_name\n";
								break;

							}

							// 2.6 "process_dato" = "diffusion_sql::map_locator_to_section_tipo"
							if($process_dato && $process_dato=== "diffusion_sql::map_locator_to_section_tipo"){

								$parser_process = (object)[									
									'parser' => [
										(object)[
											'fn' => 'parser_locator::get_section_tipo'
										]
									]
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process = $parser_process;

								// output_sample is only an example of what this column emits: the section
								// tipo the source hop points at. It used to be the literal 'numisdata4' of
								// the install this rule was written on — a wrong sample is worse than none,
								// so it is derived here and simply omitted when it cannot be.
								$sample_section_tipo = migrate_diffusion_derive_section_tipo($rel_info['tipo'] ?? null);
								if (!empty($sample_section_tipo)) {
									$new_props->process->output_sample = $sample_section_tipo;
									echo "{$indent}  [DERIVED] output_sample section tipo for $tipo: $sample_section_tipo\n";
								} else {
									echo "{$indent}  [FALLBACK] no section tipo in scope for output_sample on $tipo; key omitted\n";
								}

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}
								
								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] diffusion_sql::map_locator_to_section_tipo\n";
								break;

							}


							// 3 "data_to_be_used" alone. It can be set as is_publicabe or not
							if($data_to_be_used && $data_to_be_used === "dato"){
								
								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_v6_section_id',
									]								
								];

								$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props->process->parser = $parser_process;
									$new_props->process->output_sample = ["1","55"];

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";							
								break;
								
							}

							break;
						case 'component_autocomplete':

							// "process_dato" = "diffusion_sql::resolve_value" with a TARGET component.
							// v6 hops from this relation to target_component_tipo and applies that
							// component's own method to it, so the published value belongs to the
							// TARGET, not to the relation. Without the hop in the ddo_map the chain
							// resolved the relation's own section_id instead:
							// ref_publications_typology published ["106"] (the portal row) against
							// v6's ["1"] (the typology the row points at) on 316 cells.
							$rv_args_ac = $props->process_dato_arguments ?? null;
							$rv_target_ac = $rv_args_ac->target_component_tipo ?? null;
							if(($props->process_dato ?? null) === 'diffusion_sql::resolve_value'
								&& !empty($rv_target_ac)
								&& ($rv_args_ac->component_method ?? null) === 'get_diffusion_dato'){

								$rv_target_ac = trim($rv_target_ac);
								$rv_ddo_map_ac = [
									(object)['tipo' => $rel_info['tipo'], 'section_tipo' => 'self'],
									(object)['tipo' => $rv_target_ac, 'parent' => $rel_info['tipo']]
								];

								$new_props = new stdClass();
								$new_props->process = get_diffusion_dato(
									ontology_node::get_legacy_model_by_tipo($rv_target_ac),
									null,
									$rv_args_ac,
									null,
									$rv_ddo_map_ac
								);

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }
								if(isset($props->info)){ $new_props->info = $props->info; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] resolve_value + get_diffusion_dato -> hop to {$rv_target_ac}\n";
								break;
							}

							$is_empty = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							// 0 emtpy propiedades
							if($is_empty($props)) {

								$fields_separator = $props->source->divisor ?? ' ';
								$records_separator = ' | ';

								$ddo_map = [
									(object)[
										'tipo'         => $rel_info['tipo'] ?? $tipo,
										'section_tipo' => 'self'
									]
								];
								
								$ontology_node = ontology_node::get_instance($rel_info['tipo'] );
								$properties = $ontology_node->get_properties();

								$show = $properties->source->request_config[0]->show ?? null;
								if(!empty($show)) {
									$deep_ddo = [];
									foreach ($show->ddo_map as $ddo) {
										$model = ontology_node::get_model_by_tipo($ddo->tipo);
										if($model === 'component_dataframe'){
											continue;
										}
										if($ddo->parent === 'self') {
											$ddo->parent = $rel_info['tipo'];
										}
										$deep_ddo[] = $ddo;
									}

									$letter_ids = [];
									foreach ($deep_ddo as $i => $ddo) {					

										$children = array_find($deep_ddo, fn($ddo) => $ddo->parent === $ddo->tipo);

										if(empty($children)) {

											$letter_id = chr(ord('a') + $i);
											$letter_ids[] = $letter_id;

											$ddo_map[] = (object)[
												'id' => $letter_id,
												'tipo' => $ddo->tipo,
												'parent' => $ddo->parent
											];
										}else{
											$ddo_map[] = (object)[
												'tipo' => $ddo->tipo,
												'parent' => $ddo->parent
											];

										}
									}
								}else{		

									$related_component = ontology_node::get_ar_tipo_by_model_and_relation($rel_info['tipo'], 'component_','related', false);
									$related_section = ontology_node::get_ar_tipo_by_model_and_relation($rel_info['tipo'], 'section','related', true);

									if (!empty($related_section)) {
										$letter_ids = [];
										foreach ($related_component as $i => $component_tipo) {
											$letter_id = chr(ord('a') + $i);
											$letter_ids[] = $letter_id;
											$ddo_map[] = (object)[
												'id' => $letter_id,
												'tipo' => $component_tipo,
												'parent' => $rel_info['tipo'],
												'section_tipo' => $related_section[0]
											]; 
										}
									}
								}

								$parser_process = (object)[					
									'parser' => [
										(object)[
											'fn' => 'parser_text::text_format',
											'options' => (object)[
												'pattern' => implode($records_separator, array_map(fn($l) => '${' . $l . '}', $letter_ids))
											]
										]
									],
									"output_format" => "string"
								];

								$new_props = new stdClass();
									$new_props->process = $parser_process;
									if ($ddo_map !== []) $new_props->process->ddo_map = $ddo_map;
									$new_props->process->output_sample = "Goméz Pérez, Raspa";

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
								break;
							}

							// with propiedades
							$value								= 'term'; // What to extract: "term" (default), "term_id", "section_id", "typology", "typology_section_id".
							$include_parents					= true; // If true, include all parents in the chain. Default: true.
							$include_self						= true; // If true, include the item itself (index 0). Default: true.
							$records_separator					= ', '; // Separator between different parent chains. Default: ", ". Set to false for array output.
							$fields_separator					= ' - '; // Separator between values in the same chain. Default: "								// ".
							$parents_splice						= []; // Array of two integers [start, deleteCount] to splice the parent chain. Default: [].
							$parent_end_by_term_id				= []; // Array of term_ids to truncate the parent chain at. Default: [].
							$parent_section_tipo				= []; // Array section_tipo to keep to Default: [].
							$parent_end_by_typology_term_id		= []; // Array 
							$merge								= null; // Define the way to merger the parents. nested | flat | pipe Default: null.

							// 1 "option_obj" first level
							$option_obj = isset($props->option_obj) ? $props->option_obj : null;
							if($option_obj) {								
								
								$process_dato_arguments = $props->process_dato_arguments ?? null;
								$custom_arguments       = $process_dato_arguments->custom_arguments ?? null;
								$output                 = $process_dato_arguments->output ?? null;
								$data_to_be_used        = $props->data_to_be_used ?? null;
								$ddo_map = [
									(object)[
										'tipo'         => $rel_info['tipo'] ?? $tipo,
										'section_tipo' => 'self'
									]
								];

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$tipo,
									'component_autocomplete_hi',
									$custom_arguments,
									$process_dato_arguments,
									$output,
									$data_to_be_used,
									$option_obj,
									$ddo_map
								);

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
								break;
							}

							// 2 "process_dato" first level
							$process_dato = isset($props->process_dato) ? $props->process_dato : null;

							// 2.1 "process_dato" = "diffusion_sql::map_locator_to_terminoID"
							if( $process_dato 
								&& $process_dato=== "diffusion_sql::map_locator_to_terminoID"
								|| $process_dato === 'diffusion_sql::map_locator_to_term_id'){

								$process_dato_arguments = $props->process_dato_arguments ?? null;
								$add_parents = $process_dato_arguments->custom_arguments->add_parents ?? null;
								$use_parent = $process_dato_arguments->use_parent ?? null;

								// 2.1.1 "add_parents" = true (implicit "use_parent" = true)
								if(isset($process_dato_arguments) && isset($add_parents) && $add_parents === true){
									$divisor = $process_dato_arguments;

									$parser_options = new stdClass();
									$parser_options->value = "term_id";
									// merge:'unique' is REQUIRED whenever parser_locator::parents feeds a json column.
									// The oracle (v7_php_frozen diffusion/api/v1/lib/parsers/parser_locator.ts parents
									// :598-612) branches on merge_style: 'unique' flatMaps the ancestor chain into the
									// ARRAY of individual values v6 published, while the DEFAULT joins the chain into one
									// string with records_separator. Same parser, same chain — the option alone decides
									// array vs string. Without it informant.birthplace_id_full published
									// 'es1_3410, es1_8817, …' where v6 had ["es1_3410","es1_8817",…] (1272 cells).
									$parser_options->merge = 'unique';
									$parser_options->include_parents = true;

									$parser_process = (object)[											
										'fn' => 'add_parents',
										'parser' => [
											(object)[
												'fn' => 'parser_locator::parents',
												'options' => $parser_options
											]
										],
										"output_format" => "json"
									];

									$new_props = new stdClass();
										$new_props->process = new stdClass();
										$new_props = new stdClass();
										$new_props->process = $parser_process;
										$new_props->process->output_sample = ["es1_1257","es1_8844","es1_8864","es1_1","fr1_3","fr1_36686","fr1_37027","fr1_37147","fr1_1"];

									// "is_publicable" = true
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}

									// "varchar" = 256
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}
									
									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] diffusion_sql::map_locator_to_terminoID\n";
									break;
								}

								// 2.1.2 "use_parent" = true "add_parents" = false
								if(isset($process_dato_arguments) && isset($use_parent) && $use_parent === true && isset($add_parents) && $add_parents === false){
									$divisor = $process_dato_arguments;

									$parser_options = new stdClass();
									$parser_options->value 			= "term_id";
									// merge:'unique' is REQUIRED whenever parser_locator::parents feeds a json column.
									// The oracle (v7_php_frozen diffusion/api/v1/lib/parsers/parser_locator.ts parents
									// :598-612) branches on merge_style: 'unique' flatMaps the ancestor chain into the
									// ARRAY of individual values v6 published, while the DEFAULT joins the chain into one
									// string with records_separator. Same parser, same chain — the option alone decides
									// array vs string. Without it informant.birthplace_id_full published
									// 'es1_3410, es1_8817, …' where v6 had ["es1_3410","es1_8817",…] (1272 cells).
									$parser_options->merge = 'unique';
									$parser_options->parents_splice = [2];
									$parser_options->include_self   = false;

									$parser_process = (object)[							
										'fn' => 'add_parents',
										'parser' => [
											(object)[
												'fn' => 'parser_locator::parents',
													'options' => $parser_options
												]
											],
											"output_format" => "json"
										];

									$new_props = new stdClass();
										$new_props->process = new stdClass();
										$new_props = new stdClass();
										$new_props->process = $parser_process;
										$new_props->process->output_sample = ["es1_8844","fr1_36686"];

									// "is_publicable" = true
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}

									// "varchar" = 256
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}
									
									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] diffusion_sql::map_locator_to_terminoID\n";
									break;
								}

								// 2.1.3 "add_parents" = false or not defined
								$parser_options = new stdClass();

								$parser_process = (object)[					
									'parser' => [
										(object)[
											'fn' => 'parser_locator::get_term_id'
										]
									],
									"output_format" => "json"
								];
								$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props = new stdClass();
									$new_props->process = $parser_process;
									// Resolve the parent relation component so the chain fetches its diffusion
									// data (incl. the hierarchy1 root fallback for top-level thesaurus terms).
									$ddo_parent_rp = (object)['tipo' => $rel_info['tipo'], 'section_tipo' => 'self'];
								// add_parents (thesaurus 'parents' field): resolve the FULL ancestor chain
								// recursively (v6 get_parents_recursive) instead of just the direct parent.
								$add_parents_rp = $props->process_dato_arguments->custom_arguments->add_parents
									?? $props->process_dato_arguments->add_parents ?? false;
								if ($add_parents_rp === true) {
									// Canonical ancestor-chain pattern: process-level add_parents (chain → meta)
									// + parser_locator::parents (shapes it), mirroring the parents_term column.
									// Replaces the removed per-ddo get_diffusion_data_recursive fn.
									$new_props->process = diffusion_build_add_parents_process('term_id');
								} else {
									$new_props->process->ddo_map = [ $ddo_parent_rp ];
								}
									$new_props->process->output_sample = ["es1_1257","fr1_3"];

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] diffusion_sql::map_locator_to_terminoID\n";
								break;


							}

							// 2.2 "process_dato" = "diffusion_sql::count_data_elements"
							if($process_dato && $process_dato=== "diffusion_sql::count_data_elements"){

								$parser_process = (object)[									
									'parser' => [
										(object)[
											'fn' => 'parser_helper::count'
										]
									],
									"output_format" => "int"
								];

								$new_props = new stdClass();
									$new_props->process = $parser_process;
									$new_props->process->output_sample = 2;
									// v6 count_data_elements returns (int)count($dato) — 0, never NULL, when
									// the component holds nothing (class.diffusion_sql.php :4392-4416). Same
									// empty-value contract as map_quality_to_int: publications.authors_count
									// published NULL against v6's 0 on 164 cells.
									$new_props->process->default_value = 0;
									// parser_helper::count counts the resolved data items, so it needs a
									// ddo_map that resolves the field's relation locators (e.g. authors
									// rsc139) — without it there is nothing to count and the column is 0.
									if(!empty($rel_info['tipo'])){
										$new_props->process->ddo_map = [ (object)['tipo' => $rel_info['tipo'], 'section_tipo' => 'self'] ];
									}

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] diffusion_sql::count_data_elements\n";
								break;

							}

							// 2.3 "process_dato" = "diffusion_sql::resolve_component_value"
							if($process_dato && $process_dato=== "diffusion_sql::resolve_component_value"){

								$process_dato_arguments = $props->process_dato_arguments;
								$component_method = $process_dato_arguments->component_method ?? null;

								$custom_arguments = $process_dato_arguments->custom_arguments[0] ?? new stdClass();
								$custom_parents = $custom_arguments->custom_parents ?? null;

								$select_model = $custom_parents->select_model ?? null;
								$parents_slice = $custom_parents->slice ?? null;
								$parent_end_by_model = $custom_parents->parent_end_by_model ?? null;

								$parser_options = new stdClass();
								if(isset($props->value_to_extract)){
									$parser_options->value =($component_method==="get_diffusion_value") ? "term" : "term_id" ;
								}
								if(isset($select_model)){
									$parser_options->parent_typology_term_id = $select_model;
								}
								if(isset($parents_slice)){
									$parser_options->parents_slice = $parents_slice;
								}
		
								if(isset($parent_end_by_model)){
									$parser_options->parent_end_by_typology_term_id = $parent_end_by_model;
								}								

								$parser_process = (object)[
									'fn' => 'add_parents',
									'parser' => [
										(object)[
											'fn' => 'parser_locator::parents',
												'options' => $parser_options
											]
										],
									'output_format' => 'string'							
								];
								$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props = new stdClass();
									$new_props->process = $parser_process;
									$new_props->process->output_sample = "Bilbao";

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
								break;
							}

							// 2.4 "process_dato" = "diffusion_sql::resolve_value"
							if($process_dato && $process_dato=== "diffusion_sql::resolve_value"){

								// direct properties
								$process_dato_arguments = $props->process_dato_arguments ?? null;
								$component_method = $process_dato_arguments->component_method ?? 'get_diffusion_value';
								$target_component_tipo = trim($process_dato_arguments->target_component_tipo ?? "");
								$output = $process_dato_arguments->output ?? null;
								$custom_arguments = $process_dato_arguments->custom_arguments[0] ?? null;
								$is_publicable = $process_dato_arguments->is_publicable ?? null;
								
								$ddo_map = [
									(object)[
										'tipo'         => $rel_info['tipo'],
										'section_tipo' => 'self'
									],
									(object)[
										'tipo'         => $target_component_tipo,
										'label'        => 'Term',
										'parent'       => $rel_info['tipo']
									]
								];

								//2.4.1 "component_method" = "get_diffusion_dato"
								if($component_method === "get_diffusion_dato" && !isset($custom_arguments)){

									$model = ontology_node::get_legacy_model_by_tipo($target_component_tipo);
									$new_props = new stdClass(); $new_props->process = get_diffusion_dato(										
										$model,
										$custom_arguments,
										$process_dato_arguments,
										$output										
									);

									// "is_publicable" = true
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}

									// "varchar" = 256
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}

									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
									break;
								}

								// 2.4.2  "component_method" = "get_diffusion_value"
								if($component_method === "get_diffusion_value"){	
									
									$model = ontology_node::get_legacy_model_by_tipo($target_component_tipo);

									$new_props = new stdClass(); $new_props->process = get_diffusion_value(
										$target_component_tipo,
										$model,
										$custom_arguments,
										$process_dato_arguments,
										$output,
										$data_to_be_used,
										$option_obj,
										$ddo_map
									);

									if($model === 'component_input_text'){
										$new_props->process->ddo_map = $ddo_map;
									}

									// "is_publicable" = true
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}

									if(isset($output) && $output === 'merged'){
										// v6 output:'merged' ALWAYS publishes a JSON ARRAY — resolve_value
										// flattens every locator's value into one list, and even a SINGLE
										// locator is emitted wrapped: verified against the v6 publication,
										// where a one-image record reads ["…rsc29_rsc170_884.jpg"], not a
										// bare string. The flattening is a property of `output:merged`,
										// NOT of the target model, so gating the merge parser on
										// component_input_text was wrong: an image/media target (dd1253
										// -> rsc29) got output_format json with nothing to aggregate, so
										// the engine's leaf-column path kept only the LAST locator and
										// published it unwrapped (games.other_images_resolved, 100 cells).
										$parser_process = (object)[
											'fn' => 'parser_helper::merge'
										];
										$new_props->process->parser[] = $parser_process;

										$new_props->process->output_format = 'json';
									}

									// "varchar" = 256
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}

									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] diffusion_sql::resolve_value with get_diffusion_value\n";
									break;
								}

								// 2.4.4 "component_method" = "get_dato"
								if($component_method === "get_dato"){

									$model = ontology_node::get_legacy_model_by_tipo($target_component_tipo);

									$output_options = $process_dato_arguments->output_options ?? null;
									$new_props = new stdClass(); $new_props->process = get_dato(
										$model,
										$custom_arguments,
										$output,
										$output_options,
										$ddo_map
									);

									// "is_publicable" = true
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}

									// "varchar" = 256
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}

									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
									break;
									
								}
							

								// 2.4.6 "component_method" = "get_diffusion_resolve_value" && isset($custom_arguments)
								// second deep component
								if($component_method === "get_diffusion_resolve_value" && isset($custom_arguments)){

									$process_dato_arguments_2 = $custom_arguments->process_dato_arguments;
										$component_method_2 = $process_dato_arguments_2->component_method;
										$target_component_tipo_2 = $process_dato_arguments_2->target_component_tipo;
										$output_2 = $process_dato_arguments_2->output ?? null;
										$output_options_2 = $process_dato_arguments_2->output_options ?? null;
											// $date_format_2 = $output_options_2->date_format;
											// $selected_key_2 = $output_options_2->selected_key;
											// $selected_date_2 = $output_options_2->selected_date;
										$empty_value_2 = $process_dato_arguments_2->empty_value ?? null;
										$is_publicable_2 = $process_dato_arguments_2->is_publicable ?? null;
										$process_dato_2 = $process_dato_arguments_2->process_dato ?? null;
										$fallback_2 = $process_dato_arguments_2->fallback ?? null;
											// $tipo_2 = $fallback_2->tipo;
											// $method_2 = $fallback_2->method;
										$target_component_properties_2 = $process_dato_arguments_2->target_component_properties ?? null;
											// $separator_rows_2 = $target_component_properties_2->separator_rows ?? null;
											$data_to_be_used_2 = $target_component_properties_2->data_to_be_used ?? null;
											// $separator_fields_2 = $target_component_properties_2->separator_fields ?? null;
										$divisor_2 = $process_dato_arguments_2->divisor ?? null;
										
										$process_dato_arguments_3 = $process_dato_arguments_2->process_dato_arguments ?? null;
											// $dato_3 = $process_dato_arguments_3->dato;
											// $options_3 = $process_dato_arguments_3->options;
										
										$custom_parents_2 = $process_dato_arguments_2->custom_parents ?? null;

										$custom_arguments_2 = $process_dato_arguments_2->custom_arguments ?? null;


										$ddo_map2 = [
											(object)[
												'tipo'         => $rel_info['tipo'],
												'section_tipo' => 'self'
											],
											(object)[
												'tipo'         => $target_component_tipo,							
												'parent'       => $rel_info['tipo']
											],
											(object)[
												'tipo'         => $target_component_tipo_2,
												'parent'       => $target_component_tipo
											]
										];


									// 2.4.6.1 "component_method" = "get_diffusion_value"
									if($component_method_2 === "get_diffusion_value" && !isset($custom_arguments_2)){

										$model = ontology_node::get_legacy_model_by_tipo($target_component_tipo_2);

										$new_props = new stdClass(); $new_props->process = get_diffusion_value(
											$target_component_tipo_2,
											$model,
											$custom_arguments_2,
											$process_dato_arguments_2,
											$output_2,
											$data_to_be_used_2,
											$option_obj,
											$ddo_map2
										);

										// "is_publicable" = true
										if(isset($props->is_publicable) && $props->is_publicable === true){
											$new_props->is_publishable = $props->is_publicable;
										}

										// "varchar" = 256
										if(isset($props->varchar)){
											$new_props->varchar = $props->varchar;
										}

										echo "{$indent}- [$tipo] $model_name\n";
										echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
										break;
										
									}
									// 2.5 "component_method" = "get_diffusion_resolve_value" && isset($custom_arguments)
									// second deep component
									if($component_method_2 === "get_diffusion_resolve_value" && isset($custom_arguments_2)){

										$first_custom_arg_2 = is_array($custom_arguments_2) ? ($custom_arguments_2[0] ?? null) : $custom_arguments_2;
										$process_dato_arguments_3 = $first_custom_arg_2->process_dato_arguments ?? null;
										if ($process_dato_arguments_3) {
											$component_method_3 = $process_dato_arguments_3->component_method ?? null;
											$target_component_tipo_3 = $process_dato_arguments_3->target_component_tipo ?? null;
											$output_3 = $process_dato_arguments_3->output ?? null;
											$output_options_3 = $process_dato_arguments_3->output_options ?? null;

											$empty_value_3 = $process_dato_arguments_3->empty_value ?? null;
											$is_publicable_3 = $process_dato_arguments_3->is_publicable ?? null;
											$process_dato_3 = $process_dato_arguments_3->process_dato ?? null;
											$fallback_3 = $process_dato_arguments_3->fallback ?? null;
											$target_component_properties_3 = $process_dato_arguments_3->target_component_properties ?? null;
											$data_to_be_used_3 = $target_component_properties_3->data_to_be_used ?? null;
											$divisor_3 = $process_dato_arguments_3->divisor ?? null;
											
											$process_dato_arguments_4 = $process_dato_arguments_3->process_dato_arguments ?? null;
											
											$custom_parents_3 = $process_dato_arguments_3->custom_parents ?? null;

											$custom_arguments_3 = $process_dato_arguments_3->custom_arguments ?? null;


											$ddo_map3 = [
												(object)[
													'tipo'         => $rel_info['tipo'],
													'section_tipo' => 'self'
												],
												(object)[
													'tipo'         => $target_component_tipo,							
													'parent'       => $rel_info['tipo']
												],
												(object)[
													'tipo'         => $target_component_tipo_2,
													'parent'       => $target_component_tipo
												],
												(object)[
													'tipo'         => $target_component_tipo_3,
													'parent'       => $target_component_tipo_2
												]
											];


										// 2.5.1 "component_method" = "get_diffusion_value"
										if($component_method_3 === "get_diffusion_value" && !isset($custom_arguments_3)){

											$model = ontology_node::get_legacy_model_by_tipo($target_component_tipo_3);

											$new_props = new stdClass(); $new_props->process = get_diffusion_value(
												$target_component_tipo_3,
												$model,
												$custom_arguments_3,
												$process_dato_arguments_3,
												$output_3,
												$data_to_be_used_3,
												$option_obj,
												$ddo_map3
											);

											// ATTACH THE MAP THE CALLEE DROPPED. get_diffusion_value's
											// component_input_text case returns ONLY the parser and leaves the
											// ddo_map to its caller by design (v1_get_diffusion_value.php
											// :220-224, so the chain is not resolved twice). This caller built
											// $ddo_map3 — the full 3-hop chain — and then never attached it, so
											// the field resolved NOTHING: its merge parser ran over an empty
											// slot set and published bare separators where v6 publishes the
											// resolved value (bibliographic_references
											// .ref_publications_other_people_role: " | " against v6's "dir").
											if (!isset($new_props->process->ddo_map)) {
												$new_props->process->ddo_map = $ddo_map3;
											}

											// "is_publicable" = true
											if(isset($props->is_publicable) && $props->is_publicable === true){
												$new_props->is_publishable = $props->is_publicable;
											}

											// "varchar" = 256
											if(isset($props->varchar)){
												$new_props->varchar = $props->varchar;
											}

											echo "{$indent}- [$tipo] $model_name\n";
											echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
											break;
											
										}
									}
								}
							}

							}
							// 2.5 "process_dato" = "diffusion_sql::resolve_multiple"
							if($process_dato && $process_dato === "diffusion_sql::resolve_multiple"){
								$process_dato_arguments = $props->process_dato_arguments ?? [];
								$separator = $props->separator ?? ' # ';
								
								$ddo_map = [
									(object)[
										'tipo'         => $rel_info['tipo'] ?? $tipo,
										'section_tipo' => 'self'
									]
								];
								
								$multiple_parsers = [];
								
								foreach($process_dato_arguments as $arg_group) {
									$sub_process_dato = $arg_group->process_dato ?? null;
									$sub_args = $arg_group->process_dato_arguments ?? null;
									
									if ($sub_process_dato === 'diffusion_sql::resolve_value' && $sub_args) {
										$target_tipo = trim($sub_args->target_component_tipo ?? "");
										$model = ontology_node::get_legacy_model_by_tipo($target_tipo);
										
										$target_props = $sub_args->target_component_properties ?? null;
										$sub_option_obj = $target_props->option_obj ?? null;
										
										$ddo_map[] = (object)[
											'tipo'         => $target_tipo,
											'label'        => 'Term',
											'parent'       => $rel_info['tipo'] ?? $tipo
										];
										
										// DISPATCH ON component_method, as the outer branches do. Every
										// sub-entry was being sent through get_diffusion_value(), so an
										// entry declaring get_dato (e.g. a component_date published as
										// output:'split_date_range' + date_format:'year') returned no
										// ->process at all, $multiple_parsers stayed EMPTY, and the field
										// migrated with "parser": []. The raw date object then reached the
										// column and was String()-coerced: bibliographic_references
										// .ref_publications_date/_date_end/_url all published
										// '[object Object]' (844 cells) instead of '1958'.
										$sub_method = $sub_args->component_method ?? 'get_diffusion_value';
										if ($sub_method === 'get_dato') {
											$sub_resolved = get_dato(
												$model,
												$sub_args->custom_arguments ?? null,
												$sub_args->output ?? null,
												$sub_args->output_options ?? null,
												$ddo_map
											);
										} elseif ($sub_method === 'get_diffusion_dato') {
											$sub_resolved = get_diffusion_dato(
												$model,
												$sub_args->custom_arguments ?? null,
												$sub_args,
												$sub_args->output ?? null,
												$ddo_map
											);
										} else {
										$sub_resolved = get_diffusion_value(
											$target_tipo,
											$model,
											null, // custom_arguments
											$sub_args,
											null, // output
											null, // data_to_be_used
											$sub_option_obj,
											$ddo_map
										);
										
										}

										// FLATTEN into the field's single parser chain. v7 validates every
										// entry of `parser` as a {fn:'class::method', options} step, so a
										// nested process object is a hard compile error ("parser step
										// without a 'class::method' fn") that fails the WHOLE element.
										// get_dato/get_diffusion_dato return the process itself; the
										// get_diffusion_value family wraps it under ->process.
										$sub_process = $sub_resolved->process ?? $sub_resolved ?? null;
										// `parser` is an ARRAY of steps in most trait paths but a SINGLE step
										// object in several others (e.g. the get_v6_section_id shapes), so
										// both forms are accepted. DEFENSIVE ONLY — measured against mht2 it
										// changed nothing, so it is not the reason the get_diffusion_value
										// sub-entries of ref_publications_authors still yield "parser": [].
										$sub_steps = $sub_process->parser ?? null;
										if (is_object($sub_steps)) {
											$sub_steps = [$sub_steps];
										}
										if (is_array($sub_steps)) {
											foreach ($sub_steps as $sub_step) {
												if (isset($sub_step->fn)) {
													$multiple_parsers[] = $sub_step;
												}
											}
										}

										// MERGE THE SUB-PROCESS'S OWN ddo_map. Its parser steps address ddos
										// by letter id (pattern "${a}, ${b}"), and those ids live in the ddos
										// the trait built — rsc86/rsc85 under the target. Flattening only the
										// parser left the pattern pointing at ids the field's ddo_map did not
										// contain, so ref_publications_authors resolved to nothing even with a
										// correct-looking chain. Entries already present (same tipo+parent+id)
										// are not duplicated.
										$sub_ddos = $sub_process->ddo_map ?? null;
										if (is_array($sub_ddos)) {
											foreach ($sub_ddos as $sub_ddo) {
												if (!isset($sub_ddo->tipo)) continue;
												$already = false;
												foreach ($ddo_map as $existing) {
													if (($existing->tipo ?? null) === $sub_ddo->tipo
														&& ($existing->parent ?? null) === ($sub_ddo->parent ?? null)
														&& ($existing->id ?? null) === ($sub_ddo->id ?? null)) {
														$already = true;
														break;
													}
												}
												if (!$already) {
													$ddo_map[] = $sub_ddo;
												}
											}
										}
									}
								}
								
								$parser_process = (object)[
									'fn' => 'parser_helper::merge',
									'options' => (object)[ 'records_separator' => $separator ],
									'parser' => $multiple_parsers,
									'output_format' => 'string'
								];
								
								$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props = new stdClass();
									$new_props->process = $parser_process;
									$new_props->process->ddo_map = $ddo_map;
									$new_props->process->output_sample = "Value 1 # Value 2";

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name";
								echo "{$indent}  [RULE APPLIED] diffusion_sql::resolve_multiple";
								break;
							}

							// 2.6 "diffusion_sql::map_quality_to_int"
							if($process_dato && $process_dato === 'diffusion_sql::map_quality_to_int'
								|| $process_dato === 'diffusion_sql::map_locator_to_int') {

								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_v6_section_id',
									],
									(object)[
										'fn' => 'parser_helper::get_first',
									]
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process->parser = $parser_process;
								$new_props->process->output_format = 'int';
								
								// v6 map_quality_to_int RETURNS 0, NOT NULL, when the component holds no
								// locator ($quality = 0 before the isset test — class.diffusion_sql.php
								// :4635-4641). map_locator_to_int, which shares this branch and this parser
								// chain, returns NULL in the same situation. Identical chain, different empty
								// value: the default belongs ONLY to the quality variant, so it is attached
								// here rather than in the shared process above. Without it image.rating
								// published NULL against v6's 0 on 1220 of 2616 rows.
								if ($process_dato === 'diffusion_sql::map_quality_to_int') {
									$new_props->process->default_value = 0;
								}

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] component_autocomplete map_quality_to_int -> get_diffusion_dato\n";
								break;
							}

							$data_to_be_used = $props->data_to_be_used ?? null;
							// 3 "data_to_be_used" alone. It can be set as is_publicabe or not
							if($data_to_be_used && $data_to_be_used === "dato"){
								
								$parser_process = (object)[
										'fn' => 'parser_locator::get_v6_section_id',
								];

								$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props->process->parser = $parser_process;
									$new_props->process->output_sample = ["1","55"];

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";							
								break;								
							}
							break;
						
						case 'component_select_lang':

							$is_empty_sl = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							// 0 empty propiedades: default V6 behavior → get_diffusion_value() trait
							if($is_empty_sl($props)) {

								$ddo_map_cb = [
									(object)[
										'tipo'         => $rel_info['tipo'],
										'section_tipo' => 'self'
									]
								];

								// component_relation_children (thesaurus "children" field): emit the raw
								// child locators with from_component_tipo + type (v6 format), not the
								// check_box section_id list. Resolve the relation via the ddo_map.
								if (ontology_node::get_model_by_tipo($rel_info['tipo']) === 'component_relation_children') {
									$new_props = new stdClass();
									$new_props->process = (object)[
										'ddo_map' => $ddo_map_cb,
										'parser'  => [
											(object)['fn' => 'parser_locator::get_locator', 'options' => (object)['with_meta' => true]]
										],
										'output_format' => 'json'
									];
									if(isset($props->is_publicable) && $props->is_publicable === true){ $new_props->is_publishable = $props->is_publicable; }
									if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }
									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] component_relation_children -> get_locator (with_meta)\n";
									break;
								}

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_select_lang',
									null,
									null,
									null,
									null,
									null,
									$ddo_map_cb
								);

								// v6 component_select_lang publishes the language NAME resolved in
								// DEDALO_DATA_LANG for EVERY published row, not in the row's own
								// language: get_valor() takes a $lang argument but never uses it for
								// the name — it resolves through
								// common::get_ar_all_langs_resolved(DEDALO_DATA_LANG), with the
								// lang-aware call left commented out
								// (class.component_select_lang.php:48-49). So interview.primary_lang
								// reads 'Castellano' in the es, en, fr … rows alike, while v7 resolved
								// the term per row lang and published 'Spanish'/'Espagnol'/…
								// Pin the leaf term ddo to the data lang to reproduce it.
								$parents_sl = [];
								foreach ((array)($new_props->process->ddo_map ?? []) as $ddo_sl) {
									if (isset($ddo_sl->parent)) { $parents_sl[$ddo_sl->parent] = true; }
								}
								foreach ((array)($new_props->process->ddo_map ?? []) as $ddo_sl) {
									if (!isset($parents_sl[$ddo_sl->tipo ?? ''])) {
										$ddo_sl->lang = DEDALO_DATA_LANG;
									}
								}

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] component_select_lang (empty props) → get_diffusion_value\n";
								break;
							}

							// 1 "data_to_be_used" = "dato"
							$data_to_be_used_cb = $props->data_to_be_used ?? null;
							if($data_to_be_used_cb && $data_to_be_used_cb === 'dato') {

								$new_props = new stdClass(); $new_props->process = get_diffusion_dato(
									'component_select_lang',
									null,
									null,
									null
								);

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] component_select_lang data_to_be_used=dato -> get_dato()\n";
								break;
							}
							
							// 2 "process_dato" = "diffusion_sql::resolve_component_value"
							$process_dato = $props->process_dato ?? null;
							if($process_dato && $process_dato=== "diffusion_sql::resolve_component_value"){

								$process_dato_arguments = $props->process_dato_arguments;
								$component_method = $process_dato_arguments->component_method ?? null;

								if($component_method === 'get_value_code'){

									// The code component of the hop's OWN section (v6 hardcoded hierarchy41,
									// the code of the lg1 langs thesaurus). Derived from the ontology, with
									// the overrides.json value as an announced [FALLBACK].
									$code_component_tipo = migrate_diffusion_derive_code_component($rel_info['tipo'] ?? null, $tipo, $indent);

									// A null tipo must NEVER reach the ddo_map: {"tipo":null} round-trips
									// through save_node() as a clean [TEST PASS] and the published column
									// silently becomes 'lg-' instead of 'lg-cat'. Nothing is written and the
									// node is counted as a failure (precedent: output_sample below, which
									// omits the key rather than write a wrong value).
									if (empty($code_component_tipo)) {
										echo "{$indent}- [$tipo] $model_name\n";
										echo "{$indent}  [TEST FAIL] get_value_code: no code component for "
											. ($rel_info['tipo'] ?? '?') . "; properties NOT written\n";
										$GLOBALS['migrate_diffusion_failures'] = (int)($GLOBALS['migrate_diffusion_failures'] ?? 0) + 1;
										return;
									}

									$ddo_map_sl = [
										(object)[
											'tipo'         => $rel_info['tipo'] ?? $tipo,
											'section_tipo' => 'self'
										],
										(object)[
											'id'		=> 'a',
											'tipo'		=> $code_component_tipo,
											'label'		=> 'code',
											'parent'	=> $rel_info['tipo'],
										]
									];
									
									$parser_process = (object)[					
										'parser' => [
											(object)[
												'fn' => 'parser_text::text_format',
												'options' => (object)[
													'pattern' => 'lg-${a}'
												]
											]
										],
										"output_format" => "string"
									];

									$new_props = new stdClass();
										$new_props->process = $parser_process;
										$new_props->process->ddo_map = $ddo_map_sl;
										$new_props->process->output_sample = "lg-cat";

										// "is_publicable" = true
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}

									// "varchar" = 256
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}

									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] component_select_lang data_to_be_used=dato -> get_dato()\n";
									break;
								}
							}
							break;
						case 'component_portal':

							$is_empty_cp = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							// 0 empty propiedades: default V6 behavior → get_diffusion_value() trait
							if($is_empty_cp($props)) {

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_portal',
									null, null, null, null, null, null
								);

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] portal empty props -> get_diffusion_value\n";
								break;
							}

							$data_to_be_used_cp = $props->data_to_be_used ?? null;

							// 1 "data_to_be_used" cases without process_dato
							$process_dato_cp = $props->process_dato ?? null;
							if(!$process_dato_cp && $data_to_be_used_cp) {
								if ($data_to_be_used_cp === 'value' || $data_to_be_used_cp === 'valor') {
									$new_props = new stdClass(); $new_props->process = get_diffusion_value(
										$rel_info['tipo'],
										'component_portal',
										null, null, null, $data_to_be_used_cp, null, null
									);
									
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}
									if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] portal data_to_be_used={$data_to_be_used_cp} -> get_diffusion_value\n";
									break;
								}
								
								if ($data_to_be_used_cp === 'dato') {
									$new_props = new stdClass(); $new_props->process = get_diffusion_dato('component_portal', null, null, null);
									
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}
									if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] portal data_to_be_used=dato -> get_diffusion_dato\n";
								break;
								}
							}

							// 2 "process_dato" present
							
							// 2.1 "diffusion_sql::map_locator_to_term_id" (or legacy alias)
							if($process_dato_cp
								&& ($process_dato_cp === 'diffusion_sql::map_locator_to_term_id'
									|| $process_dato_cp === 'diffusion_sql::map_locator_to_terminoID'))
							{
								$new_props = new stdClass(); $new_props->process = get_diffusion_dato('component_portal', null, null, null);

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								// v6 map_locator_to_terminoID does NOT check publishability unless the
								// node asks for it: $check_publishable defaults to FALSE
								// (class.diffusion_sql.php :3646-3647, read from process_dato_arguments
								// ->check_publishable ?? custom_arguments->check_publishable). v7 skips
								// unpublishable locators for a hop with no children, so informant
								// .birthplace_id published NULL where v6 emitted ["es1_8906"] — the
								// target place record carries no publication component at all.
								// is_publishable is v7's per-locator publication-check override.
								$args_cp_pub = $props->process_dato_arguments ?? new stdClass();
								$check_publishable_cp = $args_cp_pub->check_publishable
									?? $args_cp_pub->custom_arguments->check_publishable
									?? false;
								if ($check_publishable_cp !== true) {
									$new_props->is_publishable = true;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] portal map_locator_to_term_id -> get_diffusion_dato\n";
								break;
							}

							// 2.2 "diffusion_sql::map_quality_to_int"
							if($process_dato_cp && $process_dato_cp === 'diffusion_sql::map_quality_to_int') {

								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_v6_section_id',
									],
									(object)[
										'fn' => 'parser_helper::get_first',
									]
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process->parser = $parser_process;
								$new_props->process->output_format = 'int';
								
								// v6 map_quality_to_int RETURNS 0, NOT NULL, when the component holds no locator
								// ($quality = 0 before the isset test — class.diffusion_sql.php :4635-4641).
								// map_locator_to_int, which shares this branch and this parser chain, returns
								// NULL in the same situation. Identical chain, different empty value, so the
								// default belongs ONLY to the quality variant.
								if ($process_dato_cp === 'diffusion_sql::map_quality_to_int') {
									$new_props->process->default_value = 0;
								}

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] portal map_quality_to_int -> get_diffusion_dato\n";
								break;
							}

							// 2.3 "diffusion_sql::resolve_value" -> deep nested ddo_map building
							if($process_dato_cp && $process_dato_cp === 'diffusion_sql::resolve_value') {
								
								$ddo_map_cp = [
									(object)[
										'tipo'         => $rel_info['tipo'],
										'section_tipo' => 'self'
									]
								];
								
								$output_options_cp = new stdClass();
								$final_method_cp = null;
								$parent_tipo = $rel_info['tipo'];
								$args_node = $props->process_dato_arguments;
								$custom_parents_config = null;
								$final_target = null;
								$final_args = null;
								$is_publicable_cp = $props->process_dato_arguments->is_publicable ?? null;
								$check_general_merge = $args_node->output ?? null;
								$final_target_component_properties = null;

								while($args_node) {
									$method = $args_node->component_method ?? null;
									$target = trim($args_node->target_component_tipo ?? "");
									
									if($target) {
										$ddo_map_cp[] = (object)['tipo' => $target, 'parent' => $parent_tipo];
										$parent_tipo = $target;
										$final_target = $target;
									}
									
									if(isset($args_node->split_string_value)) {
										$output_options_cp->records_separator = $args_node->split_string_value;
									}

									if(isset($args_node->target_component_properties)) {
										$final_target_component_properties= $args_node->target_component_properties;
									}
									
									$ca = $args_node->custom_arguments[0] ?? null;
									if($ca && isset($ca->custom_parents)) {
										$custom_parents_config = $ca->custom_parents;
									}
									
									if($method === 'get_diffusion_dato' || $method === 'get_diffusion_value' || $method === 'get_diffusion_resolve_value') {
										$final_method_cp = $method;
										$final_args = $args_node;

										if( $method === 'get_diffusion_resolve_value' && isset($args_node->custom_arguments)){
											foreach($args_node->custom_arguments as $current_ca){
												$current_component_tipo = $current_ca->process_dato_arguments->target_component_tipo ?? null;
												$current_compnent_method = $current_ca->process_dato_arguments->component_method ?? null;
												if(isset($current_component_tipo)){
													$target_model = ontology_node::get_model_by_tipo($current_component_tipo);
													if($target_model==='component_date'){
														break;// break the for and continue with the while
													}
													if($current_compnent_method === 'get_diffusion_value' && !in_array($target_model, component_relation_common::get_components_with_relations())) {
														break 2;
													}
												}
											}
										}
																			
									}else if($method === 'get_dato' && isset($args_node->process_dato)){
										$final_method_cp = $args_node->process_dato ?? null;
									}else if($method === 'get_dato' && isset($args_node->output)){
										$final_method_cp = $method;
										$final_args = $args_node;
									}
									
									if($ca && isset($ca->process_dato_arguments)) {
										$args_node = $ca->process_dato_arguments;
									} else if ($ca && isset($ca->process_dato) && $ca->process_dato === 'diffusion_sql::resolve_value') {
										$args_node = $ca->process_dato_arguments ?? null;
									} else {
										break;
									}
								}

								if(empty($final_method_cp)) {
									$new_props = new stdClass();
									$new_props->process = new stdClass();

									$new_props->process->output_format = 'json';
									$new_props->process->output_sample = ["es1_1"];
									$new_props->process->ddo_map = $ddo_map_cp;

									// v6 output:'merged' flattens EVERY resolved locator's value into
									// ONE json array, and wraps even a single value: a one-image games
									// record publishes ["…rsc29_rsc170_884.jpg"], never a bare string.
									// This early-return branch (no component_method in the v6 node, so
									// no $final_method_cp) set output_format json but attached nothing
									// to aggregate with, so the engine's leaf-column path kept only the
									// LAST locator and published it unwrapped — dd1253
									// (games.other_images_resolved) lost the first of two images in
									// every multi-image record. The sibling branches below already
									// honour 'merged'; this one skipped it.
									// EMPTY DECLARED LABEL LIST on the chain's final target. v6 builds
									// an autocomplete/portal label from the component's own legacy
									// related-component list (v5_component_autocomplete.php :46-57); when
									// that list is empty every locator's label is '' and v6 STILL joins
									// them (its empty-skip is commented out :111-119), so three locators
									// publish " |  | " and one publishes '' which resolve_value nulls.
									// v7 resolved the locators and published NULL instead
									// (publications.other_people_full_names).
									$final_ddo_cp = end($ddo_map_cp) ?: null;
									$final_tipo_cp = $final_ddo_cp->tipo ?? null;
									if (!empty($final_tipo_cp)) {
										$final_model_cp = ontology_node::get_model_by_tipo($final_tipo_cp);
										$final_rels_cp  = ontology_node::get_instance($final_tipo_cp)->get_relations();
										if (empty($final_rels_cp)
											&& in_array($final_model_cp, ['component_autocomplete','component_autocomplete_hi','component_portal'], true)) {
											$new_props->process->parser = [
												(object)[
													'fn'      => 'parser_locator::get_locator',
													'options' => (object)['empty_label_join' => true, 'fields_separator' => ' | ']
												]
											];
											$new_props->process->output_format = 'string';
											unset($new_props->process->output_sample);
											echo "{$indent}- [$tipo] $model_name\n";
											echo "{$indent}  [RULE APPLIED] empty label list -> empty_label_join\n";
											break;
										}
									}

									$output_cp_fallback = $final_args->output
										?? $props->process_dato_arguments->output
										?? null;
									if ($output_cp_fallback === 'merged') {
										$new_props->process->parser = [
											(object)['fn' => 'parser_helper::merge']
										];
									}


									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}
									if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] check_box map_locator_to_term_id\n";
									break;
									
								}
								
								if($final_method_cp === 'get_diffusion_dato') {
									$new_props = new stdClass();
									$model_cp = ontology_node::get_legacy_model_by_tipo($final_target);
									$output_v5 = $final_args->output ?? null;

									$new_props->process = get_diffusion_dato(
										$model_cp,
										null,
										$final_args,
										$output_v5,
										$ddo_map_cp
									);

									// v6 get_diffusion_dato preserves the source dataframe-reference
									// grouping: the target section_ids are grouped per reference and
									// emitted as JSON arrays joined by " | " (e.g.
									// `["99927"] | ["128187","133934","99927"]`). Use the grouping
									// parser. EXCEPTION: output "merged" flattens into one union list
									// (e.g. ref_coins_union) — keep the flat get_section_id then.
									if (($output_v5 ?? null) !== 'merged') {
										$new_props->process->parser = [
											(object)['fn' => 'parser_locator::get_section_id_grouped']
										];
										$new_props->process->output_format = 'string';
									}

										// preserve_order: the SAME coin can be referenced more than once (a coin whose
										// obverse AND reverse cite this type -> two numisdata9 entries, same section_id).
										// v6 keeps them in raw reference order; the default group-by-section_id merges them
										// adjacent and reshuffles the grouping. Emit each entry as its own group so
										// ref_coins / ref_coins_union match v6.
										$new_props->process->preserve_order = true;

									if(isset($props->is_publicable) && $props->is_publicable === true) {
										$new_props->is_publishable = $props->is_publicable;
									}
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}

									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] get_diffusion_resolve_value (grouped)\n";
									break;

								} else if($final_method_cp === 'get_diffusion_resolve_value') {
									$separator = $final_args->separator ?? ' ';
									$output_v5 = $final_args->output ?? null;
									$custom_arguments = $final_args->custom_arguments ?? [];
									
									$merge_option = null;
									if ($output_v5 === 'merged') {
										$merge_option = null;
									} else if ($output_v5 === 'merged_group') {
										$merge_option = 'flat';
									} else if ($output_v5 === 'merged_unique') {
										$merge_option = 'unique';
									}
									
									$pattern_parts = [];
									$letters = range('a', 'z');
									
									foreach ($custom_arguments as $index => $arg) {
										$sub_args = $arg->process_dato_arguments ?? null;
										if ($sub_args && isset($sub_args->target_component_tipo)) {
											$sub_target = trim($sub_args->target_component_tipo);
											$letter = $letters[$index] ?? 'z';
											
											$ddo_map_cp[] = (object)[
												'tipo' => $sub_target,
												'parent' => $final_target,
												'id' => $letter
											];
											
											$pattern_parts[] = '${' . $letter . '}';
										}
									}
									
									$parser_pipeline = [];
									$parser_pipeline[] = (object)[
										'fn' => 'parser_text::text_format',
										'options' => (object)[
											'pattern' => implode($separator, $pattern_parts)
										]
									];
									
									if ($merge_option !== null) {
										$parser_pipeline[] = (object)[
											'fn' => 'parser_helper::merge',
											'options' => (object)[
												'merge' => $merge_option
											]
										];
										$output_format = 'json';
									}
									
									$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props->process->parser = $parser_pipeline;
									$new_props->process->ddo_map = $ddo_map_cp;
									// v6 output:'merged' PUBLISHES A JSON ARRAY, not a joined string. The
									// trait states the rule directly (v1_get_diffusion_value.php :112-116:
									// output==='merged' -> output_format 'json'); this hand-rolled branch
									// mapped 'merged' to merge_option null and fell back to 'string', so
									// publications.other_people_surname published
									// 'Alpuente | Lorrio | Luis' against v6's
									// ["Alpuente","Lorrio","Luis"]. The output lives on the CUSTOM
									// sub-argument as often as on the outer args, so both are consulted —
									// and the branch's own output_sample (["Name Surname"]) was already an
									// array, i.e. the format was simply inconsistent with its own sample.
									$merged_output_cp = $output_v5;
									if ($merged_output_cp === null) {
										foreach ($custom_arguments as $custom_argument) {
											$candidate = $custom_argument->process_dato_arguments->output ?? null;
											if ($candidate !== null) { $merged_output_cp = $candidate; break; }
										}
									}
									if ($merged_output_cp === 'merged') {
										$output_format = 'json';
									}

									$new_props->process->output_format = $output_format ?? 'string';
									$new_props->process->output_sample = ["Name Surname"];
									
									if(isset($props->is_publicable) && $props->is_publicable === true) {
										$new_props->is_publishable = $props->is_publicable;
									}
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}
									
									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] get_diffusion_resolve_value\n";
									break;
								} else if($final_method_cp === 'diffusion::map_section_id_to_subtitles_url') {
									
									$new_props = new stdClass();
									$new_props->process = new stdClass();;

									if ($ddo_map_cp !== []) {
										$ddo_map_cp[count($ddo_map_cp) - 1]->fn = 'map_section_id_to_subtitles_url';
									}

									$new_props->process->ddo_map = $ddo_map_cp;
									$new_props->process->output_sample = "/dedalo/publication/server_api/v1/subtitles/?section_id=1&lang=lg-eng";

									// "is_publicable" = true
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}

									// "varchar" = 256
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}
									
									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] diffusion_sql::map_section_id_to_subtitles_url\n";
									break;
								} else if($final_method_cp === 'get_dato'){
									$model_cp = ontology_node::get_legacy_model_by_tipo($final_target);
									$output = $final_args->output ?? null;
									$output_options = $final_args->output_options ?? null;																
									
									$new_props = new stdClass(); $new_props->process = get_dato(										
										$model_cp,
										null,
										null,
										(empty((array)$output_options_cp) ? null : $output_options_cp),
										$ddo_map_cp
									);
									if( isset($check_general_merge) 
										&& ($check_general_merge==='merged'
										|| $check_general_merge==='merged_group'
										|| $check_general_merge==='merged_unique')){
											$new_props->process->output_format = 'json';
									}							
								} else if($final_method_cp === 'get_diffusion_value'
									&& ontology_node::get_legacy_model_by_tipo($final_target) === 'component_autocomplete_hi'
									&& !empty($ddo_map_cp)) {
									// Portal -> scene -> autocomplete_hi NESTED display (e.g. designs iconography).
									// v6 component_autocomplete_hi diffusion is a 3-LEVEL nested join (within term
									// " | ", across terms ", ", across scenes " | ") that a flat ddo_map cannot
									// express. Delegate to component_portal::get_diffusion_iconography which replicates
									// v6 get_locator_value per term. fn lives on the PORTAL (first) ddo; fn_terminal
									// makes the chain return the fn's lang-wrapped value verbatim (no locator iteration).
									$portal_ddo = (object)[
										'tipo'         => $ddo_map_cp[0]->tipo,
										'section_tipo' => 'self',
										'fn'           => 'get_diffusion_iconography',
										'fn_terminal'  => true
									];
									$new_props = new stdClass();
									$new_props->process = (object)[
										'ddo_map'       => [$portal_ddo],
										'output_format' => 'string'
									];
									if(isset($props->is_publicable) && $props->is_publicable === true || $is_publicable_cp === true){
										$new_props->is_publishable = true;
									}
									if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }
									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] portal->autocomplete_hi nested -> get_diffusion_iconography fn\n";
									break;
								} else { // get_diffusion_value or fallback
									$model_cp = ontology_node::get_legacy_model_by_tipo($final_target);

									// Reconstruct add_parents if found in hierarchy
									if($custom_parents_config) {
										$parser_options = new stdClass();
										$parser_options->value = "term";
										if(isset($custom_parents_config->select_model)) {
											$parser_options->parent_typology_term_id = $custom_parents_config->select_model;
										}
										if(isset($custom_parents_config->slice)) {
											$parser_options->parents_slice = $custom_parents_config->slice;
										}
										if(isset($custom_parents_config->parent_end_by_model)) {
											$parser_options->parent_end_by_typology_term_id = $custom_parents_config->parent_end_by_model;
										}
										$output_options_cp->add_parents = $parser_options;
									}

									$output = $final_args->output ?? null;									
									
									$new_props = new stdClass(); 
									$new_props->process = get_diffusion_value(
										$final_target,
										$model_cp,
										null,
										$final_args,
										$output,
										null,
										(empty((array)$output_options_cp) ? null : $output_options_cp),
										$ddo_map_cp,
										$final_target_component_properties
									);									
								}
								
								if(isset($props->is_publicable) && $props->is_publicable === true || $is_publicable_cp === true){
									$new_props->is_publishable = true;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] portal resolve_value nested loop -> {$final_method_cp}\n";
								break;
							}
							break;
						case 'component_check_box':

							$is_empty_cb = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							// 0 empty propiedades: default V6 behavior — delegate to get_diffusion_value() trait
							// The trait builds letter-id ddo_map from related components + parser_text::text_format
							if($is_empty_cb($props)) {

								$ddo_map_cb = [
									(object)[
										'tipo'         => $rel_info['tipo'],
										'section_tipo' => 'self'
									]
								];

								// component_relation_children (thesaurus "children" field): emit the raw
								// child locators with from_component_tipo + type (v6 format), not the
								// check_box section_id list. Resolve the relation via the ddo_map.
								if (ontology_node::get_model_by_tipo($rel_info['tipo']) === 'component_relation_children') {
									$new_props = new stdClass();
									$new_props->process = (object)[
										'ddo_map' => $ddo_map_cb,
										'parser'  => [
											(object)['fn' => 'parser_locator::get_locator', 'options' => (object)['with_meta' => true]]
										],
										'output_format' => 'json'
									];
									if(isset($props->is_publicable) && $props->is_publicable === true){ $new_props->is_publishable = $props->is_publicable; }
									if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }
									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] component_relation_children -> get_locator (with_meta)\n";
									break;
								}

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_check_box',
									null,
									null,
									null,
									null,
									null,
									$ddo_map_cb
								);
								// Ensure the relation component is resolved by the chain so the field
								// gets its diffusion data (e.g. the term's child locators). Without a
								// ddo_map the chain has nothing to resolve and the column is empty.
								$new_props->process->ddo_map = $ddo_map_cb;

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] check_box empty props -> get_diffusion_value (letter-id ddo_map)\n";
								break;
							}

							// 1 "data_to_be_used" = "dato"
							$data_to_be_used_cb = $props->data_to_be_used ?? null;
							if($data_to_be_used_cb && $data_to_be_used_cb === 'dato') {

								$new_props = new stdClass(); $new_props->process = get_diffusion_dato(
									'component_check_box',
									null,
									null,
									null
								);

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] check_box data_to_be_used=dato -> get_dato()\n";
								break;
							}

							// 2 "process_dato" present
							$process_dato_cb = $props->process_dato ?? null;

							// 2.1 "process_dato" = "diffusion_sql::map_locator_to_term_id" (or legacy alias)
							if($process_dato_cb
								&& ($process_dato_cb === 'diffusion_sql::map_locator_to_term_id'
									|| $process_dato_cb === 'diffusion_sql::map_locator_to_terminoID'))
							{
								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_term_id'
									]
								];

								$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props->process->parser = $parser_process;
									$new_props->process->output_format = 'json';
									$new_props->process->output_sample = ["es1_1"];

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] check_box map_locator_to_term_id\n";
								break;
							}

							// 2.2 "process_dato" = "diffusion_sql::map_quality_to_int"
							if($process_dato_cb && $process_dato_cb === 'diffusion_sql::map_quality_to_int') {

								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_v6_section_id',
									],
									(object)[
										'fn' => 'parser_helper::get_first',
									]
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process->parser = $parser_process;
								$new_props->process->output_format = 'int';
								
								// v6 map_quality_to_int RETURNS 0, NOT NULL, when the component holds no locator
								// ($quality = 0 before the isset test — class.diffusion_sql.php :4635-4641).
								// map_locator_to_int, which shares this branch and this parser chain, returns
								// NULL in the same situation. Identical chain, different empty value, so the
								// default belongs ONLY to the quality variant.
								if ($process_dato_cb === 'diffusion_sql::map_quality_to_int') {
									$new_props->process->default_value = 0;
								}

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] check_box map_quality_to_int -> get_diffusion_dato()\n";
								break;
							}

							break;
						case 'component_select':

							$is_empty_cs = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							$ddo_map_cs = [
								(object)[
									'tipo'         => $rel_info['tipo'],
									'section_tipo' => 'self'
								]
							];

							// 0 empty propiedades: default V6 behavior → get_diffusion_value() trait
							if($is_empty_cs($props)) {

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_select',
									null, null, null, null, null,
									$ddo_map_cs
								);

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] select empty props -> get_diffusion_value\n";
								break;
							}

							// 1 "data_to_be_used" = "value"
							$data_to_be_used_cs = $props->data_to_be_used ?? null;
							if($data_to_be_used_cs && $data_to_be_used_cs === 'value') {

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_select',
									null, null, null, null, null,
									$ddo_map_cs
								);

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] select data_to_be_used=value -> get_diffusion_value\n";
								break;
							}

							// 1 data_to_be_used present: default V6 behavior → get_diffusion_dato() trait
							if(isset($data_to_be_used_cs) && $data_to_be_used_cs === 'dato') {

								$new_props = new stdClass(); $new_props->process = get_diffusion_dato(
									'component_select',
									null, null, null
								);

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] select data_to_be_used -> get_diffusion_dato\n";
								break;
							}

							// 2 "process_dato" present
							$process_dato_cs = $props->process_dato ?? null;

							// 2.1 "diffusion_sql::map_locator_to_term_id" (or legacy alias)
							if($process_dato_cs
								&& ($process_dato_cs === 'diffusion_sql::map_locator_to_term_id'
									|| $process_dato_cs === 'diffusion_sql::map_locator_to_terminoID'))
							{
								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_term_id'
									]
								];

								$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props->process->parser = $parser_process;
									$new_props->process->output_format = 'json';
									$new_props->process->output_sample = ["es1_1"];

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] select map_locator_to_term_id\n";
								break;
							}

							// 2.2 "diffusion_sql::map_quality_to_int"
							if($process_dato_cs && $process_dato_cs === 'diffusion_sql::map_quality_to_int') {

								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_v6_section_id',
									],
									(object)[
										'fn' => 'parser_helper::get_first',
									]
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process->parser = $parser_process;
								$new_props->process->output_format = 'int';
								
								// v6 map_quality_to_int RETURNS 0, NOT NULL, when the component holds no locator
								// ($quality = 0 before the isset test — class.diffusion_sql.php :4635-4641).
								// map_locator_to_int, which shares this branch and this parser chain, returns
								// NULL in the same situation. Identical chain, different empty value, so the
								// default belongs ONLY to the quality variant.
								if ($process_dato_cs === 'diffusion_sql::map_quality_to_int') {
									$new_props->process->default_value = 0;
								}

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] select map_quality_to_int -> get_diffusion_dato\n";
								break;
							}

							// 2.3 "diffusion_sql::resolve_value" with target_component_tipo → custom ddo_map chain
							if($process_dato_cs && $process_dato_cs === 'diffusion_sql::resolve_value') {

								$process_dato_arguments_cs = $props->process_dato_arguments ?? null;
								$target_component_tipo_cs  = trim($process_dato_arguments_cs->target_component_tipo ?? "");
								$is_publicable_cs          = $process_dato_arguments_cs->is_publicable ?? null;

								$ddo_map_rv = [
									(object)[
										'tipo'         => $rel_info['tipo'],
										'section_tipo' => 'self'
									],
									(object)[
										'tipo'   => $target_component_tipo_cs,
										'parent' => $rel_info['tipo']
									]
								];

								$model_cs = ontology_node::get_legacy_model_by_tipo($target_component_tipo_cs);

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$target_component_tipo_cs,
									$model_cs,
									null,
									$process_dato_arguments_cs,
									null, null, null,
									$ddo_map_rv
								);

								if($is_publicable_cs === true){
									$new_props->is_publishable = true;
								}
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] select resolve_value -> custom ddo_map chain\n";
								break;
							}

							break;
						case 'component_relation_model':

							$is_empty_rm = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							$ddo_map_rm = [
								(object)[
									'tipo'         => $rel_info['tipo'],
									'section_tipo' => 'self'
								]
							];

							// 0 empty propiedades: default V6 behavior → get_diffusion_value() trait
							if($is_empty_rm($props)) {

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_relation_model',
									null, null, null, null, null,
									$ddo_map_rm
								);

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_model empty props -> get_diffusion_value\n";
								break;
							}

							// 1 data_to_be_used present: default V6 behavior → get_diffusion_value() trait
							if(isset($props->data_to_be_used) && $props->data_to_be_used === 'dato') {

								$new_props = new stdClass(); $new_props->process = get_diffusion_dato(
									'component_relation_model',
									null, null, null
								);

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_model data_to_be_used -> get_diffusion_dato\n";
								break;
							}

							// 2 "process_dato" present
							$process_dato_rm = $props->process_dato ?? null;

							// 1 "diffusion_sql::map_locator_to_term_id" (or legacy alias)
							if($process_dato_rm
								&& ($process_dato_rm === 'diffusion_sql::map_locator_to_term_id'
									|| $process_dato_rm === 'diffusion_sql::map_locator_to_terminoID'))
							{
								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_term_id'
									]
								];

								$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props->process->parser = $parser_process;
									// resolve the parent relation so the chain fetches its diffusion data
									// (incl. the hierarchy1 root fallback for top-level thesaurus terms)
									$ddo_parent_rp = (object)['tipo' => $rel_info['tipo'], 'section_tipo' => 'self'];
								// add_parents (thesaurus 'parents' field): resolve the FULL ancestor chain
								// recursively (v6 get_parents_recursive) instead of just the direct parent.
								$add_parents_rp = $props->process_dato_arguments->custom_arguments->add_parents
									?? $props->process_dato_arguments->add_parents ?? false;
								if ($add_parents_rp === true) {
									// Canonical ancestor-chain pattern: process-level add_parents (chain → meta)
									// + parser_locator::parents (shapes it), mirroring the parents_term column.
									// Replaces the removed per-ddo get_diffusion_data_recursive fn.
									$new_props->process = diffusion_build_add_parents_process('term_id');
								} else {
									$new_props->process->ddo_map = [ $ddo_parent_rp ];
								}
									$new_props->process->output_format = 'json';
									$new_props->process->output_sample = ["es1_1"];

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_model map_locator_to_term_id\n";
								break;
							}

							break;

						case 'component_relation_parent':

							$is_empty_rp = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							$ddo_map_rp = [
								(object)[
									'tipo'         => $rel_info['tipo'],
									'section_tipo' => 'self'
								]
							];

							// 0 empty propiedades: default V6 behavior → get_diffusion_value() trait
							if($is_empty_rp($props)) {

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_relation_parent',
									null, null, null, null, null,
									$ddo_map_rp
								);

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_model empty props -> get_diffusion_value\n";
								break;
							}

							// 0.5 "process_dato" = "diffusion_sql::map_locator_to_terminoID_parent"
							// v6 (class.diffusion_sql.php map_locator_to_terminoID_parent): take the
							// FIRST stored parent locator and publish map_to_terminoID() of it, i.e.
							// the scalar "{section_tipo}_{section_id}" — NOT the json array the plain
							// map_locator_to_terminoID sibling emits. Hence get_term_id + get_first
							// with output_format string.
							//
							// The v6 method ALSO force-publishes the parent record as a side effect
							// (it flips skip_publication_state_check and calls update_record). That is
							// a publication-SET effect, not a value effect: it changes WHICH records
							// exist, never what this column contains. It is deliberately NOT modelled
							// here — the v7 engine has no equivalent hook and a migration must not
							// invent publication side effects.
							if(($props->process_dato ?? null) === 'diffusion_sql::map_locator_to_terminoID_parent'){

								$new_props = new stdClass();
								$new_props->process = (object)[
									'ddo_map' => $ddo_map_rp,
									'parser'  => [
										(object)['fn' => 'parser_locator::get_term_id'],
										(object)['fn' => 'parser_helper::get_first']
									],
									'output_format' => 'string',
									'output_sample' => 'es1_1'
								];

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }
								if(isset($props->info)){ $new_props->info = $props->info; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] diffusion_sql::map_locator_to_terminoID_parent -> get_term_id + get_first (scalar)\n";
								break;
							}

							// 1 "option_obj" present
							$option_obj_rp = $props->option_obj ?? null;
							if($option_obj_rp){

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_relation_parent',
									null, null, null, null, $option_obj_rp,
									null
								);

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_model empty props -> get_diffusion_value\n";
								break;
								
							}
							
							// 2 "process_dato" present
							$process_dato_rp = $props->process_dato ?? null;

							// 3 "diffusion_sql::map_locator_to_term_id" (or legacy alias)
							if($process_dato_rp
								&& ($process_dato_rp === 'diffusion_sql::map_locator_to_term_id'
									|| $process_dato_rp === 'diffusion_sql::map_locator_to_terminoID'))
							{
								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_term_id'
									]
								];

								$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props->process->parser = $parser_process;
									// resolve the parent relation so the chain fetches its diffusion data
									// (incl. the hierarchy1 root fallback for top-level thesaurus terms)
									$ddo_parent_rp = (object)['tipo' => $rel_info['tipo'], 'section_tipo' => 'self'];
								// add_parents (thesaurus 'parents' field): resolve the FULL ancestor chain
								// recursively (v6 get_parents_recursive) instead of just the direct parent.
								$add_parents_rp = $props->process_dato_arguments->custom_arguments->add_parents
									?? $props->process_dato_arguments->add_parents ?? false;
								if ($add_parents_rp === true) {
									// Canonical ancestor-chain pattern: process-level add_parents (chain → meta)
									// + parser_locator::parents (shapes it), mirroring the parents_term column.
									// Replaces the removed per-ddo get_diffusion_data_recursive fn.
									$new_props->process = diffusion_build_add_parents_process('term_id');
								} else {
									$new_props->process->ddo_map = [ $ddo_parent_rp ];
								}
									$new_props->process->output_format = 'json';
									$new_props->process->output_sample = ["es1_1"];

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_model map_locator_to_term_id\n";
								break;
							}

							// 3 "diffusion_sql::map_locator_to_int_recursive"
							if($process_dato_rp
								&& ($process_dato_rp === 'diffusion_sql::map_locator_to_int_recursive'))
							{

								$process_dato_arguments = $props->process_dato_arguments ?? null;

								if($process_dato_arguments->custom_arguments->add_parents === true){
									$parser_process = (object)[
										'fn' => 'add_parents',
										'parser' => [
											(object)[
												'fn' => 'parser_locator::parents',
												'options' => (object)[
													// see the merge:'unique' note above: json output = ARRAY.
													'merge' => 'unique',
													'value' => 'section_id'
												]
											]
										],
										'output_format' => 'json'
									];
								}else{

									$parser_process = (object)[
										'parser' => [
											(object)[
												'fn' => 'parser_locator::get_v6_section_id'
											]
										],
										'output_format' => 'json'
									];


								}

								$new_props = new stdClass();
									$new_props->process = $parser_process;
									$new_props->process->output_sample = ["1"];

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_model map_locator_to_term_id\n";
								break;
							}


							// 4 "diffusion_sql::map_parent_to_norder"
							if($process_dato_rp	&& ($process_dato_rp === 'diffusion_sql::map_parent_to_norder')) {

								$source_related_tipo = $rel_info['tipo'];

								$section_tipo = ontology_node::get_ar_tipo_by_model_and_relation(
									$source_related_tipo, 
									'section',
									'parent',
									true)[0];
									
								if (!empty($section_tipo)) {
									// v6 map_parent_to_norder = the term's 0-based position among its
									// PARENT's ordered children (sibling index), NOT a stored `number`
									// order (which is empty for most thesaurus terms → 0). Resolved by the
									// canonical diffusion mixin diffusion_fn::map_parent_to_norder (reached
									// via common::__call), on the shared ts section_id component (hierarchy22
									// = self) which carries the term context. That fn computes the parent
									// (component_relation_parent::get_parents — the thesaurus parent edge is
									// an inverse, so the stored dato is empty) then the sibling index.
									$new_props = new stdClass();
									$new_props->process = (object)[
										'ddo_map' => [ (object)['tipo' => 'hierarchy22', 'section_tipo' => 'self', 'fn' => 'map_parent_to_norder'] ],
										'parser'  => [ (object)['fn' => 'parser_helper::get_first'] ],
										'output_format' => 'int',
										'default_value' => '0'
									];
									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] map_parent_to_norder -> diffusion_fn::map_parent_to_norder (sibling position)\n";
									break;

									$tld_source = get_tld_from_tipo($tipo);
									$source_section_tipo = $tld_source.'0';
									$source_section_id = get_section_id_from_tipo($tipo);

									$conneted_model = ontology_node::get_model_by_tipo(DEDALO_ONTOLOGY_CONNECTED_TO_TIPO);

									$component_relation = component_common::get_instance(
										$conneted_model,
										DEDALO_ONTOLOGY_CONNECTED_TO_TIPO,
										$source_section_id,
										'edit',
										DEDALO_DATA_NOLAN,
										$source_section_tipo
									);

									$tld = get_tld_from_tipo($order_tipo);
									$section_tipo = $tld.'0';
									$section_id = get_section_id_from_tipo($order_tipo);

									$related_data = new locator();
										$related_data->set_section_tipo($section_tipo);
										$related_data->set_section_id($section_id);

									$data_entry = [$related_data ];
								
									$component_relation->set_data($data_entry);
									// (unreachable today — the branch above breaks before reaching this —
									//  but the dry run's "writes nothing" promise must not depend on that)
									if (!defined('MIGRATE_DIFFUSION_DRY_RUN') || MIGRATE_DIFFUSION_DRY_RUN !== true) {
										$component_relation->save();
									}

									$order_model = ontology_node::get_model_by_tipo($order_tipo); 
									$new_props = new stdClass(); $new_props->process = get_diffusion_value(
										$order_tipo,
										$order_model,
										null,
										null,
										null,
										null,
										null,
										null
									);	

									$new_props->process->output_sample = [1];
									// norder is numeric; v6 map_parent_to_norder returns int 0 when the
									// order/parent is empty. int output + default_value "0" makes the
									// engine emit "0" for the empty/no-data case — matching v6.
									$new_props->process->output_format = 'int';
									$new_props->process->default_value = "0";

									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}
									if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] relation_model map_parent_to_norder\n";
									break;
								}
							}

							$data_to_be_used = $props->data_to_be_used ?? null;
							// 3 "data_to_be_used" alone. It can be set as is_publicabe or not
							if($data_to_be_used && $data_to_be_used === "dato"){
								
								$parser_process = (object)[
									'fn' => 'parser_locator::get_v6_section_id',
									'output_format' => 'json'
								];

								$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props->process->parser = $parser_process;
									$new_props->process->output_sample = ["1","55"];

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] component_relation_parent (relation) -> mapped section_id values\n";							
								break;								
							}

							// 4 "process_dato" = "diffusion_sql::resolve_value" + "component_method" = "get_diffusion_value"
							// The PARENT record is a hop like any other: v6 resolves the parent locator and
							// then reads target_component_tipo ON THAT RECORD. rsc787 (publications
							// .title_colective) publishes the parent publication's own title (rsc140);
							// with no branch for this shape the node was skipped as [UNMAPPED], the field
							// compiled to a bare parent hop with no leaf, and the column published NULL.
							$process_dato_rp = $props->process_dato ?? null;
							$args_rp         = $props->process_dato_arguments ?? null;
							if ($process_dato_rp === 'diffusion_sql::resolve_value'
								&& ($args_rp->component_method ?? null) === 'get_diffusion_value'
								&& !isset($args_rp->custom_arguments)
								&& !empty($args_rp->target_component_tipo)) {

								$target_rp     = $args_rp->target_component_tipo;
								$model_rp      = ontology_node::get_legacy_model_by_tipo($target_rp);
								$ddo_map_rp_v  = $ddo_map_rp;
								$ddo_map_rp_v[] = (object)[
									'tipo'   => $target_rp,
									'parent' => $rel_info['tipo']
								];

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$target_rp,
									$model_rp,
									null,
									$args_rp,
									$args_rp->output ?? null,
									null,
									$option_obj ?? null,
									$ddo_map_rp_v
								);

								// get_diffusion_value's component_input_text case returns ONLY the parser
								// and leaves the map to the caller (v1_get_diffusion_value.php :220-224).
								if (!isset($new_props->process->ddo_map)) {
									$new_props->process->ddo_map = $ddo_map_rp_v;
								}

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] component_relation_parent resolve_value -> get_diffusion_value on parent\n";
								break;
							}

							break;
						
						case 'component_radio_button':

							$is_empty_rb = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							$ddo_map_rb = [
								(object)[
									'tipo'         => $rel_info['tipo'],
									'section_tipo' => 'self'
								]
							];

							// 0 empty propiedades: default V6 behavior → get_diffusion_value() trait
							if($is_empty_rb($props)) {

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_radio_button',
									null, null, null, null, null,
									$ddo_map_rb
								);

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] radio_button empty props -> get_diffusion_value\n";
								break;
							}

							// 1 "data_to_be_used" = "value"
							$data_to_be_used_rb = $props->data_to_be_used ?? null;
							if($data_to_be_used_rb && $data_to_be_used_rb === 'value') {

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_radio_button',
									null, null, null, null, null,
									$ddo_map_rb
								);

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] radio_button data_to_be_used=value -> get_diffusion_value\n";
								break;
							}

							// 1.5 "data_to_be_used" = "dato" with "enum" → custom enum map resolution
							$enum_rb = $props->enum ?? null;
							if($data_to_be_used_rb && $data_to_be_used_rb === 'dato' && !empty($enum_rb)) {

								$parser_process_rb = [
									(object)[
										'fn' => 'parser_locator::get_v6_section_id',
									],
									(object)[
										'fn' => 'parser_helper::get_first',
									],
									(object)[
										'fn' => 'parser_text::map_value',
										'options' => (object)[
											'map' => [
												(object)[
													'a' => $enum_rb
												]
											]
										]
									]
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process->parser = $parser_process_rb;
								$new_props->process->output_sample = "Yes";

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] radio_button dato+enum -> map_value\n";
								break;
							}

							// 1.6 "data_to_be_used" = "dato" (without enum) → get_diffusion_dato()
							if($data_to_be_used_rb && $data_to_be_used_rb === 'dato') {

								$new_props = new stdClass(); $new_props->process = get_diffusion_dato('component_radio_button', null, null, null);

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] radio_button data_to_be_used=dato -> get_diffusion_dato\n";
								break;
							}

							// 2 "process_dato" present
							$process_dato_rb = $props->process_dato ?? null;

							// 2.1 "diffusion_sql::map_locator_to_term_id" (or legacy alias)
							if($process_dato_rb
								&& ($process_dato_rb === 'diffusion_sql::map_locator_to_term_id'
									|| $process_dato_rb === 'diffusion_sql::map_locator_to_terminoID'))
							{
								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_term_id'
									]
								];

								$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props->process->parser = $parser_process;
									$new_props->process->output_format = 'json';
									$new_props->process->output_sample = ["es1_1"];

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] radio_button map_locator_to_term_id\n";
								break;
							}

							// 2.2 "diffusion_sql::map_quality_to_int"
							if($process_dato_rb && $process_dato_rb === 'diffusion_sql::map_quality_to_int'
								|| $process_dato_rb === 'diffusion_sql::map_locator_to_int') {

								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_v6_section_id',
									],
									(object)[
										'fn' => 'parser_helper::get_first',
									]
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process->parser = $parser_process;
								$new_props->process->output_format = 'int';
								
								// v6 map_quality_to_int RETURNS 0, NOT NULL, when the component holds no locator
								// ($quality = 0 before the isset test — class.diffusion_sql.php :4635-4641).
								// map_locator_to_int, which shares this branch and this parser chain, returns
								// NULL in the same situation. Identical chain, different empty value, so the
								// default belongs ONLY to the quality variant.
								if ($process_dato_rb === 'diffusion_sql::map_quality_to_int') {
									$new_props->process->default_value = 0;
								}

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] radio_button map_quality_to_int -> get_diffusion_dato\n";
								break;
							}

							// 2.25 "diffusion_sql::map_locator_to_value" with map → same enum map resolution
							if($process_dato_rb && $process_dato_rb === 'diffusion_sql::map_locator_to_value') {

								$process_dato_arguments_rb_mv = $props->process_dato_arguments ?? null;
								$map_rb = $process_dato_arguments_rb_mv->map ?? null;

								$parser_process_rb_mv = [
									(object)[
										'fn' => 'parser_locator::get_v6_section_id',
									],
									(object)[
										'fn' => 'parser_helper::get_first',
									],
									(object)[
										'fn' => 'parser_text::map_value',
										'options' => (object)[
											'map' => [
												(object)[
													'a' => $map_rb
												]
											]
										]
									]
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process->parser = $parser_process_rb_mv;
								$new_props->process->output_sample = "1";

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] radio_button map_locator_to_value -> map_value\n";
								break;
							}

							// 2.3 "diffusion_sql::resolve_value" with target_component_tipo → custom ddo_map chain
							if($process_dato_rb && $process_dato_rb === 'diffusion_sql::resolve_value') {

								$process_dato_arguments_rb = $props->process_dato_arguments ?? null;
								$target_component_tipo_rb  = trim($process_dato_arguments_rb->target_component_tipo ?? "");
								$is_publicable_rv_rb       = $process_dato_arguments_rb->is_publicable ?? null;

								$ddo_map_rv_rb = [
									(object)[
										'tipo'         => $rel_info['tipo'],
										'section_tipo' => 'self'
									],
									(object)[
										'tipo'   => $target_component_tipo_rb,
										'parent' => $rel_info['tipo']
									]
								];

								$model_rb = ontology_node::get_legacy_model_by_tipo($target_component_tipo_rb);

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$target_component_tipo_rb,
									$model_rb,
									null,
									$process_dato_arguments_rb,
									null, null, null,
									$ddo_map_rv_rb
								);

								if($is_publicable_rv_rb === true){
									$new_props->is_publishable = true;
								}
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] radio_button resolve_value -> custom ddo_map chain\n";
								break;
							}

							break;

						case 'component_relation_related':

							$is_empty_rr = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							$ddo_map_rr = [
								(object)[
									'tipo'         => $rel_info['tipo'],
									'section_tipo' => 'self'
								]
							];

							// 0 empty propiedades: default V6 behavior → get_diffusion_value() trait
							if($is_empty_rr($props)) {

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_relation_related',
									null, null, null, null, null,
									$ddo_map_rr
								);

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_related empty props -> get_diffusion_value\n";
								break;
							}

							// 1.5 data_to_be_used = "dato" -> flat list of related section_ids
							if (($props->data_to_be_used ?? null) === 'dato') {
								$new_props = new stdClass();
								$new_props->process = get_diffusion_dato(
									'component_relation_related',
									null,
									null,
									null,
									$ddo_map_rr
								);
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_related data_to_be_used=dato -> get_section_id\n";
								break;
							}

							// 2 "process_dato" present
							$process_dato_rr = $props->process_dato ?? null;

							// 1 "diffusion_sql::map_locator_to_term_id" (or legacy alias)
							if($process_dato_rr
								&& ($process_dato_rr === 'diffusion_sql::map_locator_to_term_id'
									|| $process_dato_rr === 'diffusion_sql::map_locator_to_terminoID'))
							{
								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_term_id'
									]
								];

								$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props->process->parser = $parser_process;
									$new_props->process->output_format = 'json';
									$new_props->process->output_sample = ["es1_1"];

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_related map_locator_to_term_id\n";
								break;
							}
							$process_dato_arguments = $props->process_dato_arguments ?? null;
							$component_method = $process_dato_arguments->component_method ?? null;
							
							// 3  "process_dato": "diffusion_sql::resolve_value" "component_method": "get_diffusion_resolve_value"
							if($process_dato_rr === 'diffusion_sql::resolve_value'
								&& $component_method === 'get_diffusion_resolve_value')
							{

								$custom_arguments = $process_dato_arguments->custom_arguments ?? null;
								$output = $process_dato_arguments->output ?? null;
								$target_component_tipo = $process_dato_arguments->target_component_tipo ?? null;

								
								$ddo_map_rr = [
									(object)[
										'tipo'         => $rel_info['tipo'],
										'section_tipo' => 'self'
									]
								];
								
								$output_options_rr = new stdClass();
								$final_method_rr = null;
								$parent_tipo = $rel_info['tipo'];
								$args_node = $props->process_dato_arguments;
								$custom_parents_config = null;
								$final_target = null;
								$final_args = null;
								$is_publicable_rr = $props->process_dato_arguments->is_publicable ?? null;
								$check_general_merge = $args_node->output ?? null;
								
								while($args_node) {
									$method = $args_node->component_method ?? null;
									$target = trim($args_node->target_component_tipo ?? "");
									
									if($target) {
										$ddo_map_rr[] = (object)['tipo' => $target, 'parent' => $parent_tipo];
										$parent_tipo = $target;
										$final_target = $target;
									}
									
									if(isset($args_node->split_string_value)) {
										$output_options_rr->records_separator = $args_node->split_string_value;
									}
									
									$ca = $args_node->custom_arguments[0] ?? null;
									if($ca && isset($ca->custom_parents)) {
										$custom_parents_config = $ca->custom_parents;
									}
									
									if($method === 'get_diffusion_dato' || $method === 'get_diffusion_value' || $method === 'get_diffusion_resolve_value') {
										$final_method_rr = $method;
										$final_args = $args_node;

										if( $method === 'get_diffusion_resolve_value' && isset($args_node->custom_arguments)){
											foreach($args_node->custom_arguments as $current_ca){
												$current_component_tipo = $current_ca->process_dato_arguments->target_component_tipo ?? null;
												$current_compnent_method = $current_ca->process_dato_arguments->component_method ?? null;
												if(isset($current_component_tipo)){
													$target_model = ontology_node::get_model_by_tipo($current_component_tipo);
													if($target_model==='component_date'){
														break;// break the for and continue with the while
													}
													if($current_compnent_method === 'get_diffusion_value' && !in_array($target_model, component_relation_common::get_components_with_relations())) {
														break 2;
													}
												}
											}
										}
																			
									}else if($method === 'get_dato' && isset($args_node->process_dato)){
										$final_method_rr = $args_node->process_dato ?? null;
									}else if($method === 'get_dato' && isset($args_node->output)){
										$final_method_rr = $method;
										$final_args = $args_node;
									}
									
									if($ca && isset($ca->process_dato_arguments)) {
										$args_node = $ca->process_dato_arguments;
									} else if ($ca && isset($ca->process_dato) && $ca->process_dato === 'diffusion_sql::resolve_value') {
										$args_node = $ca->process_dato_arguments ?? null;
									} else {
										break;
									}
								}

								if(empty($final_method_rr)) {
									$new_props = new stdClass();
									$new_props->process = new stdClass();

									$new_props->process->output_format = 'json';
									$new_props->process->output_sample = ["es1_1"];
									$new_props->process->ddo_map = $ddo_map_rr;
									

									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}
									if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] check_box map_locator_to_term_id\n";
									break;
									
								}
								
								if($final_method_rr === 'get_diffusion_dato') {
									$new_props = new stdClass(); $new_props->process = get_diffusion_dato(
										$final_target,
										null,
										$final_args,
										null
									);
								} else if($final_method_rr === 'get_diffusion_resolve_value') {
									$separator = $final_args->separator ?? ' ';
									$output_v5 = $final_args->output ?? null;
									$custom_arguments = $final_args->custom_arguments ?? [];
									
									$merge_option = null;
									if ($output_v5 === 'merged') {
										$merge_option = null;
										$output_format = 'json';
									} else if ($output_v5 === 'merged_group') {
										$merge_option = 'flat';
									} else if ($output_v5 === 'merged_unique') {
										$merge_option = 'unique';
									}
									
									$pattern_parts = [];
									$letters = range('a', 'z');
									
									foreach ($custom_arguments as $index => $arg) {
										$sub_args = $arg->process_dato_arguments ?? null;
										if ($sub_args && isset($sub_args->target_component_tipo)) {
											$sub_target = trim($sub_args->target_component_tipo);
											$letter = $letters[$index] ?? 'z';
											
											$ddo_map_rr[] = (object)[
												'tipo' => $sub_target,
												'parent' => $final_target,
												'id' => $letter
											];
											
											$pattern_parts[] = '${' . $letter . '}';
										}
									}
									
									$parser_pipeline = [];
									$parser_pipeline[] = (object)[
										'fn' => 'parser_text::text_format',
										'options' => (object)[
											'pattern' => implode($separator, $pattern_parts)
										]
									];
									
									if ($merge_option !== null) {
										$parser_pipeline[] = (object)[
											'fn' => 'parser_helper::merge',
											'options' => (object)[
												'merge' => $merge_option
											]
										];
										$output_format = 'json';
									}
									
									$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props->process->parser = $parser_pipeline;
									$new_props->process->ddo_map = $ddo_map_rr;
									// v6 output:'merged' PUBLISHES A JSON ARRAY, not a joined string. The
									// trait states the rule directly (v1_get_diffusion_value.php :112-116:
									// output==='merged' -> output_format 'json'); this hand-rolled branch
									// mapped 'merged' to merge_option null and fell back to 'string', so
									// publications.other_people_surname published
									// 'Alpuente | Lorrio | Luis' against v6's
									// ["Alpuente","Lorrio","Luis"]. The output lives on the CUSTOM
									// sub-argument as often as on the outer args, so both are consulted —
									// and the branch's own output_sample (["Name Surname"]) was already an
									// array, i.e. the format was simply inconsistent with its own sample.
									$merged_output_cp = $output_v5;
									if ($merged_output_cp === null) {
										foreach ($custom_arguments as $custom_argument) {
											$candidate = $custom_argument->process_dato_arguments->output ?? null;
											if ($candidate !== null) { $merged_output_cp = $candidate; break; }
										}
									}
									if ($merged_output_cp === 'merged') {
										$output_format = 'json';
									}

									$new_props->process->output_format = $output_format ?? 'string';
									$new_props->process->output_sample = ["Name Surname"];
									
									if(isset($props->is_publicable) && $props->is_publicable === true) {
										$new_props->is_publishable = $props->is_publicable;
									}
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}
									
									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] get_diffusion_resolve_value\n";
									break;
								} else if($final_method_rr === 'diffusion::map_section_id_to_subtitles_url') {
									
									$new_props = new stdClass();
									$new_props->process = new stdClass();;

									if ($ddo_map_rr !== []) {
										$ddo_map_rr[count($ddo_map_rr) - 1]->fn = 'map_section_id_to_subtitles_url';
									}

									$new_props->process->ddo_map = $ddo_map_rr;
									$new_props->process->output_sample = "/dedalo/publication/server_api/v1/subtitles/?section_id=1&lang=lg-eng";

									// "is_publicable" = true
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}

									// "varchar" = 256
									if(isset($props->varchar)){
										$new_props->varchar = $props->varchar;
									}
									
									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] diffusion_sql::map_section_id_to_subtitles_url\n";
									break;
								} else if($final_method_rr === 'get_dato'){
									$model_rr = ontology_node::get_legacy_model_by_tipo($final_target);
									$output = $final_args->output ?? null;
									$output_options = $final_args->output_options ?? null;																
									
									$new_props = new stdClass(); $new_props->process = get_dato(										
										$model_rr,
										null,
										null,
										(empty((array)$output_options_rr) ? null : $output_options_rr),
										$ddo_map_rr
									);
									if( isset($check_general_merge) 
										&& ($check_general_merge==='merged'
										|| $check_general_merge==='merged_group'
										|| $check_general_merge==='merged_unique')){
											$new_props->process->output_format = 'json';
									}							
								} else { // get_diffusion_value or fallback
									$model_rr = ontology_node::get_legacy_model_by_tipo($final_target);
									
									// Reconstruct add_parents if found in hierarchy
									if($custom_parents_config) {
										$parser_options = new stdClass();
										$parser_options->value = "term";
										if(isset($custom_parents_config->select_model)) {
											$parser_options->parent_typology_term_id = $custom_parents_config->select_model;
										}
										if(isset($custom_parents_config->slice)) {
											$parser_options->parents_slice = $custom_parents_config->slice;
										}
										if(isset($custom_parents_config->parent_end_by_model)) {
											$parser_options->parent_end_by_typology_term_id = $custom_parents_config->parent_end_by_model;
										}
										$output_options_rr->add_parents = $parser_options;
									}

									$output_2 = $final_args->output ?? null;									
									
									$new_props = new stdClass(); $new_props->process = get_diffusion_value(
										$final_target,
										$model_rr,
										null,
										$final_args,
										$output_2,
										null,
										(empty((array)$output_options_rr) ? null : $output_options_rr),
										$ddo_map_rr
									);
									if ($output === 'merged') {
										$new_props->process->output_format = 'json';
									}								
								}
								
								if(isset($props->is_publicable) && $props->is_publicable === true || $is_publicable_rr === true){
									$new_props->is_publishable = true;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] portal resolve_value nested loop -> {$final_method_rr}\n";
								break;
							}

							break;
						
						case 'component_filter':

							// "process_dato" = "diffusion_sql::map_project_to_section_id"
							// v6 (class.diffusion_sql.php :4075-4090, post-4.9 path) maps every stored
							// locator to its section_id and returns the ARRAY — the same shape as the
							// data_to_be_used:'dato' mapping, so the same chain expresses it. The
							// pre-4.9 branch (keys of an id:count map) is dead on any install this
							// migration can run against: the runner refuses below data version 6.9.1.
							if(($props->process_dato ?? null) === 'diffusion_sql::map_project_to_section_id'){

								$new_props = new stdClass();
								$new_props->process = (object)[
									'parser' => [
										(object)['fn' => 'parser_locator::get_v6_section_id']
									],
									'output_format' => 'json',
									'output_sample' => ["1"]
								];

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }
								if(isset($props->info)){ $new_props->info = $props->info; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] diffusion_sql::map_project_to_section_id -> get_v6_section_id (json)\n";
								break;
							}

							$is_empty_cf = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							// 0 empty propiedades: default V6 behavior → get_diffusion_value() trait
							if($is_empty_cf($props)) {

								$ddo_map_cf = [
									(object)[
										'tipo'         => $rel_info['tipo'],
										'section_tipo' => 'self'
									]
								];

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_filter',
									null, null, null, null, null,
									$ddo_map_cf
								);

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] filter empty props -> get_diffusion_value\n";
								break;
							}

							// 1 "data_to_be_used" = "dato"
							$data_to_be_used_cf = $props->data_to_be_used ?? null;
							if($data_to_be_used_cf && $data_to_be_used_cf === 'dato') {				

								$new_props = new stdClass(); $new_props->process = get_diffusion_dato(
									'component_filter',
									null,
									null,
									null
								);

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] filter data_to_be_used=dato -> get_dato()\n";
								break;
							}

							// 2 "process_dato" present
							$process_dato_cf = $props->process_dato ?? null;

							// 2.1 "diffusion_sql::map_locator_to_term_id" (or legacy alias)
							if($process_dato_cf
								&& ($process_dato_cf === 'diffusion_sql::map_locator_to_term_id'
									|| $process_dato_cf === 'diffusion_sql::map_locator_to_terminoID'))
							{
								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_term_id'
									]
								];

								$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props->process->parser = $parser_process;
									$new_props->process->output_format = 'json';
									$new_props->process->output_sample = ["es1_1"];

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] filter map_locator_to_term_id\n";
								break;
							}

							// 2.2 "diffusion_sql::map_quality_to_int"
							if($process_dato_cf && $process_dato_cf === 'diffusion_sql::map_quality_to_int') {

								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_v6_section_id',
									],
									(object)[
										'fn' => 'parser_helper::get_first',
									]
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process->parser = $parser_process;
								$new_props->process->output_format = 'int';
								
								// v6 map_quality_to_int RETURNS 0, NOT NULL, when the component holds no locator
								// ($quality = 0 before the isset test — class.diffusion_sql.php :4635-4641).
								// map_locator_to_int, which shares this branch and this parser chain, returns
								// NULL in the same situation. Identical chain, different empty value, so the
								// default belongs ONLY to the quality variant.
								if ($process_dato_cf === 'diffusion_sql::map_quality_to_int') {
									$new_props->process->default_value = 0;
								}
								
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] filter map_quality_to_int -> get_diffusion_dato()\n";
								break;
							}

							break;
						
						case 'component_geolocation':

							$is_empty_geolocation = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							// 0 empty propiedades: default V6 behavior — delegate to get_diffusion_value() trait
							// The trait builds letter-id ddo_map from related components + parser_text::text_format
							if($is_empty_geolocation($props)) {

								$ddo_map_geolocation = [
									(object)[
										'tipo'         => $rel_info['tipo'],
										'section_tipo' => 'self'
									]
								];

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_geolocation',
									null,
									null,
									null,
									null,
									null,
									null
								);

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] iri empty props -> get_diffusion_value (letter-id ddo_map)\n";
								break;
							}

							// 1 "data_to_be_used" = "dato"
							$data_to_be_used_geo = $props->data_to_be_used ?? null;
							if($data_to_be_used_geo && $data_to_be_used_geo === 'dato') {

								$new_props = new stdClass(); $new_props->process = get_dato(
									'component_geolocation',
									null,
									null,
									null,
									null
								);

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] iri data_to_be_used=dato -> get_dato()\n";
								break;
							}
							

							break;
						case 'component_date':

							$is_empty_cd = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							// 0 empty propiedades: default V6 behavior → get_diffusion_value() trait
							if($is_empty_cd($props)) {

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_date',
									null, null, null, null, null, null
								);
								
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] date empty props -> get_diffusion_value\n";
								break;
							}

							// 1 "data_to_be_used" = "dato"
							$data_to_be_used_cd = $props->data_to_be_used ?? null;
							if($data_to_be_used_cd && $data_to_be_used_cd === 'dato') {

								$new_props = new stdClass(); $new_props->process = get_diffusion_dato('component_date', null, null, null);

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] date data_to_be_used=dato -> get_diffusion_dato()\n";
								break;
							}

							// 2 "process_dato" present
							$process_dato_cd = $props->process_dato ?? null;

							// 2.3 "diffusion_sql::resolve_value" -> "split_date_range" output
							if($process_dato_cd && $process_dato_cd === 'diffusion_sql::resolve_value') {
								$process_dato_args_cd = $props->process_dato_arguments ?? null;
								$output_cd = $process_dato_args_cd->output ?? null;
								
								if($output_cd === 'split_date_range') {
									$output_options_cd = $process_dato_args_cd->output_options ?? null;
									
									$new_props = new stdClass(); $new_props->process = get_dato(
										'component_date',
										null,
										'split_date_range',
										$output_options_cd,
										null
									);
									
									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}
									if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] date resolve_value -> split_date_range -> get_dato()\n";
									break;
								}
							}

							// 2.2 "diffusion_sql::split_date_range"
							if($process_dato_cd && $process_dato_cd === 'diffusion_sql::split_date_range') {
								
								$process_dato_args_cd = $props->process_dato_arguments ?? null;
								$new_props = new stdClass(); $new_props->process = get_dato(
									'component_date',
									null,
									'split_date_range',
									$process_dato_args_cd,
									null
								);
								
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] date split_date_range -> get_dato()\n";
								break;
							}

							break;
						case 'component_email':
							break;

							case 'component_json':
								// component_json holds a JSON object; emit it as a JSON column (output_format
								// json → the engine JSON.stringifies the object instead of String()'ing it to
								// '[object Object]'). The migrate switch had no component_json case.
								$ddo_map_cj = [ (object)['tipo' => $rel_info['tipo'], 'section_tipo' => 'self'] ];
								$new_props = new stdClass();
								$new_props->process = (object)[ 'ddo_map' => $ddo_map_cj, 'output_format' => 'json' ];
								if(isset($props->is_publicable) && $props->is_publicable === true){ $new_props->is_publishable = $props->is_publicable; }
								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] component_json -> output_format json\n";
								break;

						case 'component_info':
							// v6 process_dato=resolve_component_value over a stats widget
							// (e.g. get_archive_weights) with custom_arguments selecting one
							// value (select + value_format). Delegate to get_diffusion_dato's
							// component_info handler (→ parser_info::widget) and resolve the
							// info component on self.
							$pda_info             = $props->process_dato_arguments ?? null;
							$custom_arguments_info = $pda_info->custom_arguments ?? null;
							if (!empty($custom_arguments_info)) {

								$ddo_map_info = [
									(object)['tipo' => $rel_info['tipo'], 'section_tipo' => 'self']
								];

								$new_props = new stdClass();
								$new_props->process = get_diffusion_dato(
									'component_info',
									$custom_arguments_info,
									$pda_info,
									null,
									$ddo_map_info
								);
								$new_props->process->ddo_map = $ddo_map_info;

								if (isset($props->varchar)) {
									$new_props->varchar = $props->varchar;
								}
								if (isset($props->is_publicable) && $props->is_publicable === true) {
									$new_props->is_publishable = $props->is_publicable;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] component_info resolve_component_value -> parser_info::widget (select)\n";
							}
							break;

						case 'component_input_text':

							$is_empty_cd = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							$process_dato = isset($props->process_dato) ? $props->process_dato : null;

							// map_locator_to_terminoID on an INPUT_TEXT (v6 quirk): v6 applies term_id_from_locator
							// to each non-locator input value → the empty marker "_". Reproduce for byte-parity
							// (thesaurus "color" field hierarchy136).
							if( $process_dato && ($process_dato === "diffusion_sql::map_locator_to_terminoID" || $process_dato === "diffusion_sql::map_locator_to_term_id") ){
								$new_props = new stdClass();
								$new_props->process = (object)[
									'ddo_map' => [ (object)['tipo' => $rel_info['tipo'], 'section_tipo' => 'self'] ],
									'parser'  => [ (object)['fn' => 'parser_locator::get_term_id', 'options' => (object)['coerce_non_locator' => true]] ],
									'output_format' => 'json'
								];
								if(isset($props->is_publicable) && $props->is_publicable === true){ $new_props->is_publishable = $props->is_publicable; }
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }
								echo "{$indent}  [RULE APPLIED] input_text map_locator_to_terminoID -> get_term_id (coerce, v6 quirk)\n";
								break;
							}

							// 1 "process_dato" = "diffusion_sql::map_target_section_tipo"
							if( $process_dato 
								&& $process_dato=== "diffusion_sql::map_target_section_tipo"){							

								$parser_process = (object)[											
									'fn' => 'map_target_section_tipo'
								];

								$new_props = new stdClass();
								$new_props->process = $parser_process;
								$new_props->process->output_sample = "ts_onomastic";

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}
								
								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] diffusion_sql::map_target_section_tipo\n";
								break;
							}

							break;
						case 'component_text_area':
							$is_empty_ta = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							// 0 empty propiedades: default V6 behavior → get_diffusion_value() trait
							if($is_empty_ta($props)) {

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_text_area',
									null, null, null, null, null, null
								);
								
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] text_area empty props -> get_diffusion_value\n";
								break;
							}

							// 1 proces data with geojson
							$process_dato = $props->process_dato ?? null;
							if($process_dato && ($process_dato === "diffusion_sql::build_geolocation_data_geojson" || $process_dato === "diffusion_sql::build_geolocation_data")) {

								// Specific for geojson
								$geo_fn = ($process_dato === "diffusion_sql::build_geolocation_data_geojson")
									? "get_geojson_data"
									: "get_geolocation_data";
								$parser_process = (object)[
									"fn" => $geo_fn
								];							

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process = $parser_process;
								$new_props->process->output_format = "json";
								$new_props->process->output_sample = "Yes";

								// v6 fallback (process_dato_arguments.fallback): when geojson is empty, v6 falls
								// back to the fallback component (commonly empty -> ''). Without it v7 emits
								// JSON.stringify([])='[]'. Flag the engine to emit '' for empty on such fields.
								if(!empty($props->process_dato_arguments->fallback)){
									$new_props->process->empty_to_string = true;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] componet_text_area -> diffusion_sql::build_geolocation_data_geojson\n";							
								break;					
							}


							// 2 proces data with images
							$process_dato_arguments = $props->process_dato_arguments ?? null;
							$component_method = $process_dato_arguments->component_method ?? null;
							if($component_method && $component_method === "get_diffusion_value_with_images") {

								// Specific for geojson
								$parser_process = (object)[
									"fn" => "parse_tag_to_html"
								];							

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process = $parser_process;
								$new_props->process->output_sample = '<p><img id="[svg-n-1-]" src="/dedalo/media/svg/web/hierarchy95_sccmk1_2.svg" ..></p>';

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] componet_text_area -> get_diffusion_value_with_images\n";							
								break;					
							}

							break;
						case 'component_html_text':
							$is_empty_cd = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							// 0 empty propiedades: default V6 behavior → get_diffusion_value() trait
							if($is_empty_cd($props)) {

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_html_text',
									null, null, null, null, null, null
								);
								
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] html_text empty props -> get_diffusion_value\n";
								break;
							}
							break;

						case 'component_section_id':

							$is_empty_cd = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							// 2 "process_dato" present
							$process_dato = $props->process_dato ?? null;

							// 1 "process_dato" = "diffusion::map_section_id_to_subtitles_url"
							if( $process_dato 
								&& $process_dato=== "diffusion::map_section_id_to_subtitles_url"){							

								$parser_process = (object)[											
									'fn' => 'map_section_id_to_subtitles_url'
								];

								$new_props = new stdClass();
								$new_props->process = $parser_process;
								$new_props->process->output_sample = "/dedalo/publication/server_api/v1/subtitles/?section_id=1&lang=lg-eng";

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}
								
								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] diffusion_sql::map_section_id_to_subtitles_url\n";
								break;
							}
							// 2 "process_dato" = "diffusion_sql::map_to_terminoID"
							if( $process_dato 
								&& $process_dato=== "diffusion_sql::map_to_terminoID"){							

									$parser_process = (object)[											
										'fn' => 'get_diffusion_data_info',
										'parser' => [
											(object)[
												'fn' => 'parser_locator::get_term_id'
											],
											(object)[
												'fn' => 'parser_helper::get_first'
											]
										],
										"output_format" => "string"
									];

								$new_props = new stdClass();
									$new_props->process = $parser_process;
									$new_props->process->output_sample = "es1_1";

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}
								
								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] diffusion_sql::map_to_terminoID\n";
								break;
							}

							// 3 "process_dato" = "diffusion_sql::map_to_section_tipo"
							if( $process_dato 
								&& $process_dato=== "diffusion_sql::map_to_section_tipo"){							

									$parser_process = (object)[											
										'fn' => 'get_diffusion_data_info',
										'parser' => [
											(object)[
												'fn' => 'parser_locator::get_section_tipo'
											],
											(object)[
												'fn' => 'parser_helper::get_first'
											]
										],
										"output_format" => "string"
									];

								$new_props = new stdClass();
									$new_props->process = $parser_process;
									$new_props->process->output_sample = "es1";

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}
								
								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] diffusion_sql::map_to_terminoID\n";
								break;
							}

							break;

						case 'component_relation_children':

							$is_empty_rc = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							// 0 empty propiedades: default V6 behavior — delegate to get_diffusion_value() trait
							// The trait builds letter-id ddo_map from related components + parser_text::text_format
							if($is_empty_rc($props)) {

								$ddo_map_rc = [
									(object)[
										'tipo'         => $rel_info['tipo'],
										'section_tipo' => 'self'
									]
								];

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_relation_children',
									null,
									null,
									null,
									null,
									null,
									null
								);

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] check_box empty props -> get_diffusion_value (letter-id ddo_map)\n";
								break;
							}

							// 1 "data_to_be_used" = "dato"
							$data_to_be_used_rc = $props->data_to_be_used ?? null;
							if($data_to_be_used_rc && $data_to_be_used_rc === 'dato') {

								$new_props = new stdClass(); $new_props->process = get_diffusion_dato(
									'component_relation_children',
									null,
									null,
									null
								);

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_children data_to_be_used=dato -> get_dato()\n";
								break;
							}

							// 2 "process_dato" present
							$process_dato_rc = $props->process_dato ?? null;

							// 2.1 "process_dato" = "diffusion_sql::map_locator_to_term_id" (or legacy alias)
							if($process_dato_rc
								&& ($process_dato_rc === 'diffusion_sql::map_locator_to_term_id'
									|| $process_dato_rc === 'diffusion_sql::map_locator_to_terminoID'))
							{
								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_term_id'
									]
								];

								$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props->process->parser = $parser_process;
									$new_props->process->output_format = 'json';
									$new_props->process->output_sample = ["es1_1"];

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_children map_locator_to_term_id\n";
								break;
							}

							// 2.2 "process_dato" = "diffusion_sql::map_quality_to_int"
							if($process_dato_rc && $process_dato_rc === 'diffusion_sql::map_quality_to_int') {

								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_v6_section_id',
									],
									(object)[
										'fn' => 'parser_helper::get_first',
									]
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process->parser = $parser_process;
								$new_props->process->output_format = 'int';
								
								// v6 map_quality_to_int RETURNS 0, NOT NULL, when the component holds no locator
								// ($quality = 0 before the isset test — class.diffusion_sql.php :4635-4641).
								// map_locator_to_int, which shares this branch and this parser chain, returns
								// NULL in the same situation. Identical chain, different empty value, so the
								// default belongs ONLY to the quality variant.
								if ($process_dato_rc === 'diffusion_sql::map_quality_to_int') {
									$new_props->process->default_value = 0;
								}

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_children map_quality_to_int -> get_diffusion_dato()\n";
								break;
							}
							
							break;

						case 'component_relation_index':

							$is_empty_ri = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							// 0 empty propiedades: default V6 behavior — delegate to get_diffusion_value() trait
							// The trait builds letter-id ddo_map from related components + parser_text::text_format
							if($is_empty_ri($props)) {

								$ddo_map_ri = [
									(object)[
										'tipo'         => $rel_info['tipo'],
										'section_tipo' => 'self'
									]
								];

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_relation_index',
									null,
									null,
									null,
									null,
									null,
									null
								);

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_index empty props -> get_diffusion_value (letter-id ddo_map)\n";
								break;
							}

							// 2 "process_dato" present
							$process_dato_ri = $props->process_dato ?? null;

							// 2.1 "process_dato" = "diffusion_sql::map_locator_to_term_id" (or legacy alias)
							if($process_dato_ri
								&& ($process_dato_ri === 'diffusion_sql::map_locator_to_term_id'
									|| $process_dato_ri === 'diffusion_sql::map_locator_to_terminoID'))
							{
								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_term_id'
									]
								];

								$new_props = new stdClass();
									$new_props->process = new stdClass();
									$new_props->process->parser = $parser_process;
									$new_props->process->output_format = 'json';
									$new_props->process->output_sample = ["es1_1"];

								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_index map_locator_to_term_id\n";
								break;
							}

							
							break;
						case 'component_iri':

							$is_empty_iri = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							// 0 empty propiedades: default V6 behavior — delegate to get_diffusion_value() trait
							// The trait builds letter-id ddo_map from related components + parser_text::text_format
							if($is_empty_iri($props)) {

								$ddo_map_iri = [
									(object)[
										'tipo'         => $rel_info['tipo'],
										'section_tipo' => 'self'
									]
								];

								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'component_iri',
									null,
									null,
									null,
									null,
									null,
									null
								);

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] iri empty props -> get_diffusion_value (letter-id ddo_map)\n";
								break;
							}

							// 1 "data_to_be_used" = "dato"
							$data_to_be_used_iri = $props->data_to_be_used ?? null;
							if($data_to_be_used_iri && $data_to_be_used_iri === 'dato') {

								$new_props = new stdClass(); $new_props->process = get_dato(
									'component_iri',
									null,
									null,
									null,
									null
								);

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] iri data_to_be_used=dato -> get_dato()\n";
								break;
							}
							

							break;
						case 'relation_list':

							$is_empty_relation_list = function($props) {
								if (empty($props)) return true;
								$v5_props = is_object($props) ? clone($props) : (object)$props;
								unset($v5_props->source);
								unset($v5_props->varchar);
								unset($v5_props->info);
								unset($v5_props->is_publicable);
								unset($v5_props->ts_map);
								return empty((array)$v5_props);
							};

							$ddo_map_relation_list = [
								(object)[
									'tipo'         => $rel_info['tipo'],
									'section_tipo' => 'self'
								]
							];

							// 0 empty propiedades: default V6 behavior — delegate to get_diffusion_value() trait
							// The trait builds letter-id ddo_map from related components + parser_text::text_format
							if($is_empty_relation_list($props) || ($props->data_to_be_used ?? null) === 'dato_full') {

								$new_props = new stdClass(); $new_props->process = get_dato(
									'relation_list',
									null,
									null,
									null,
									$ddo_map_relation_list
								);

								// 'dato_full' and EMPTY props are NOT the same list in v6.
								// With empty props the inverse references pass through
								// relation_list::get_dato verbatim — one entry per stored relation,
								// so a record citing this one twice is published twice
								// (games/informant dd_relations, nodes dd1756/rsc1055). With
								// 'dato_full' v6 publishes each referencing SECTION once
								// (antropologia/periodos/restringidos, node hierarchy85: zero
								// repeats even where the owner holds six locators to the same
								// target). Treating both alike cost 72 cells one way or 264 the
								// other, depending on which behaviour was hardcoded — flag the
								// dedupe so the engine can honour each.
								if (($props->data_to_be_used ?? null) === 'dato_full') {
									foreach ((array)($new_props->process->ddo_map ?? []) as $ddo_dedupe) {
										$ddo_dedupe->dedupe_sections = true;
									}
								}

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_list empty props -> get_dato (get_locator + relation ddo_map)\n";
								break;
							}

							// 1 data_to_be_used: "custom" or "dato"
							$data_to_be_used_rl = $props->data_to_be_used ?? ($props->process_dato_arguments->data_to_be_used ?? null);
							if($data_to_be_used_rl && ($data_to_be_used_rl === 'custom' || $data_to_be_used_rl === 'dato' || $data_to_be_used_rl === 'filtered_values')) {
								$process_dato_args = $props->process_dato_arguments ?? null;
								// apply filters onto ddo_map[0]
								if ($filter_section_rl = $process_dato_args->filter_section ?? null) {
									$ddo_map_relation_list[0]->section_filter = $filter_section_rl;
								}
								if ($filter_component_rl = $process_dato_args->filter_component ?? null) {
									$ddo_map_relation_list[0]->component_filter = $filter_component_rl;
								}
								
								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'relation_list',
									$props->custom_arguments ?? null,
									$props->process_dato_arguments ?? null,
									$props->output ?? null,
									$data_to_be_used_rl,
									null,
									$ddo_map_relation_list
								);

								// preserve_order: v6 "merged" output of an inverse relation_list keeps the RAW
								// reference order with duplicate target ids INTERLEAVED (not grouped by section_id).
								// Signal dd_diffusion_api to skip the section_id merge (e.g. mints relations_coins).
								$rl_output_po = $process_dato_args->output ?? ($props->output ?? null);
								if ($rl_output_po === 'merged') { $new_props->process->preserve_order = true; }

								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}

								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_list data_to_be_used={$data_to_be_used_rl} -> get_diffusion_value()\n";
								break;
							}
							
							// 2 no process_dato + format=section_id in process_dato_arguments
							$process_dato_rl   = $props->process_dato ?? null;
							$process_dato_args = $props->process_dato_arguments ?? null;
							$format_rl         = $process_dato_args->format ?? null;
							
							if (!$process_dato_rl && $format_rl === 'section_id') {
							
								// apply filters onto ddo_map[0]
								if ($filter_section_rl = $process_dato_args->filter_section ?? null) {
									$ddo_map_relation_list[0]->section_filter = $filter_section_rl;
								}
								if ($filter_component_rl = $process_dato_args->filter_component ?? null) {
									$ddo_map_relation_list[0]->component_filter = $filter_component_rl;
								}
							
								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'relation_list',
									null,
									$process_dato_args,
									null,
									'section_id',
									null,
									$ddo_map_relation_list
								);
							
								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
							
								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}
							
								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_list format=section_id -> parser_locator::get_section_id\n";
								break;
							}
							
							// 3 process_dato=diffusion_sql::resolve_value + component_method=get_diffusion_value
							$component_method_rl = $process_dato_args->component_method ?? null;
						
							if ($process_dato_rl === 'diffusion_sql::resolve_value'
								&& $component_method_rl === 'get_diffusion_value'
								&& !isset($process_dato_args->custom_arguments)) {
							
								// apply filters onto ddo_map[0]
								if ($filter_section_rl = $process_dato_args->filter_section ?? null) {
									$ddo_map_relation_list[0]->section_filter = $filter_section_rl;
								}
								if ($filter_component_rl = $process_dato_args->filter_component ?? null) {
									$ddo_map_relation_list[0]->component_filter = $filter_component_rl;
								}							
							
								$new_props = new stdClass(); $new_props->process = get_diffusion_value(
									$rel_info['tipo'],
									'relation_list',
									null,
									$process_dato_args,
									null,
									'resolve_value',
									null,
									$ddo_map_relation_list
								);

								$output_rl = $props->process_dato_arguments->output ?? null;

								if($output_rl === 'merged'){
									$new_props->process->output_format = 'json';
								}
							
								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
							
								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}
							
								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_list resolve_value+get_diffusion_value -> component_select resolution\n";
								break;
							}

							// 4
							if ($process_dato_rl === 'diffusion_sql::resolve_value'
								&& $component_method_rl === 'get_diffusion_dato'
								&& !isset($process_dato_args->custom_arguments)) {
							
								// apply filters onto ddo_map[0]
								if ($filter_section_rl = $process_dato_args->filter_section ?? null) {
									$ddo_map_relation_list[0]->section_filter = $filter_section_rl;
								}
								if ($filter_component_rl = $process_dato_args->filter_component ?? null) {
									$ddo_map_relation_list[0]->component_filter = $filter_component_rl;
								}
								// target_component_tipo
								$target_component_tipo = $process_dato_args->target_component_tipo ?? null;
								
								$model_rl = ontology_node::get_legacy_model_by_tipo($target_component_tipo);
								$new_props = new stdClass(); $new_props->process = get_diffusion_dato(
									$model_rl,
									null,
									$process_dato_args,
									null
								);

								// add target component to ddo_map
								$ddo_map_relation_list[] = (object)['tipo' => $target_component_tipo, 'parent' => $rel_info['tipo']];
								$new_props->process->ddo_map = $ddo_map_relation_list;

								// v6 get_diffusion_dato groups the target section_ids per source
								// reference (dataframe id reset) → JSON arrays joined by " | "
								// (e.g. ["75"] | ["75"]). output "merged" flattens into one union.
								$output_rl = $process_dato_args->output ?? null;
								if ($output_rl !== 'merged') {
									$new_props->process->parser = [
										(object)['fn' => 'parser_locator::get_section_id_grouped']
									];
									$new_props->process->output_format = 'string';
								} else {
									$new_props->process->output_format = 'json';
								}
							
								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
							
								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}
							
								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_list resolve_value+get_diffusion_value -> component_select resolution\n";
								break;
							}
							
							// 5 process_dato=diffusion_sql::resolve_value + component_method=get_diffusion_resolve_value + custom_arguments
							// Same pattern as component_portal: while-loop walks the nested chain, dispatches to the correct V1 trait
							// $component_method_rl and $process_dato_rl already set above
							if ($process_dato_rl === 'diffusion_sql::resolve_value'
								&& $component_method_rl === 'get_diffusion_resolve_value'
								&& isset($process_dato_args->custom_arguments)) {
							
								// apply filters onto ddo_map[0]
								if ($filter_section_rl = $process_dato_args->filter_section ?? null) {
									$ddo_map_relation_list[0]->section_filter = $filter_section_rl;
								}
								if ($filter_component_rl = $process_dato_args->filter_component ?? null) {
									$ddo_map_relation_list[0]->component_filter = $filter_component_rl;
								}
							
								// Walk the chain (same logic as component_portal)
								$final_method_rl       = null;
								$parent_tipo_rl        = $rel_info['tipo'];
								$args_node_rl          = $process_dato_args;
								$final_target_rl       = null;
								$final_args_rl         = null;
								$check_merge_rl        = $process_dato_args->output ?? null;
								$first_hop_rl          = true;
							
								while ($args_node_rl) {
									$method_rl = $args_node_rl->component_method ?? null;
									$target = $args_node_rl->target_component_tipo ?? null;
							
									if ($target) {
										$entry_rl = (object)['tipo' => $target, 'parent' => $parent_tipo_rl];
										$ddo_map_relation_list[] = $entry_rl;
										$parent_tipo_rl = $target;
										$first_hop_rl = false;
										$final_target_rl =$target;
									}
							
									if ($method_rl === 'get_diffusion_value' || $method_rl === 'get_dato' || $method_rl === 'get_diffusion_dato') {
										$final_method_rl = $method_rl;
										$final_args_rl   = $args_node_rl;
									} else if ($method_rl === 'get_diffusion_resolve_value' && isset($args_node_rl->custom_arguments)) {
										$final_method_rl = $method_rl;
										$final_args_rl   = $args_node_rl;
										// Stop when non-relation component found with get_diffusion_value (same as component_portal L1945-1947)
										// foreach ($args_node_rl->custom_arguments as $curr_ca_rl) {
										// 	$curr_target_rl = $curr_ca_rl->process_dato_arguments->target_component_tipo ?? null;
										// 	$curr_method_rl = $curr_ca_rl->process_dato_arguments->component_method ?? null;
										// 	if (isset($curr_target_rl)) {
										// 		$curr_model_rl = ontology_node::get_model_by_tipo($curr_target_rl);
										// 		if ($curr_model_rl === 'component_date') { break; }
										// 		// if ($curr_method_rl === 'get_diffusion_value'
										// 		// 	&& !in_array($curr_model_rl, component_relation_common::get_components_with_relations())) {
										// 		// 		break 2;
										// 		// 	}
										// 	}
										// }
									}
									
									$ca_rl = $args_node_rl->custom_arguments[0] ?? null;
									if ($ca_rl && isset($ca_rl->process_dato_arguments)) {
										$args_node_rl = $ca_rl->process_dato_arguments;
										$args_node_rl = $ca_rl->process_dato_arguments;
									} else if ($ca_rl && isset($ca_rl->process_dato) && $ca_rl->process_dato === 'diffusion_sql::resolve_value') {
										$args_node_rl = $ca_rl->process_dato_arguments ?? null;
									} else {
										break;
									}
								}
							
								// Dispatch to the correct V1 trait based on final_method_rl
								if ($final_method_rl === 'get_dato') {
									$model_rl = ontology_node::get_legacy_model_by_tipo($final_target_rl);
									$output_rl = $final_args_rl->output ?? null;
									$output_options_rl = $final_args_rl->output_options ?? null;
									$new_props = new stdClass(); $new_props->process = get_dato(
										$model_rl, null, $output_rl, $output_options_rl, $ddo_map_relation_list
									);
								} else if ($final_method_rl === 'get_diffusion_dato') {
									$new_props = new stdClass(); $new_props->process = get_diffusion_dato(
										$final_target_rl, null, $final_args_rl, null
									);
									if ($ddo_map_relation_list !== []) { $new_props->process->ddo_map = $ddo_map_relation_list; }
								} else { // get_diffusion_value or fallback
									$model_rl = ontology_node::get_legacy_model_by_tipo($final_target_rl);
									$output_rl = $final_args_rl->output ?? null;
									$new_props = new stdClass(); $new_props->process = get_diffusion_value(
										$final_target_rl,
										$model_rl,
										[(object)[]],
										$final_args_rl,
										$output_rl,
										null, null,
										$ddo_map_relation_list
									);
									// Append parser_helper::merge step based on inner pda output
									$split_str_rl = $final_args_rl->split_string_value ?? ' | ';

									if($model_rl === 'component_input_text'){
										$new_props->process->ddo_map = array_merge($ddo_map_relation_list, $new_props->process->ddo_map ?? []);
									}
								
									if ($output_rl === 'merged') {
										// pipe: group by section_id, each section group as JSON array
										$new_props->process->parser = (object)[
											'fn'      => 'parser_helper::merge',
											'options' => (object)[
												'merge'             => 'pipe',
												'records_separator' => $split_str_rl
											]
										];
										$new_props->process->output_format = 'json';
									} else if ($output_rl === 'merged_unique' || $output_rl === 'merged_unique_implode') {
										// unique: deduplicate the values (v6 merged_unique[_implode]).
										// _implode joins to a single string; plain merged_unique stays an array.
										// The implode flag may live on the OUTER process_dato_arguments
										// (the inner custom_arg often carries plain merged_unique).
										$outer_output_rl = $props->process_dato_arguments->output ?? null;
										$is_implode = ($output_rl === 'merged_unique_implode' || $outer_output_rl === 'merged_unique_implode');
										$merge_opts = (object)[
											'merge'             => 'unique',
											'records_separator' => $split_str_rl
										];
										if ($is_implode) { $merge_opts->implode = true; }
										$new_props->process->parser = (object)[
											'fn'      => 'parser_helper::merge',
											'options' => $merge_opts
										];
										$new_props->process->output_format = $is_implode ? 'string' : 'json';
									} else {
										// string: flat concatenation
										$new_props->process->parser = (object)[
											'fn'      => 'parser_helper::merge',
											'options' => (object)[
												'merge'             => 'string',
												'records_separator' => $split_str_rl
											]
										];
										$new_props->process->output_format = 'string';
									}

									if($model_rl==='component_select'){
										// add the merge to pipe
										$new_props->process->parser =  (object)[
											'fn' => 'parser_helper::merge'
										];
										$new_props->process->output_format = 'json';
									}

									
								}
							
								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
							
								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}
							
								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_list resolve_value_deep (portal pattern) -> chain walk\n";
								break;
							}

							// 6 "process_dato": "diffusion_sql::resolve_value" and "component_method": "get_dato"
							if ($process_dato_rl === 'diffusion_sql::resolve_value' 
								&& $component_method_rl === 'get_dato'
								&& !isset($process_dato_args->custom_arguments)) {
							
								// apply filters onto ddo_map[0]
								if ($filter_section_rl = $process_dato_args->filter_section ?? null) {
									$ddo_map_relation_list[0]->section_filter = $filter_section_rl;
								}
								if ($filter_component_rl = $process_dato_args->filter_component ?? null) {
									$ddo_map_relation_list[0]->component_filter = $filter_component_rl;
								}

								$target = $process_dato_args->target_component_tipo ?? null;
								
								$model_rl = ontology_node::get_legacy_model_by_tipo($target);
								
								if($model_rl === 'component_date'){
									$output =  "split_date_range";
								}
							
								$new_props = new stdClass(); $new_props->process = get_dato(
									$model_rl,
									null,
									$output ?? null,
									$process_dato_args->process_dato_arguments->options ?? null,
									$ddo_map_relation_list
								);

								$new_props->process->ddo_map[] = (object)[
									'tipo' => $target,
									'parent' => $rel_info['tipo']
								];

								$output_rl = $props->process_dato_arguments->output ?? null;

								if($output_rl === 'merged'){
									$new_props->process->output_format = 'json';
								}
							
								// "is_publicable" = true
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
							
								// "varchar" = 256
								if(isset($props->varchar)){
									$new_props->varchar = $props->varchar;
								}
							
								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] relation_list resolve_value+get_diffusion_value -> component_select resolution\n";
								break;
								break;
							}

							break;
						}
				}
			}
		}

	// Attach the split_data slice to the ddo whose locators v6 filtered — the field's own
	// relation. The default branch often emits NO ddo_map at all (the chain relies on the
	// auto-generated one from the node's relations), so the entry is created when missing.
	// Getting this wrong is not academic: an earlier attempt attached the slice only when a
	// ddo_map already existed, which silently did nothing for those nodes while removing the
	// parser that had been standing in — publications.author_others went from 108 mismatching
	// cells to 636.
	if ($split_data_slice !== null && isset($new_props) && $new_props && isset($new_props->process)) {
		if (!isset($new_props->process->ddo_map) || !is_array($new_props->process->ddo_map)
			|| count($new_props->process->ddo_map) === 0) {
			$new_props->process->ddo_map = [
				(object)['tipo' => $rel_info['tipo'] ?? $tipo, 'section_tipo' => 'self']
			];
		}
		$new_props->process->ddo_map[0]->data_slice = $split_data_slice;
		$slice_desc = 'offset ' . $split_data_slice->offset
			. (isset($split_data_slice->length) ? ', length ' . $split_data_slice->length : ', to end');
		echo "{$indent}  [RULE APPLIED] diffusion_sql::split_data -> ddo data_slice ({$slice_desc})\n";
	}

	// GLOBAL RULE: merge_columns
	if (isset($props->merge_columns)) {
		$parser_process = (object)[
			'fn' => 'parser_global::merge_columns',
			'options' => (object)[
				'columns' => is_array($props->merge_columns) ? $props->merge_columns : [$props->merge_columns]
			]
		];
		if (isset($props->separator)) {
			$parser_process->options->fields_separator = $props->separator;
		}

		if (!$new_props) {
			$new_props = new stdClass();
		}
		if (!isset($new_props->process)) {
			$new_props->process = new stdClass();
		}
		$new_props->process->parser = [$parser_process];

		echo "{$indent}- [$tipo] " . ($model_name ? $model_name : "NO_MODEL") . " (merge_columns)\n";
		echo "{$indent}  [RULE APPLIED] merge_columns mapped to parser_global::merge_columns\n";
	}

	// GLOBAL RULE: diffusion::get_publication_unix_timestamp
	if (isset($props->process_dato) && $props->process_dato === 'diffusion::get_publication_unix_timestamp') {
		$parser_process = (object)[
			'fn' => 'parser_global::publication_unix_timestamp'
		];

		if (!$new_props) {
			$new_props = new stdClass();
		}
		if (!isset($new_props->process)) {
			$new_props->process = new stdClass();
		}
		$new_props->process->parser = [$parser_process];
		// Optional: if Dédalo expects int output globally we can set it:
		$new_props->process->output_format = 'json';

		echo "{$indent}- [$tipo] " . ($model_name ? $model_name : "NO_MODEL") . " (publication_unix_timestamp)\n";
		echo "{$indent}  [RULE APPLIED] mapped to parser_global::publication_unix_timestamp\n";
	}

	// Process result and save
	if (
		$new_props 
		|| (isset($props->exclude_column) && $props->exclude_column)
		|| isset($props->info)
		|| isset($props->is_publicable)
		|| isset($props->merge_columns)
		|| isset($props->varchar)
		|| isset($props->length)
		|| (isset($props->process_dato) && $props->process_dato === 'diffusion::get_publication_unix_timestamp')
	) {
		if (!$new_props) {
			$new_props = new stdClass();
		}
		
		// GLOBAL RULE: Exclude Column
		if (isset($props->exclude_column) && $props->exclude_column) {
			$new_props->exclude_column = true;
		}

		// GLOBAL RULE: Info
		if (isset($props->info)) {
			$new_props->info = $props->info;
		}

		// GLOBAL RULE: is_publicable -> is_publishable
		if (isset($props->is_publicable)) {
			$new_props->is_publishable = $props->is_publicable;
		}

		// GLOBAL RULE: resolve_value filters unpublishable locators
	// v6 diffusion_sql::resolve_value (:5034-5041) skips every locator failing
	// diffusion::get_is_publicable, UNLESS process_dato_arguments.is_publicable overrides it.
	// The generic v6 chain walk does NOT filter, and v7 mirrors that with a value-source
	// exemption — so the stricter rule has to be marked per COLUMN, not switched on engine-wide.
	// Measured: disabling the exemption globally fixed publications.editorial (124 cells) but
	// broke eight previously-perfect columns, so it is emitted only for resolve_value chains
	// that carry no is_publicable override.
	if (is_object($props)
		&& ($props->process_dato ?? null) === 'diffusion_sql::resolve_value'
		&& !isset($props->process_dato_arguments->is_publicable)
		&& isset($new_props)
		&& $new_props
		&& isset($new_props->process)) {
		$new_props->process->filter_unpublishable = true;
	}

	// GLOBAL RULE: field_enum default value
	// v6 NEVER publishes NULL from a field_enum column. class.diffusion_sql.php :1668-1676 is
	// explicit: "if (empty($dato) || ($dato!=='1' && $dato!=='2')) { $dato = 2; // Value 'No'
	// default }", then it publishes enum[$dato]. So an empty enum component still yields the
	// key-2 label. This is a property of the COLUMN MODEL, not of any one component, so it is a
	// global rule rather than a per-branch one — ts_web.menu published NULL against v6's "no"
	// while its component (mht153) is absent from BOTH databases.
	if ($model_name === 'field_enum'
		&& isset($props->enum)
		&& isset($props->enum->{'2'})
		&& isset($new_props)
		&& $new_props
		&& isset($new_props->process)
		&& !isset($new_props->process->default_value)) {
		$new_props->process->default_value = $props->enum->{'2'};
	}

	// GLOBAL RULE: column length (varchar / length)
		// v7 reads properties.varchar (else properties.length) to size the column; without this
		// the length is lost and the column falls back to the engine default. A node whose ONLY
		// v6 propiedad is a length matched NO mapping branch, so it used to be skipped entirely:
		// v6 `code` varchar(256) came out as v7 varchar(255). Never overwrite a length a mapping
		// branch already set from a more specific source.
		if (isset($props->varchar) && !isset($new_props->varchar)) {
			$new_props->varchar = $props->varchar;
		}
		if (isset($props->length) && !isset($new_props->varchar) && !isset($new_props->length)) {
			$new_props->length = $props->length;
		}

		echo "{$indent}  V6: " . json_encode($props) . "\n";
		echo "{$indent}  V7: " . json_encode($new_props) . "\n";

		save_node([
			'tipo' => $tipo,
			'properties' => $new_props
		]);

		return;
	}

	// COVERAGE DIAGNOSTIC
	// The node carries v6 `propiedades` but matched no mapping branch and none of the global
	// rules above: nothing at all was written for it and, until now, nothing was printed either,
	// so a gap in this migration was invisible. Reported (and counted) as a WARNING — an
	// unmapped node is a mapping still to be written, not a failed migration.
	if (!empty($props) && (is_object($props) || is_array($props)) && count((array)$props) > 0) {
		$related_model = $relations_info[0]['model'] ?? 'NO_RELATION';
		echo "{$indent}[UNMAPPED] $tipo " . ($model_name ? $model_name : 'NO_MODEL')
			. " $related_model " . json_encode($props) . "\n";
		$GLOBALS['migrate_diffusion_unmapped'] = (int)($GLOBALS['migrate_diffusion_unmapped'] ?? 0) + 1;
	}
}



// Execution
// ONLY when this file IS the entry script (php .../migrate_diffusion_properties.php, i.e. the way
// run/phase3_diffusion.php launches it). Helpers such as helpers/migrate_subtree.php require_once
// this file for its functions: without the guard, the WHOLE diffusion tree was migrated at include
// time, before the subtree the helper actually asked for.
// MIGRATE_DIFFUSION_NO_AUTORUN, defined before the include, suppresses it in any case.
$is_direct_run = isset($argv[0]) && realpath($argv[0]) === realpath(__FILE__);
if ($is_direct_run && !defined('MIGRATE_DIFFUSION_NO_AUTORUN')) {
	try {
		traverse_ontology_recursive($root_tipo);
		echo "\nTotal nodes processed: $total_nodes\n";
		if (MIGRATE_DIFFUSION_DRY_RUN) {
			echo "DRY RUN complete: " . (int)($GLOBALS['dry_run_pending'] ?? 0)
				. " node(s) would be written. Nothing was changed.\n";
			echo "Re-run without --dry-run to apply.\n";
		}
	} catch (Exception $e) {
		echo "Error: " . $e->getMessage() . "\n";
		$GLOBALS['migrate_diffusion_failures'] = (int)($GLOBALS['migrate_diffusion_failures'] ?? 0) + 1;
	}
}


/**
* DIFFUSION_CANONICAL_JSON
* Order-insensitive JSON encoding, used to compare a written value with the one read back.
* Maps (objects / associative arrays) get their keys sorted; LISTS keep their order, since
* the order of a parser chain or a ddo_map is part of the meaning.
*
* @param mixed $value
* @return string
*/
function diffusion_canonical_json($value) : string {

	$canonical = static function($v) use (&$canonical) {
		if (is_object($v)) {
			$v = (array)$v;
		}
		if (is_array($v)) {
			$is_list = ($v === [] || array_keys($v) === range(0, count($v) - 1));
			$out = [];
			foreach ($v as $k => $item) {
				$out[$k] = $canonical($item);
			}
			if (!$is_list) {
				ksort($out);
			}
			return $out;
		}
		return $v;
	};

	return (string) json_encode($canonical($value));
}//end diffusion_canonical_json



function save_node($node_info) {

	$tipo    = $node_info['tipo'];
	$tld     = get_tld_from_tipo($tipo);

	// Check for empty object and convert to null
	$val = $node_info['properties'];
	if (is_object($val) && count((array)$val) === 0) {
		$val = null;
	}

	// --- LEGACY v5 (<br>) COMPATIBILITY ---
	// PHP component_text_area::get_diffusion_data now ONLY decodes entities; the obsolete v5
	// markup normalization (<p>→<br>, strip </p>, leading/trailing <br>, &nbsp;/trim) lives in
	// the OPT-IN parser parser_text::v5_html. Any MIGRATED column whose chain resolves a
	// text_area / html_text source gets v5_html PREPENDED so it keeps its current <br> output
	// (so [v5_html, text_format] composes — v5_html preserves the ddo id). New v7-native columns
	// are not migrated → no v5_html → they keep <p> paragraphs (compat, never an obligation).
	if (is_object($val) && isset($val->process->ddo_map) && is_array($val->process->ddo_map)) {
		$resolves_text_area = false;
		foreach ($val->process->ddo_map as $ddo_e) {
			$src_tipo = $ddo_e->tipo ?? null;
			if (!empty($src_tipo)) {
				$src_model = ontology_node::get_model_by_tipo($src_tipo);
				if ($src_model === 'component_text_area' || $src_model === 'component_html_text') {
					$resolves_text_area = true;
					break;
				}
			}
		}
		if ($resolves_text_area) {
			$parser = $val->process->parser ?? [];
			if (!is_array($parser)) { $parser = [$parser]; }
			$has_v5 = false;
			foreach ($parser as $pp) {
				if (($pp->fn ?? '') === 'parser_text::v5_html') { $has_v5 = true; break; }
			}
			if (!$has_v5) {
				array_unshift($parser, (object)['fn' => 'parser_text::v5_html']);
				$val->process->parser = $parser;
			}
		}
	}

	// --- DRY RUN: stop before the two writes and their read-back verification ---
	// The caller has already printed this node's "V6: … / V7: …" pair, so the reviewer
	// sees exactly what would be stored. $val is reported here because it is the final
	// value AFTER the normalizations above (empty object → null, v5_html prepend).
	if (defined('MIGRATE_DIFFUSION_DRY_RUN') && MIGRATE_DIFFUSION_DRY_RUN === true) {
		$GLOBALS['dry_run_pending'] = ($GLOBALS['dry_run_pending'] ?? 0) + 1;
		echo "  [DRY RUN] would write dd_ontology.properties for $tipo: " . json_encode($val) . "\n";
		return;
	}

	// --- PRIMARY: Write directly to dd_ontology.properties ---
	// dd_diffusion_api reads from dd_ontology (the fast-lookup flat store) via
	// dd_ontology_db_manager::read(), NOT from the UI matrix data.
	// So we must update dd_ontology directly for the diffusion engine to pick up the change.
	$dd_update_result = dd_ontology_db_manager::update($tipo, (object)['properties' => $val]);
	if (!$dd_update_result) {
		echo "  [WARN] dd_ontology update failed for $tipo\n";
	}

	// Invalidate static instance cache so fresh reads reflect the new value
	if (isset(ontology_node::$instances[$tipo])) {
		unset(ontology_node::$instances[$tipo]);
	}
	if (isset(dd_ontology_db_manager::$load_cache[$tipo])) {
		unset(dd_ontology_db_manager::$load_cache[$tipo]);
	}

	// --- SECONDARY: Also save via UI component path (matrix_ontology) for consistency ---
	$section_tipo = $tld.'0';
	$section_id = get_section_id_from_tipo($tipo);

	$component_tipo = 'ontology18';
	$model = ontology_node::get_model_by_tipo($component_tipo,true);
	$properties_component = component_common::get_instance(
		$model, 
		$component_tipo, 
		$section_id, 
		'list', 
		DEDALO_DATA_NOLAN, 
		$section_tipo
	);

	$data = [(object)[
		'value' => $val
	] ];

	$properties_component->set_data($data);
	$properties_component->save();

	// Unit Test: Verify data was saved to dd_ontology (primary source)
	// Compare CANONICALLY. The round trip (dd_ontology write → component save → re-read)
	// legitimately returns the same object with its keys in a different order, and a raw
	// json_encode() comparison called that a mismatch: a real migration reported 442 of 744
	// nodes as failures when every one of them was byte-equivalent modulo key order.
	// Object keys are sorted; LIST order is preserved, because reordering a parser chain or
	// a ddo_map would be a genuine difference.
	$fresh = ontology_node::get_instance($tipo);
	$fresh->load_data();
	$saved_val = $fresh->get_properties();

	$input_data_json = json_encode($val);
	$saved_json      = json_encode($saved_val);

	if (diffusion_canonical_json($val) === diffusion_canonical_json($saved_val)) {
		echo "  [TEST PASS] Data verified for $tld (dd_ontology)\n";
	} else {
		// The tipo is part of the message on purpose: a tld is shared by hundreds of nodes, so
		// "[TEST FAIL] … for numisdata" alone does not say WHICH node did not round-trip.
		echo "  [TEST FAIL] dd_ontology Mismatch for $tipo (tld $tld)\n";
		echo "    Expected: $input_data_json\n";
		echo "    Actual:   $saved_json\n";
		$GLOBALS['migrate_diffusion_failures'] = (int)($GLOBALS['migrate_diffusion_failures'] ?? 0) + 1;
	}
}



function get_ddo_map($current_tipo) {
	if (!$current_tipo) return null;

	$node = ontology_node::get_instance($current_tipo);
	if (!$node) return null;

	$ddo_map = [];

	// 2. Process relations
	$relations = $node->get_relations();
	$rels = is_string($relations) ? json_decode($relations) : $relations;

	if ($rels && is_array($rels) && count($rels) > 0) {
		foreach ($rels as $rel) {
			$rel_tipo = is_object($rel) ? $rel->tipo : $rel;

			$rel_model = ontology_node::get_model_by_tipo($rel_tipo);
			if(str_starts_with($rel_model, 'component_')) {						
		
				// 1. Add current node
				$ddo_map[] = (object)[
					'tipo' => $rel_tipo,
					'section_tipo' => 'self'
				];
												
				$section_tipo = ontology_node::get_ar_tipo_by_model_and_relation($rel_tipo, 'section', 'related')[0] ?? null;
				
				if(!empty($section_tipo)){
					$ar_component_tipo = ontology_node::get_ar_tipo_by_model_and_relation($rel_tipo, 'component', 'related');
					foreach ($ar_component_tipo as $component_tipo) {
						
						// 3. Add relation entry
						$ddo_map[] = (object)[
							'section_tipo' => $section_tipo,
							'tipo'         => $component_tipo,
							'parent'       => $rel_tipo
						];
					}
				}
				
			}
		}
	}

	return count($ddo_map) > 0 ? $ddo_map : null;
}


	/**
	* FORCE_LOGIN
	* @param int $user_id
	* @return void
	*/
	function force_login($user_id) : void {

		// check is development server. if not, throw to prevent malicious access
			if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
				throw new Exception("Error. Only development servers can use this method", 1);
				die();
			}

		// user
			$username		= 'test ' . $user_id;
			$full_username	= 'test user ' . $user_id;

		// dd_init_test
			$init_response = require DEDALO_CORE_PATH.'/base/dd_init_test.php';
			if ($init_response->result===false) {
				debug_log(__METHOD__
					." Init test error (dd_init_test): ". PHP_EOL
					.' init_response: ' . $init_response->msg
					, logger::ERROR
				);
			}

		// is_global_admin (before set user session vars)
			$is_global_admin = (bool)security::is_global_admin($user_id);
			$_SESSION['dedalo']['auth']['is_global_admin'] = $is_global_admin;

		// is_developer (before set user session vars)
			$is_developer = (bool)security::is_developer($user_id);
			$_SESSION['dedalo']['auth']['is_developer'] = $is_developer;

		// session : If backup is OK, fix session data
			$_SESSION['dedalo']['auth']['user_id']			= $user_id;
			$_SESSION['dedalo']['auth']['username']			= $username;
			$_SESSION['dedalo']['auth']['full_username']	= $full_username;
			$_SESSION['dedalo']['auth']['is_logged']		= 1;

		// config key
			// SEC-082: AES-256-GCM (authenticated) replacement for legacy CBC.
			$_SESSION['dedalo']['auth']['salt_secure'] = dedalo_encrypt_v2(DEDALO_SALT_STRING);

		// login_type
			$_SESSION['dedalo']['auth']['login_type'] = 'default';

		// dedalo_lock_components unlock
			if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
				lock_components::force_unlock_all_components($user_id);
			}

		// precalculate profiles datalist security access in background
		// This file is generated on every user login, launching the process in background
			if (defined('DEDALO_CACHE_MANAGER') && isset(DEDALO_CACHE_MANAGER['files_path'])) {
				$cache_file_name = component_security_access::get_cache_tree_file_name(DEDALO_APPLICATION_LANG);
				dd_cache::process_and_cache_to_file((object)[
					'process_file'	=> DEDALO_CORE_PATH . '/component_security_access/calculate_tree.php',
					'data'			=> (object)[
						'session_id'	=> session_id(),
						'user_id'		=> $user_id,
						'lang'			=> DEDALO_APPLICATION_LANG
					],
					'file_name'		=> $cache_file_name,
					'wait'			=> false
				]);
			}

		// login activity report
			login::login_activity_report(
				"User $user_id is logged. Hello $username",
				'LOG IN',
				null
			);
	}//end force_login