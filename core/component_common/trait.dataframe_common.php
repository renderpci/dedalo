<?php declare(strict_types=1);
/**
 * TRAIT DATAFRAME_COMMON
 * Provides generic dataframe functionality for components.
 * Allows linking to another component in the same section for extended data.
 * 
 * Usage:
 * - Component declares 'dataframe' property in ontology with component_tipo
 * - This trait provides methods to manage data with context properties
 * - Context properties: section_tipo_key, section_id_key
 */
trait dataframe_common {

	/**
	 * GET_DATAFRAME_COMPONENT
	 * Get the linked dataframe component instance
	 * @return component_common|null
	 */
	public function get_dataframe_component() : ?component_common {
		$dataframe_tipo = $this->get_dataframe_tipo();
		if (empty($dataframe_tipo)) {
			return null;
		}

		return component_common::get_instance(
			$this->get_dataframe_model(),
			$dataframe_tipo,
			$this->section_id,
			$this->mode,
			$this->lang,
			$this->section_tipo
		);
	}//end get_dataframe_component


	/**
	 * GET_DATAFRAME_TIPO
	 * Get the dataframe component tipo from ontology properties
	 * @return string|null
	 */
	public function get_dataframe_tipo() : ?string {
		$ontology_node = ontology_node::get_instance($this->tipo);
		$properties = $ontology_node->get_properties();
		
		// Handle cases where properties, dataframe, or component_tipo return false
		if (!$properties instanceof stdClass) {
			return null;
		}
		if (!isset($properties->dataframe) || !$properties->dataframe instanceof stdClass) {
			return null;
		}
		if (!isset($properties->dataframe->component_tipo)) {
			return null;
		}
		
		$value = $properties->dataframe->component_tipo;
		
		// Ensure we return null for any falsy value (false, null, empty string)
		if ($value === false || $value === null || $value === '') {
			return null;
		}
		
		return (string)$value;
	}//end get_dataframe_tipo


	/**
	 * GET_DATAFRAME_MODEL
	 * Get the model of the dataframe component
	 * @return string|null
	 */
	public function get_dataframe_model() : ?string {
		$dataframe_tipo = $this->get_dataframe_tipo();
		if (empty($dataframe_tipo)) {
			return null;
		}
		
		$model = ontology_node::get_model_by_tipo($dataframe_tipo);
		
		return $model ?? null;
	}//end get_dataframe_model


	/**
	 * HAS_DATAFRAME
	 * Check if this component has a linked dataframe
	 * @return bool
	 */
	public function has_dataframe() : bool {
		return !empty($this->get_dataframe_tipo());
	}//end has_dataframe


	/**
	 * GET_DATA_BY_CONTEXT
	 * Filter data by parent context (section_id_key, section_tipo_key)
	 * @param string $section_tipo_key
	 * @param int $section_id_key
	 * @return array|null
	 */
	public function get_data_by_context(string $section_tipo_key, int $section_id_key) : ?array {
		$data = $this->get_data();
		if (empty($data)) {
			return null;
		}

		$filtered = array_values(array_filter($data, function($item) use ($section_tipo_key, $section_id_key) {
			return isset($item->section_tipo_key) 
				&& $item->section_tipo_key === $section_tipo_key
				&& isset($item->section_id_key)
				&& (int)$item->section_id_key === (int)$section_id_key;
		}));

		return empty($filtered) ? null : $filtered;
	}//end get_data_by_context


	/**
	 * ADD_VALUE_WITH_CONTEXT
	 * Add a value with context properties
	 * @param mixed $value
	 * @param string $section_tipo_key
	 * @param int $section_id_key
	 * @return bool
	 */
	public function add_value_with_context($value, string $section_tipo_key, int $section_id_key) : bool {
		$data = $this->get_data() ?? [];

		$new_item = new stdClass();
			$new_item->value = $value;
			$new_item->section_tipo_key = $section_tipo_key;
			$new_item->section_id_key = $section_id_key;

		$data[] = $new_item;
		
		return $this->set_data($data);
	}//end add_value_with_context


	/**
	 * REMOVE_BY_CONTEXT
	 * Remove values by context
	 * @param string $section_tipo_key
	 * @param int $section_id_key
	 * @return bool
	 */
	public function remove_by_context(string $section_tipo_key, int $section_id_key) : bool {
		$data = $this->get_data() ?? [];
		
		$filtered = array_values(array_filter($data, function($item) use ($section_tipo_key, $section_id_key) {
			return !(
				isset($item->section_tipo_key) 
				&& $item->section_tipo_key === $section_tipo_key
				&& isset($item->section_id_key)
				&& (int)$item->section_id_key === (int)$section_id_key
			);
		}));

		return $this->set_data($filtered);
	}//end remove_by_context


	/**
	 * GET_VALUE_BY_CONTEXT
	 * Get a single value by context
	 * @param string $section_tipo_key
	 * @param int $section_id_key
	 * @return mixed|null
	 */
	public function get_value_by_context(string $section_tipo_key, int $section_id_key) {
		$context_data = $this->get_data_by_context($section_tipo_key, $section_id_key);
		if (empty($context_data)) {
			return null;
		}
		
		return $context_data[0]->value ?? null;
	}//end get_value_by_context


	/**
	 * UPDATE_VALUE_BY_CONTEXT
	 * Update value for a specific context
	 * @param mixed $value
	 * @param string $section_tipo_key
	 * @param int $section_id_key
	 * @return bool
	 */
	public function update_value_by_context($value, string $section_tipo_key, int $section_id_key) : bool {
		$data = $this->get_data() ?? [];
		$found = false;
		
		foreach ($data as $item) {
			if (isset($item->section_tipo_key) 
				&& $item->section_tipo_key === $section_tipo_key
				&& isset($item->section_id_key)
				&& (int)$item->section_id_key === (int)$section_id_key) {
				$item->value = $value;
				$found = true;
				break;
			}
		}

		if (!$found) {
			return $this->add_value_with_context($value, $section_tipo_key, $section_id_key);
		}

		return $this->set_data($data);
	}//end update_value_by_context
}
