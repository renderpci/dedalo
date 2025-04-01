<?php declare(strict_types=1);
/**
* CLASS COMPONENT_INVERSE
* It is used to manage inverse relations
* (references to current section)
*/
class component_inverse extends component_common {



	/**
	* GET_DATO
	* This component don't store data, only access to section inverse_locators data
	* @return array $dato
	*/
	public function get_dato() {

		// dato_resolved. Already resolved case
			if(isset($this->dato_resolved)) {
				return $this->dato_resolved;
			}

		// section search for inverse locators
			$section	= $this->get_my_section();
			$dato		= $section->get_inverse_references();

		// fix dato
			$this->dato				= $dato;
			$this->dato_resolved	= $dato;

		// Set as loaded
			$this->bl_loaded_matrix_data = true;


		return $dato;
	}//end get_dato



	/**
	* GET_DATO_FULL
	* Alias of get_dato
	* @return array $dato
	*/
	public function get_dato_full() {

		return $this->get_dato();
	}//end get_dato_full



	/**
	* SAVE
	* Only used to catch common method here
	* @return int|null $section_matrix_id
	*/
	public function Save() : ?int {

		debug_log(__METHOD__
			. " Ignored save command for component (component_inverse) "
			, logger::WARNING
		);

		return $this->section_id;
	}//end Save



