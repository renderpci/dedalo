<?php

use PhpParser\Node\Stmt\Switch_;
use Symfony\Component\Console\Formatter\NullOutputFormatter;
/**
 * Migration Script: Diffusion Ontology Properties (v6 -> v7)
 * 
 * Usage: php diffusion/migration/migrate_diffusion_properties.php
 */

// Bootstrap
$config_path = dirname(dirname(__DIR__)) . '/config/config.php';
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

force_login(-1);

$root_tipo = DEDALO_DIFFUSION_TIPO; // Diffusion Root
echo "Starting migration analysis from root: $root_tipo\n";

// Global counter
$total_nodes = 0;

function traverse_ontology_recursive($current_tipo, $level = 0) {
	global $total_nodes;
    $total_nodes++;
    
    $model = ontology_node::get_model_by_tipo($current_tipo);
    $term = ontology_node::get_term_by_tipo($current_tipo, DEDALO_DATA_LANG);
    echo "\nProcessing [{$current_tipo}] {$model} ({$term})...\n";
    
	$children = ontology_node::get_ar_children($current_tipo);
	// Process current node
	$node = ontology_node::get_instance($current_tipo);
	if ($node) {
		process_node($node, $level);
		$total_nodes++;
	} else {
		echo "Error: Could not load node $current_tipo\n";
		return;
	}
	
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
									'fn' => 'parser_locator::get_section_id',
									'id' => 'a'
								],
								(object)[
									'fn' => 'parser_helper::get_first',
									'id' => 'a'
								],
								(object)[
									'fn' => 'parser_text::map_value',
									'options' => (object)[
										'map' => [
											(object)[
												'a' => $props->enum
											]
										]
									]
								]
							];

							$new_props = new stdClass();
							$new_props->process = new stdClass();
							$new_props->process->parser = $parser_process;
							$new_props->process->output_sample = "Yes";

							echo "{$indent}- [$tipo] $model_name\n";
							echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";							
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

							// 0 emtpy propiedades
							if($is_empty($props)) {

								$parser_process = (object)[
									'fn' => 'add_parents',
									'parser' => [
										(object)[
											'fn' => 'parser_locator::parents',
											'options' => (object)[
												'value' => 'term',
												'fields_separator' => $props->source->divisor ?? ' - ',
												'records_separator' => $props->source->records_separator ?? ', '
											]
										]
									],
									'output_format' => 'string'
								];

								$new_props = new stdClass();
									$new_props->process = new stdClass();
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
									$new_props->process = new stdClass();
									$new_props = new stdClass();
									$new_props->process = $parser_process;
									$new_props->process->output_sample = 2;

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
								if(isset($value_to_extract)){
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

								// // 2.4.5 "component_method" = "get_dato" && output" = "split_date_range" && "output_options
								// if($component_method === "get_dato" && !isset($custom_arguments) && $output === "split_date_range" && isset($output_options)){

								// 	$date_format 	= $output_options->date_format ?? "year";
								// 	$selected_key 	= $output_options->selected_key ?? 0;
								// 	$selected_date 	= $output_options->selected_date ?? "start";

								// 	$select = [$selected_date];
								// 	$keys = [$selected_key];
									
								// 	// date_format
								// 		switch ($date_format) {
								// 			case 'year':
								// 				$pattern	= "Y";												
								// 				break;
								// 			case 'unix_timestamp':
								// 				$pattern	= "unix_timestamp";
								// 				break;
								// 			case 'time':
								// 				$pattern	= "H:i:s";
								// 				break;
								// 			case 'date':
								// 				$pattern	= "Y-m-d";
								// 				break;
								// 			case 'full':
								// 			default:
								// 				$pattern	= "Y-m-d H:i:s";
								// 				break;
								// 		}
										
								// 	$parser_process = [
								// 		(object)[											
								// 			'parser' => [
								// 				(object)[
								// 					'fn' => 'parser_date::string_date',
								// 					'options' => (object)[
								// 						'select' => $select,
								// 						'keys' => $keys,
								// 						'pattern' => $pattern
								// 					]
								// 				]
								// 			],
								// 			'output_format' => 'string'							
								// 		]
								// 	];

								// 	$new_props = new stdClass();
								// 		$new_props->process = new stdClass();
								// 		$new_props->process = $parser_process;
								// 		$new_props->process->ddo_map = $ddo_map;
								// 		$new_props->process->output_sample = "Emproion | Arse";

								// 	// "is_publicable" = true
								// 	if(isset($is_publicable) && $is_publicable === true){
								// 		$new_props->is_publishable = $is_publicable;
								// 	}

								// 	// "varchar" = 256
								// 	if(isset($varchar)){
								// 		$new_props->varchar = $props->varchar;
								// 	}

								// 	echo "{$indent}- [$tipo] $model_name\n";
								// 	echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
								// 	break;
									
								// }

								// 2.4.6 "component_method" = "get_diffusion_resolve_value" && isset($custom_arguments)
								// second deep component
								if($component_method === "get_diffusion_resolve_value" && isset($custom_arguments)){

									$first_custom_arg = is_array($custom_arguments) ? ($custom_arguments[0] ?? null) : $custom_arguments;
									$process_dato_arguments_2 = $first_custom_arg->process_dato_arguments ?? null;
									if ($process_dato_arguments_2) {
										$component_method_2 = $process_dato_arguments_2->component_method;
										$target_component_tipo_2 = $process_dato_arguments_2->target_component_tipo;
										$output_2 = $process_dato_arguments_2->output;
										$output_options_2 = $process_dato_arguments_2->output_options;
											// $date_format_2 = $output_options_2->date_format;
											// $selected_key_2 = $output_options_2->selected_key;
											// $selected_date_2 = $output_options_2->selected_date;
										$empty_value_2 = $process_dato_arguments_2->empty_value;
										$is_publicable_2 = $process_dato_arguments_2->is_publicable;
										$process_dato_2 = $process_dato_arguments_2->process_dato ?? null;
										$fallback_2 = $process_dato_arguments_2->fallback ?? null;
											// $tipo_2 = $fallback_2->tipo;
											// $method_2 = $fallback_2->method;
										$target_component_properties_2 = $process_dato_arguments_2->target_component_properties ?? null;
											// $separator_rows_2 = $target_component_properties_2->separator_rows ?? null;
											$data_to_be_used_2 = $target_component_properties_2->data_to_be_used ?? null;
											// $separator_fields_2 = $target_component_properties_2->separator_fields ?? null;
										$divisor_2 = $process_dato_arguments_2->divisor ?? null;
										
										$process_dato_arguments_3 = $process_dato_arguments_2->process_dato_arguments;
											// $dato_3 = $process_dato_arguments_3->dato;
											// $options_3 = $process_dato_arguments_3->options;
										
										$custom_parents_2 = $process_dato_arguments_2->custom_parents;

										$custom_arguments_2 = $process_dato_arguments_2->custom_arguments;


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
											$component_method_3 = $process_dato_arguments_3->component_method;
											$target_component_tipo_3 = $process_dato_arguments_3->target_component_tipo;
											$output_3 = $process_dato_arguments_3->output;
											$output_options_3 = $process_dato_arguments_3->output_options;

											$empty_value_3 = $process_dato_arguments_3->empty_value ?? null;
											$is_publicable_3 = $process_dato_arguments_3->is_publicable ?? null;
											$process_dato_3 = $process_dato_arguments_3->process_dato ?? null;
											$fallback_3 = $process_dato_arguments_3->fallback ?? null;
											$target_component_properties_3 = $process_dato_arguments_3->target_component_properties ?? null;
											$data_to_be_used_3 = $target_component_properties_3->data_to_be_used ?? null;
											$divisor_3 = $process_dato_arguments_3->divisor ?? null;
											
											$process_dato_arguments_4 = $process_dato_arguments_3->process_dato_arguments;
											
											$custom_parents_3 = $process_dato_arguments_3->custom_parents;

											$custom_arguments_3 = $process_dato_arguments_3->custom_arguments;


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
							// 3 "data_to_be_used" alone. It can be set as is_publicabe or not
							if($data_to_be_used && $data_to_be_used === "dato"){
								
								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_section_id',
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
											'section' => $related_section[0]
										]; 
									}
								}

								$parser_process = (object)[					
									'parser' => [
										(object)[
											'fn' => 'parser_text::text_format',
											'options' => (object)[
												'pattern' => implode($records_separator, array_map(fn($l) => '${' . $l . '}', $letter_ids ?? []))
											]
										]
									],
									"output_format" => "string"
								];

								$new_props = new stdClass();
									$new_props->process = $parser_process;
									if (!empty($ddo_map)) $new_props->process->ddo_map = $ddo_map;
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
									$new_props->process = new stdClass();
									$new_props = new stdClass();
									$new_props->process = $parser_process;
									$new_props->process->output_sample = 2;

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
								if(isset($value_to_extract)){
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
										$output_2 = $process_dato_arguments_2->output;
										$output_options_2 = $process_dato_arguments_2->output_options;
											// $date_format_2 = $output_options_2->date_format;
											// $selected_key_2 = $output_options_2->selected_key;
											// $selected_date_2 = $output_options_2->selected_date;
										$empty_value_2 = $process_dato_arguments_2->empty_value;
										$is_publicable_2 = $process_dato_arguments_2->is_publicable;
										$process_dato_2 = $process_dato_arguments_2->process_dato;
										$fallback_2 = $process_dato_arguments_2->fallback;
											// $tipo_2 = $fallback_2->tipo;
											// $method_2 = $fallback_2->method;
										$target_component_properties_2 = $process_dato_arguments_2->target_component_properties ?? null;
											// $separator_rows_2 = $target_component_properties_2->separator_rows ?? null;
											$data_to_be_used_2 = $target_component_properties_2->data_to_be_used ?? null;
											// $separator_fields_2 = $target_component_properties_2->separator_fields ?? null;
										$divisor_2 = $process_dato_arguments_2->divisor ?? null;
										
										$process_dato_arguments_3 = $process_dato_arguments_2->process_dato_arguments;
											// $dato_3 = $process_dato_arguments_3->dato;
											// $options_3 = $process_dato_arguments_3->options;
										
										$custom_parents_2 = $process_dato_arguments_2->custom_parents;

										$custom_arguments_2 = $process_dato_arguments_2->custom_arguments;


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
											$component_method_3 = $process_dato_arguments_3->component_method;
											$target_component_tipo_3 = $process_dato_arguments_3->target_component_tipo;
											$output_3 = $process_dato_arguments_3->output;
											$output_options_3 = $process_dato_arguments_3->output_options;

											$empty_value_3 = $process_dato_arguments_3->empty_value ?? null;
											$is_publicable_3 = $process_dato_arguments_3->is_publicable ?? null;
											$process_dato_3 = $process_dato_arguments_3->process_dato ?? null;
											$fallback_3 = $process_dato_arguments_3->fallback ?? null;
											$target_component_properties_3 = $process_dato_arguments_3->target_component_properties ?? null;
											$data_to_be_used_3 = $target_component_properties_3->data_to_be_used ?? null;
											$divisor_3 = $process_dato_arguments_3->divisor ?? null;
											
											$process_dato_arguments_4 = $process_dato_arguments_3->process_dato_arguments;
											
											$custom_parents_3 = $process_dato_arguments_3->custom_parents;

											$custom_arguments_3 = $process_dato_arguments_3->custom_arguments;


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
										
										if (isset($sub_resolved->process)) {
											$multiple_parsers[] = $sub_resolved->process;
										}
									}
								}
								
								$parser_process = (object)[
									'fn' => 'parser_helper::merge',
									'options' => (object)[ 'separator' => $separator ],
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

							// 3 "data_to_be_used" alone. It can be set as is_publicabe or not
							if($data_to_be_used && $data_to_be_used === "dato"){
								
								$parser_process = (object)[
										'fn' => 'parser_locator::get_section_id',
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
						

					echo "{$indent}- [$tipo] $model_name\n";
					echo "{$indent}  [RULE APPLIED] resolve_component_value -> no process (data as-is)\n";
				}

				if (!$is_resolve_component && ($is_autocomplete_hi || $option_obj)) {

					if (!$new_props) $new_props = new stdClass();
					if (!isset($new_props->process)) $new_props->process = new stdClass();
					$new_props->process->fn = 'add_parents';

					if (!isset($new_props->process->parser)) $new_props->process->parser = [];

					if ($option_obj || $is_autocomplete_hi) {
						// Build parser options from option_obj — only include present values
						$parser_options = new stdClass();

						// include_parents (V7 TS parser option)
						if ($add_parents_false) {
							$parser_options->include_parents = false;
						}

						// resolve_value
						if ($option_obj && isset($option_obj->resolve_value)) {
							$parser_options->resolve_value = $option_obj->resolve_value;
						}

						// parent_section_tipo
						if (isset($option_obj->parent_section_tipo)) {
							$parser_options->parent_section_tipo = $option_obj->parent_section_tipo;
						}

						// records_separator (unify divisor and records_separator)
						if (isset($option_obj->divisor)) {
							$parser_options->records_separator = $option_obj->divisor;
						}
						if (isset($option_obj->records_separator)) {
							$parser_options->records_separator = $option_obj->records_separator;
						}

						// custom_parents — normalize from multiple possible locations
						$custom_parents = null;
						if (isset($option_obj->custom_parents)) {
							// Direct: option_obj.custom_parents
							$custom_parents = $option_obj->custom_parents;
						} elseif (isset($option_obj->process_dato_arguments->custom_parents)) {
							// Nested: option_obj.process_dato_arguments.custom_parents
							$custom_parents = $option_obj->process_dato_arguments->custom_parents;
						}

						if ($custom_parents) {
							if (isset($custom_parents->parents_splice)) {
								$parser_options->parents_splice = $custom_parents->parents_splice;
							}
							if (isset($custom_parents->parent_end_by_term_id)) {
								$parser_options->parent_end_by_term_id = $custom_parents->parent_end_by_term_id;
							}
							if (isset($custom_parents->parent_end_by_model)) {
								$parser_options->parent_end_by_model = $custom_parents->parent_end_by_model;
							}
						}

						// Build parser definition
						$parser_def = (object)['fn' => 'parser_locator::flat_parents'];
						if (count((array)$parser_options) > 0) {
							$parser_def->options = $parser_options;
						}
						$new_props->process->parser = [$parser_def];

						$options_str = count((array)$parser_options) > 0 ? ' options: ' . json_encode($parser_options) : '';
						echo "{$indent}- [$tipo] $model_name\n";
						echo "{$indent}  [RULE APPLIED] option_obj -> parser_locator::flat_parents{$options_str}\n";

					} else {
						// Default: no option_obj, simple add_parents
						$new_props->process->parser = [
							(object)['fn' => 'parser_locator::add_parents']
						];

						echo "{$indent}- [$tipo] $model_name\n";
						echo "{$indent}  [RULE APPLIED] component_autocomplete_hi relation (fn=add_parents) -> parser_locator::add_parents\n";
					}
				}
			}

			// --- Rule: map_locator_to_terminoID_parent (parser_locator::get_parent_term_id) ---
			// When process_dato is map_locator_to_terminoID_parent, resolve parent hierarchy
			// and return first parent's term_id (section_tipo_section_id)
			if ($new_props === null || !isset($new_props->process)) {
				$is_map_parent = isset($props->process_dato) && $props->process_dato === 'diffusion_sql::map_locator_to_terminoID_parent';

				if ($is_map_parent) {
					if (!$new_props) $new_props = new stdClass();
					$new_props->process = new stdClass();
					$new_props->process->fn = 'add_parents';
					$new_props->process->parser = [
						(object)['fn' => 'parser_locator::get_parent_term_id']
					];

					echo "{$indent}- [$tipo] $model_name\n";
					echo "{$indent}  [RULE APPLIED] map_locator_to_terminoID_parent -> parser_locator::get_parent_term_id\n";
				}
			}

			// --- Rule: Geolocation (get_geojson_data) ---
			// When process_dato is build_geolocation_data_geojson and relation is component_text_area
			if ($new_props === null || !isset($new_props->process)) {
				$is_geojson = isset($props->process_dato) && $props->process_dato === 'diffusion_sql::build_geolocation_data_geojson';

				if ($is_geojson) {
					// Verify relation is component_text_area
					$is_text_area = false;
					if (!empty($relations_info)) {
						foreach ($relations_info as $rel_info) {
							if ($rel_info['model'] === 'component_text_area') {
								$is_text_area = true;
								break;
							}
						}
					}

					if ($is_text_area) {
						if (!$new_props) $new_props = new stdClass();
						$new_props->process = new stdClass();
						$new_props->process->fn = 'get_geojson_data';

						echo "{$indent}- [$tipo] $model_name\n";
						echo "{$indent}  [RULE APPLIED] build_geolocation_data_geojson -> fn: get_geojson_data\n";
					}
				}
			}

			// --- Rule: Unix Timestamp (parser_date::unix_timestamp) ---
			// When process_dato is get_publication_unix_timestamp
			if ($new_props === null || !isset($new_props->process)) {
				$is_unix_timestamp = isset($props->process_dato) && $props->process_dato === 'diffusion::get_publication_unix_timestamp';

				if ($is_unix_timestamp) {
					if (!$new_props) $new_props = new stdClass();
					$new_props->process = new stdClass();
					$new_props->process->parser = [
						(object)['fn' => 'parser_date::unix_timestamp']
					];

					echo "{$indent}- [$tipo] $model_name\n";
					echo "{$indent}  [RULE APPLIED] get_publication_unix_timestamp -> parser_date::unix_timestamp\n";
				}
			}

			// --- Rule: Component Date (parser_date::string_date) ---
			// When related component is component_date and no functional properties,
			// or when process_dato is split_date_range
			if ($new_props === null || !isset($new_props->process)) {

				$is_date_component = false;

				// Check if related component is component_date
				if (!empty($relations_info)) {
					foreach ($relations_info as $rel_info) {
						if ($rel_info['model'] === 'component_date') {
							$is_date_component = true;
							break;
						}
					}
				}

				// Check if process_dato is split_date_range
				$is_split_date = isset($props->process_dato) && $props->process_dato === 'diffusion_sql::split_date_range';

				if ($is_date_component && ($clean_count === 0 || $is_split_date)) {
					if (!$new_props) $new_props = new stdClass();
					$new_props->process = new stdClass();

					// Build parser definition
					$parser_def = (object)['fn' => 'parser_date::string_date'];

					// Preserve selected_date from legacy split_date_range arguments
					// Default is "start", so only add options when it's different
					if ($is_split_date
						&& isset($props->process_dato_arguments->selected_date)
						&& $props->process_dato_arguments->selected_date !== 'start'
					) {
						$parser_def->options = (object)[
							'properties' => [$props->process_dato_arguments->selected_date]
						];
					}

					$new_props->process->parser = [$parser_def];

					$selected_info = isset($parser_def->options) ? ' (properties: [' . $props->process_dato_arguments->selected_date . '])' : '';
					echo "{$indent}- [$tipo] $model_name\n";
					echo "{$indent}  [RULE APPLIED] component_date -> parser_date::string_date{$selected_info}\n";
				}
			}

            // --- Rule: Default Diffusion Element (ddo_map) ---
            // When no transformative properties exist (only meta/schema props), build default DDO map
            // Excludes specific components: autocomplete_hi, filter, portal, relation_children
            
            // Check: any functional properties?
            $props_functional = is_object($props) ? clone $props : (object)[];
            $non_functional_keys = [
                'varchar', 'enum', 'length', // Schema
                'exclude_column', 'info', 'is_publicable', 'orders', 'labels',
                'option_obj' // Parent chain config (handled by autocomplete_hi/flat_parents rule)
            ];
            foreach ($non_functional_keys as $key) {
                if (isset($props_functional->$key)) unset($props_functional->$key);
            }
            
            // Allow these process_dato values to be replaced by downstream rules
            if (isset($props_functional->process_dato) && in_array($props_functional->process_dato, [
                'diffusion_sql::resolve_value',
                'diffusion_sql::split_date_range',
                'diffusion::get_publication_unix_timestamp',
                'diffusion_sql::map_locator_to_terminoID_parent'
            ])) {
                unset($props_functional->process_dato);
                // Also ignore arguments associated with these if they exist
                if (isset($props_functional->process_dato_arguments)) unset($props_functional->process_dato_arguments);
            }
            
            $functional_count = count((array)$props_functional);

            // Condition: No functional properties AND not already processed (process block)
            if ($functional_count === 0 && (!isset($new_props->process))) {
                
                $is_relation_component = false;
                $is_portal = false;
                $target_model = '';
                
                 if (!empty($relations_info)) {
                    $relation_components = component_relation_common::get_components_with_relations();
                    $excluded_components = [
                        'component_autocomplete_hi', 
                        'component_filter', 
                        // 'component_portal', // Handled explicitly now
                        'component_relation_children'
                    ];
                    
                    foreach ($relations_info as $rel_info) {
                        // Check for Portal specifically first
                        if ($rel_info['model'] === 'component_portal') {
                            $is_portal = true;
                            $target_model = 'component_portal';
                            break;
                        }

                        if (in_array($rel_info['model'], $relation_components)) {
                            // Ensure we don't pick up excluded comps as "generic relation"
                            // Note: component_portal is excluded from generic list but we handle it specifically
                            if (!in_array($rel_info['model'], $excluded_components) && $rel_info['model'] !== 'component_portal') {
                                $is_relation_component = true;
                                $target_model = $rel_info['model'];
                                break; // Found valid relation component
                            }
                        }
                    }
                }

                if ($is_portal) {
                     if (!$new_props) $new_props = new stdClass();
                     if (!isset($new_props->process)) $new_props->process = new stdClass();
                     
                     $new_props->process->parser = [
                        (object)['fn' => 'parser_locator::get_section_id']
                     ];

                     echo "{$indent}- [$tipo] $model_name\n";
                     echo "{$indent}  [RULE APPLIED] Component Portal -> parser_locator::get_section_id\n";
                }
                elseif ($is_relation_component) {
                    $ddo_map_data = get_ddo_map($tipo);
                    
                    if ($ddo_map_data) {
                        if (!$new_props) $new_props = new stdClass();
                        if (!isset($new_props->process)) $new_props->process = new stdClass();
                        
                        // Assign IDs to children (a, b, c...)
                        $char_code = 97; // 'a'
                        $formatted_ddo_map = [];
                        foreach ($ddo_map_data as $index => $ddo_node) {
                            $node_obj = clone $ddo_node;
                            if ($index > 0) { // Skip root (self)
                                $node_obj->id = chr($char_code++);
                            }
                            $formatted_ddo_map[] = $node_obj;
                        }

                        $new_props->process->ddo_map = $formatted_ddo_map;

                        echo "{$indent}- [$tipo] $model_name\n";
                        echo "{$indent}  [RULE APPLIED] Default Relation -> generated ddo_map\n";
                    } else {
                         // Debug: ddo_map empty
                         // echo "{$indent}  [DEBUG] ddo_map empty for $tipo\n";
                    }
                }
            } else {
                // Debug: functional count not 0 or already processed
            }

			// --- Rule: Field Int (Length) ---
			if ($model_name === 'field_int' && isset($props->length)) {
				if (!$new_props) $new_props = new stdClass();
				$new_props->length = $props->length;
				
				echo "{$indent}- [$tipo] $model_name\n";
				echo "{$indent}  [RULE APPLIED] field_int -> keep length: {$props->length}\n";
			}

			break;
			
		default:
			$diffusion_type = 'unknown';
			break;
	}



	// Process result and save
	if (
		$new_props 
		|| (isset($props->exclude_column) && $props->exclude_column)
		|| isset($props->info)
		|| isset($props->is_publicable)
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

		echo "{$indent}  V6: " . json_encode($props) . "\n";
		echo "{$indent}  V7: " . json_encode($new_props) . "\n";

		save_node([
			'tipo' => $tipo,
			'properties' => $new_props
		]);
	}
}

// Execution
try {
	traverse_ontology_recursive($root_tipo);
	echo "\nTotal nodes processed: $total_nodes\n";
} catch (Exception $e) {
	echo "Error: " . $e->getMessage() . "\n";
}


function save_node($node_info) {

	$tipo    = $node_info['tipo'];
	$tld     = get_tld_from_tipo($tipo);

	// Check for empty object and convert to null
	$val = $node_info['properties'];
	if (is_object($val) && count((array)$val) === 0) {
		$val = null;
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
	$fresh = ontology_node::get_instance($tipo);
	$fresh->load_data();
	$saved_val = $fresh->get_properties();
	
	$input_data_json = json_encode($val);
	$saved_json      = json_encode($saved_val);

	if ($input_data_json === $saved_json) {
		echo "  [TEST PASS] Data verified for $tld (dd_ontology)\n";
	} else {
		echo "  [TEST FAIL] dd_ontology Mismatch for $tld\n";
		echo "    Expected: $input_data_json\n";
		echo "    Actual:   $saved_json\n";
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
			$_SESSION['dedalo']['auth']['salt_secure'] = dedalo_encrypt_openssl(DEDALO_SALT_STRING);

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