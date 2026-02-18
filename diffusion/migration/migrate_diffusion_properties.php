<?php

use PhpParser\Node\Stmt\Switch_;
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

$root_tipo = DEDALO_DIFFUSION_TIPO; // Diffusion Root
echo "Starting migration analysis from root: $root_tipo\n";

// Global counter
$total_nodes = 0;

function traverse_ontology_recursive($current_tipo, $level = 0) {
	global $total_nodes;
	
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
			$diffusion_type = 'field';
			
			// Calculate effective count ignoring behavioral properties (info, exclude_column, is_publicable)
			$props_check = is_object($props) ? clone $props : (object)[];
			if (isset($props_check->info)) unset($props_check->info);
			if (isset($props_check->exclude_column)) unset($props_check->exclude_column);
			if (isset($props_check->is_publicable)) unset($props_check->is_publicable);
			$clean_count = count((array)$props_check);

			// --- Rule: Enum Relation ---
			if ($model_name === 'field_enum' || $model_name === 'field_text' && isset($props->enum)) {
				$is_relation_component = false;
				$relation_components = component_relation_common::get_components_with_relations();
				
				// search in relations if works with relation component
				if (!empty($relations_info)) {
					foreach ($relations_info as $rel_info) {
						if (in_array($rel_info['model'], $relation_components)) {
							$is_relation_component = true;
							break;
						}
					}
				}

				if ($is_relation_component) {
					$new_props = new stdClass();
					
					// Specific complex object for Enum + Relation
					$parser_process = [
						(object)[
							'fn' => 'parser_locator::get_section_id',
							'id' => 'a'
						],
						(object)[
							'fn' => 'parser_locator::get_first',
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

					$new_props->process = new stdClass();
					$new_props->process->parser = $parser_process;

					echo "{$indent}- [$tipo] $model_name\n";
					echo "{$indent}  [RULE APPLIED] field_enum (relation) -> mapped enum values\n";
				}
			}

			// --- Case 1: Simple data_to_be_used: "dato" (Relation) OR "map_project_to_section_id" ---
			if (
				($new_props === null && isset($props->data_to_be_used) && $props->data_to_be_used === 'dato' && $clean_count === 1)
				||
				(isset($props->process_dato) && $props->process_dato === 'diffusion_sql::map_project_to_section_id')
			) {
				
				$is_relation_component = false;
				$relation_components = component_relation_common::get_components_with_relations();
				
				// search in relations if works with relation component
				if (!empty($relations_info)) {
					foreach ($relations_info as $rel_info) {
						if (in_array($rel_info['model'], $relation_components)) {
							$is_relation_component = true;
							break;
						}
					}
				}

				if ($is_relation_component) {
					if (!$new_props) $new_props = new stdClass();
					
					$parser_process = [
						(object)[
							'fn' => 'parser_locator::get_section_id'
						]
					];

					if (!isset($new_props->process)) $new_props->process = new stdClass();
					$new_props->process->parser = $parser_process;

					echo "{$indent}- [$tipo] $model_name\n";
					echo "{$indent}  [RULE APPLIED] Case 1: 'dato' OR 'map_project_to_section_id' (relation) -> parser_locator::get_section_id\n";
				}
			}
			
			// --- Case 4: process_dato: "diffusion_sql::map_quality_to_int" (Relation) ---
			if ($new_props === null && isset($props->process_dato) && $props->process_dato === 'diffusion_sql::map_quality_to_int' && $clean_count === 1) {
				
				$is_relation_component = false;
				$relation_components = component_relation_common::get_components_with_relations();
				
				if (!empty($relations_info)) {
					foreach ($relations_info as $rel_info) {
						if (in_array($rel_info['model'], $relation_components)) {

							$is_relation_component = true;
							break;
						}
					}
				}

				if ($is_relation_component) {
					$new_props = new stdClass();
					
					$parser_process = [
						(object)[
							'fn' => 'parser_locator::get_section_id',
							'id' => 'a'
						],
						(object)[
							'fn' => 'parser_locator::get_first',
							'id' => 'a'
						]
					];

					$new_props->process = new stdClass();
					$new_props->process->parser = $parser_process;

					echo "{$indent}- [$tipo] $model_name\n";
					echo "{$indent}  [RULE APPLIED] Case 4: map_quality_to_int (relation) -> parser_locator::get_section_id + get_first\n";
				}
			}

			// --- Case: process_dato: "diffusion_sql::map_locator_to_terminoID" OR "diffusion_sql::map_locator_to_term_id" (Relation) ---
			if (
				$new_props === null 
				&& isset($props->process_dato) 
				&& (
					$props->process_dato === 'diffusion_sql::map_locator_to_terminoID'
					|| $props->process_dato === 'diffusion_sql::map_locator_to_term_id'
				)
				&& $clean_count === 1
			) {
				
				$is_relation_component = false;
				$relation_components = component_relation_common::get_components_with_relations();
				
				if (!empty($relations_info)) {
					foreach ($relations_info as $rel_info) {
						if (in_array($rel_info['model'], $relation_components)) {
							$is_relation_component = true;
							break;
						}
					}
				}

				if ($is_relation_component) {
					$new_props = new stdClass();
					
					$parser_process = [
						(object)[
							'fn' => 'parser_locator::get_section_id',
							'id' => 'a'
						],
						(object)[
							'fn' => 'parser_locator::get_section_tipo',
							'id' => 'b'
						],
						(object)[
							'fn' => 'parser_text::text_format',
							'options' => (object)[
								'pattern' => '${b}_${a}'
							]
						]
					];

					$new_props->process = new stdClass();
					$new_props->process->parser = $parser_process;

					echo "{$indent}- [$tipo] $model_name\n";
					echo "{$indent}  [RULE APPLIED] map_locator_to_terminoID OR map_locator_to_term_id (relation) -> get_section_id + get_section_tipo + text_format\n";
				}
			}

			// --- Rule: Varchar ---
			if ($model_name === 'field_varchar' && isset($props->varchar)) {
				if (!$new_props) $new_props = new stdClass();
				$new_props->varchar = $props->varchar;
				
				echo "{$indent}- [$tipo] $model_name\n";
				echo "{$indent}  [RULE APPLIED] field_varchar -> keep varchar: {$props->varchar}\n";
			}

            // --- Rule: Component Autocomplete Hierarchy (Relation) ---
			// Also handles option_obj configurations for parent chain customization
			if (($new_props === null || !isset($new_props->process)) && !empty($relations_info)) {

				// Check for option_obj in propiedades
				$option_obj = isset($props->option_obj) ? $props->option_obj : null;

				// Detect component_autocomplete_hi in relations
				$is_autocomplete_hi = false;
				foreach ($relations_info as $rel_info) {
					if ($rel_info['model'] === 'component_autocomplete_hi') {
						$is_autocomplete_hi = true;
						break;
					}
				}

				// When option_obj.add_parents is explicitly false, skip this rule
				$add_parents_false = $option_obj && isset($option_obj->add_parents) && $option_obj->add_parents === false;

				if (!$add_parents_false && ($is_autocomplete_hi || $option_obj)) {

					if (!$new_props) $new_props = new stdClass();
					$new_props->process = new stdClass();
					$new_props->process->fn = 'add_parents';

					if ($option_obj) {
						// Build parser options from option_obj — only include present values
						$parser_options = new stdClass();

						// resolve_value
						if (isset($option_obj->resolve_value)) {
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

	$tld = get_tld_from_tipo($node_info['tipo']);
	$section_tipo = $tld.'0';
	$section_id = get_section_id_from_tipo($node_info['tipo']);

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

	// Check for empty object and convert to null
	$val = $node_info['properties'];
	if (is_object($val) && count((array)$val) === 0) {
		$val = null;
	}

	$data = [(object)[
		'value' => $val
	] ];


	$properties_component->set_data($data);
	$properties_component->save();

	// Unit Test: Verify data was saved
	$verify_component = component_common::get_instance(
		$model, 
		$component_tipo, 
		$section_id, 
		'list', 
		DEDALO_DATA_NOLAN, 
		$section_tipo
	);
	$saved_data = $verify_component->get_data();
	
	// Normalize for comparison (assuming set_data accepted array)
	$input_data_json = json_encode($val);
	$saved_data_json = is_string($saved_data) ? $saved_data : json_encode($saved_data);
	
	// Decode both to compare structures (ignoring white space diffs)
	$input_obj = json_decode($input_data_json);
	$saved_obj = json_decode($saved_data_json);
	
	// Handle case where saved data is wrapped in array (multi-value) and input is single object
	if (is_array($saved_obj) && count($saved_obj) === 1 && isset($saved_obj[0]->value)) {
		if ($input_obj == $saved_obj[0]->value) {
			echo "  [TEST PASS] Data verified for $tld (ontology18) [Wrapped]\n";
			return;
		}
	}

	if ($input_obj == $saved_obj) {
		echo "  [TEST PASS] Data verified for $tld (ontology18)\n";
	} else {
		echo "  [TEST FAIL] Data Mismatch for $tld\n";
		echo "    Expected: $input_data_json\n";
		echo "    Actual:   $saved_data_json\n";
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
