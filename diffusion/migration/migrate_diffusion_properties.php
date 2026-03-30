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
									'fn' => 'parser_locator::get_section_id'
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

							// 3 "data_to_be_used" alone. It can be set as is_publicabe or not
							$data_to_be_used        = $props->data_to_be_used ?? null;
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

									$ddo_map_sl = [
										(object)[
											'tipo'         => $rel_info['tipo'] ?? $tipo,
											'section_tipo' => 'self'
										],
										(object)[
											'id'		=> 'a',
											'tipo'		=> 'hierarchy41', // Standard code component for lg1
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
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] portal map_locator_to_term_id -> get_diffusion_dato\n";
								break;
							}

							// 2.2 "diffusion_sql::map_quality_to_int"
							if($process_dato_cp && $process_dato_cp === 'diffusion_sql::map_quality_to_int') {

								$parser_process = [
									(object)[
										'fn' => 'parser_locator::get_section_id',
										'id' => 'a'
									],
									(object)[
										'fn' => 'parser_helper::get_first',
										'id' => 'a'
									]
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process->parser = $parser_process;
								$new_props->process->output_format = 'int';

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
									

									if(isset($props->is_publicable) && $props->is_publicable === true){
										$new_props->is_publishable = $props->is_publicable;
									}
									if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

									echo "{$indent}- [$tipo] $model_name\n";
									echo "{$indent}  [RULE APPLIED] check_box map_locator_to_term_id\n";
									break;
									
								}
								
								if($final_method_cp === 'get_diffusion_dato') {
									$new_props = new stdClass(); $new_props->process = get_diffusion_dato(
										$final_target,
										null,
										$final_args,
										null
									);
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

									if (!empty($ddo_map_cp)) {
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
									
									$new_props = new stdClass(); $new_props->process = get_diffusion_value(
										$final_target,
										$model_cp,
										null,
										$final_args,
										$output,
										null,
										(empty((array)$output_options_cp) ? null : $output_options_cp),
										$ddo_map_cp
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
										'fn' => 'parser_locator::get_section_id',
										'id' => 'a'
									],
									(object)[
										'fn' => 'parser_helper::get_first',
										'id' => 'a'
									]
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process->parser = $parser_process;
								$new_props->process->output_format = 'int';

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
										'fn' => 'parser_locator::get_section_id',
										'id' => 'a'
									],
									(object)[
										'fn' => 'parser_helper::get_first',
										'id' => 'a'
									]
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process->parser = $parser_process;
								$new_props->process->output_format = 'int';

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
												'fn' => 'parser_locator::get_section_id'
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
										'fn' => 'parser_locator::get_section_id',
										'id' => 'a'
									],
									(object)[
										'fn' => 'parser_helper::get_first',
										'id' => 'a'
									]
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process->parser = $parser_process;
								$new_props->process->output_format = 'int';

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

							break;
						
						case 'component_filter':

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
										'fn' => 'parser_locator::get_section_id',
										'id' => 'a'
									],
									(object)[
										'fn' => 'parser_helper::get_first',
										'id' => 'a'
									]
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process->parser = $parser_process;
								$new_props->process->output_format = 'int';
								
								if(isset($props->is_publicable) && $props->is_publicable === true){
									$new_props->is_publishable = $props->is_publicable;
								}
								if(isset($props->varchar)){ $new_props->varchar = $props->varchar; }

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] filter map_quality_to_int -> get_diffusion_dato()\n";
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

							// 1 proces datao with geojson
							$process_dato = $props->process_dato ?? null;
							if($process_dato && $process_dato === "diffusion_sql::build_geolocation_data_geojson") {

								// Specific for geojson
								$parser_process = (object)[
									"fn" => "get_geojson_data"
								];							

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process = $parser_process;
								$new_props->process->output_format = "json";
								$new_props->process->output_sample = "Yes";

								echo "{$indent}- [$tipo] $model_name\n";
								echo "{$indent}  [RULE APPLIED] componet_text_area -> diffusion_sql::build_geolocation_data_geojson\n";							
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
						
							default:
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
										'fn' => 'parser_locator::get_section_id',
										'id' => 'a'
									],
									(object)[
										'fn' => 'parser_helper::get_first',
										'id' => 'a'
									]
								];

								$new_props = new stdClass();
								$new_props->process = new stdClass();
								$new_props->process->parser = $parser_process;
								$new_props->process->output_format = 'int';

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
							if($is_empty_relation_list($props)) {

								$new_props = new stdClass(); $new_props->process = get_dato(
									'relation_list',
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
								echo "{$indent}  [RULE APPLIED] relation_list empty props -> get_dato (letter-id ddo_map)\n";
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
							
							// 4 process_dato=diffusion_sql::resolve_value + component_method=get_diffusion_resolve_value + custom_arguments
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
									if (!empty($ddo_map_relation_list)) { $new_props->process->ddo_map = $ddo_map_relation_list; }
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
							

							break;
						}
				}
			}
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