	/**
	* GET_GRID_VALUE
	* Get the value of the component.
	* For component inverse, data is the locators of sections that call to his section
	* every instance of the component is a unique row with multiple columns for every section that call
	* ex: informant is called by oh and pci
	* informant is the row and has two columns: oh and pci with his section_id as value
	* Data of this component do not create rows, instead the portal data
	* the row is always 1, the current instance of the component, his data doesn't create rows, because data are the locators of different callers
	* the locators will be 1 for every section that call and component (it's not possible had the same locator in the same portal)
	* the total columns will be the combination of different section_tipo of callers and component_tipo (portal that call)
	* format:
	* {
	* 	type : column 			// the global column of the component
	* 	value : [{
	* 		type : row 			// the row of the instance of the component, it's not the data length, always 1
	* 		value : [{
	* 			type : column 	// every locator will create 1 column (from_section_tipo and "from_compoennt_tipo")
	* 			value : ["1"] 	// from_section_id , section_id of the caller
	* 		}]
	* 	}]
	* }
	* @param object|null $ddo = null
	* @return dd_grid_cell_object $dd_grid_cell_object
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$fields_separator	= $ddo->fields_separator ?? null;
			$records_separator	= $ddo->records_separator ?? null;
			$format_columns		= $ddo->format_columns ?? null;
			$class_list			= $ddo->class_list ?? null;

		// short vars
			$data		= $this->get_dato();
			$label		= $this->get_label();
			$properties	= $this->get_properties();

		// fields_separator
			$fields_separator = isset($fields_separator)
				? $fields_separator
				: (isset($properties->fields_separator)
					? $properties->fields_separator
					: ', ');

		// records_separator
			$records_separator = isset($records_separator)
				? $records_separator
				: (isset($properties->records_separator)
					? $properties->records_separator
					: ' | ');


		$ar_columns_obj = [];
		$ar_cells 		= [];
		foreach ($data as $current_locator) {
			// get the locator section_tipo and section_id of the section that call (from_section_tipo and from_section_id)
			$from_section_id		= $current_locator->from_section_id;
			$from_section_tipo		= $current_locator->from_section_tipo;
			$from_component_tipo	= $current_locator->from_component_tipo;

			$section_label 	= RecordObj_dd::get_termino_by_tipo($from_section_tipo,DEDALO_APPLICATION_LANG, true);

			$column_obj_id = $this->section_tipo.'_'.$from_section_tipo.'_'.$this->tipo.'_'.$from_component_tipo;

			$column_obj = array_find($ar_columns_obj, function($column)use ($column_obj_id){
				return $column->id === $column_obj_id;
			});

			if(empty($column_obj)){
				$column_obj = new stdClass();
					$column_obj->id		= $column_obj_id;
				$ar_columns_obj[] = $column_obj;
			}
			//create the column for every locator of every section_tipo and component_tipo with the section_id as value
			$grid_column = new dd_grid_cell_object();
				$grid_column->set_type('column');
				$grid_column->set_cell_type('text');
				$grid_column->set_label($section_label);
				$grid_column->set_value([$from_section_id]);
				$grid_column->set_ar_columns_obj([$column_obj]);
			// store the current column with all values
				$ar_cells[] = $grid_column;
		}

		//create the row of the component, every instance of the component has 1 unique row and multiple columns.
			$grid_row = new dd_grid_cell_object();
				$grid_row->set_type('row');
				$grid_row->set_value($ar_cells);
			// store the current column with all values
				$ar_cells[] = $grid_row;

		// always 1 data size it's not the rows
			$row_count	= 1;

		// get the total of columns
			$column_count	= sizeof($ar_columns_obj);

		// dd_grid_cell_object, final columns that has the row and his columns
			$dd_grid_cell_object = new dd_grid_cell_object();
				$dd_grid_cell_object->set_type('column');
				$dd_grid_cell_object->set_label($label);
				// $dd_grid_cell_object->set_cell_type('text');
				$dd_grid_cell_object->set_ar_columns_obj($ar_columns_obj);
				$dd_grid_cell_object->set_row_count($row_count);
				$dd_grid_cell_object->set_column_count($column_count);
				if(isset($class_list)){
					$dd_grid_cell_object->set_class_list($class_list);
				}
				$dd_grid_cell_object->set_fields_separator($fields_separator);
				$dd_grid_cell_object->set_records_separator($records_separator);
				$dd_grid_cell_object->set_value([$grid_row]);
				$dd_grid_cell_object->set_model(get_called_class());


		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* GET_VALOR
	* @return string|null $valor
	*/
	public function get_valor() {

		$dato = $this->get_dato();

		if (empty($dato)) {
			return null;
		}

		return json_handler::encode($dato);
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string $valor_export
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) {

		// When is received 'valor', set as dato to avoid trigger get_dato against DB
		// Received 'valor' is a JSON string (array of locators) from previous database search
		if (!is_null($valor)) {
			$dato = json_decode($valor);
			$this->set_dato($dato);
		}else{
			$dato = $this->get_dato();
		}

		$inverse_show = $this->get_properties()->inverse_show;

		$ar_lines = [];
		foreach ($dato as $current_locator) {

			$section_id		= $current_locator->from_section_id;
			$section_tipo	= $current_locator->from_section_tipo;
			$component_tipo	= $current_locator->from_component_tipo;

			$line = '';
			foreach ($inverse_show as $ikey => $ivalue) {
				if ($ivalue===false) continue;

				# section_id
				if ($ikey === 'section_id') {
					if(strlen($line)>0) $line .= ' ';
					#$line .= $current_locator->section_id;
					$line .= $section_id;
				}

				# section_tipo
				if ($ikey === 'section_tipo') {
					if(strlen($line)>0) $line .= ' ';
					#$line .= $current_locator->section_tipo;
					$line .= $section_tipo;
				}

				# section_label
				if ($ikey === 'section_label') {
					if(strlen($line)>0) $line .= ' ';
					$label = RecordObj_dd::get_termino_by_tipo($section_tipo, $lang);
					$line .= $label;
				}

				# component_tipo
				if ($ikey === 'component_tipo' || $ikey === 'from_component_tipo') {
					if(strlen($line)>0) $line .= ' ';
					$line .= $component_tipo;
				}

				# component_label
				if ($ikey === 'component_label') {
					if(strlen($line)>0) $line .= ' ';
					$label = RecordObj_dd::get_termino_by_tipo($component_tipo, $lang);
					$line .= $label;
				}
			}

			// add
			$ar_lines[] = $line;
		}//end foreach ($dato as $current_locator)

		// valor_export: lines string
		$valor_export = implode(PHP_EOL, $ar_lines);


		return $valor_export;
	}//end get_valor_export



	/**
	* EXTRACT_COMPONENT_VALUE_FALLBACK
	* Catch common method calls
	* @return string
	*/
	public static function extract_component_value_fallback(object $component, string $lang=DEDALO_DATA_LANG, bool $mark=true, string $main_lang=DEDALO_DATA_LANG_DEFAULT) : string {

		return '';
	}//end extract_component_value_fallback



}//end class component_inverse
