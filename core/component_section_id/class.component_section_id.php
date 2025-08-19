<?php declare(strict_types=1);
/**
* CLASS COMPONENT_SECTION_ID
*
*/
class component_section_id extends component_common {



	// data_column. DB column where to get the data.
	protected $data_column = 'section_id';



	/**
	* GET_DATO
	* @return int|null $dato
	*/
	public function get_dato() : ?int {

		$dato = !empty($this->section_id)
			? (int)$this->section_id
			: null;

		// Set as loaded
			$this->bl_loaded_matrix_data = true;

		return $dato;
	}//end get_dato



	/**
	* SET_DATO
	* @param int|null $dato
	* @return bool
	*/
	public function set_dato($dato) : bool {

		// dato format check
			if (!is_null($dato) && !is_integer($dato)) {

				debug_log(__METHOD__ . ' '
					. '[SET] RECEIVED DATO IS NOT AS EXPECTED TYPE integer|null. type: '. gettype($dato) .' - dato: '. to_string($dato) . PHP_EOL
					. 'model: '. get_called_class() .PHP_EOL
					. 'tipo: ' . $this->tipo . ' - section_tipo: ' . $this->section_tipo . ' - section_id: ' . $this->section_id
					, logger::ERROR
				);

			}

		// unset previous calculated valor
			if (isset($this->valor)) {
				unset($this->valor);
			}

		// set dato
			$this->dato = $dato;

		// resolved set
			$this->dato_resolved = $dato;


		return true;
	}//end get_dato



	/**
	* GET_DATO_FULL
	* Alias of get_dato
	* @return int|null
	*/
	public function get_dato_full() {

		return $this->get_dato();
	}//end get_dato_full



	/**
	* GET_VALOR
	* Alias of get_dato
	* @return int|null
	*/
	public function get_valor() {

		return $this->get_dato();
	}//end get_valor



	/**
	* SAVE
	* Only used to catch common method here
	* @return int|null $section_matrix_id
	*/
	public function Save() : ?int {

		debug_log(__METHOD__
			. " Ignored save command for component (component_section_id) "
			, logger::ERROR
		);

		return $this->section_id;
	}//end Save



	/**
	* GET_GRID_VALUE
	* Get the value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* The direct components can set the value with the dato directly
	* The relation components will separate the locator in rows
	* @param object|null $ddo = null
	* @return dd_grid_cell_object $value
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// column_obj
			$column_obj = $this->column_obj ?? (object)[
				'id' => $this->section_tipo.'_'.$this->tipo
			];

		$data	= $this->get_dato();
		$label	= $this->get_label();

		// value
			$dd_grid_cell_object = new dd_grid_cell_object();
				$dd_grid_cell_object->set_type('column');
				$dd_grid_cell_object->set_label($label);
				$dd_grid_cell_object->set_cell_type('section_id');
				$dd_grid_cell_object->set_ar_columns_obj([$column_obj]);
				$dd_grid_cell_object->set_row_count(1);
				$dd_grid_cell_object->set_value($data);
				$dd_grid_cell_object->set_model(get_called_class());


		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* GET_TOOLS
	* Catch get_tools call to prevent load tools sections
	* @return array $tools
	*/
	public function get_tools() : array {

		return [];
	}//end get_tools



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* @return object $query_object
	*/
	public static function resolve_query_object_sql(object $query_object) : object {

		// q. reset array value
			$query_object->q = is_array($query_object->q)
				? reset($query_object->q)
				: $query_object->q;


		// q. if q is a locator, get the section_id as int
			$query_object->q = is_object($query_object->q) && isset($query_object->q->section_id)
				? $query_object->q->section_id
				: $query_object->q;

		// set the q. Force string always
		$q = $query_object->q . "";

		// q_operator. Prepend q_operator if exists
		if (isset($query_object->q_operator)) {
			$q = $query_object->q_operator . $q;
		}

		// Always set fixed values
		$query_object->type = 'number';

		// Always without unaccent
		$query_object->unaccent = false;

		// format. Always set format to column (but in sequence case)
		$query_object->format = 'column';

		// column_name
		$query_object->column_name = 'section_id';

		// component path
		$query_object->component_path = ['section_id'];

		$between_separator  = '...';
		$sequence_separator = ',';

		switch (true) {
			// BETWEEN
			case (strpos($q, $between_separator)!==false):
				// Transform "12...25" to "12 AND 25"
				$ar_parts	= explode($between_separator, $q);
				$first_val	= !empty($ar_parts[0]) ? intval($ar_parts[0]) : 0;
				$second_val	= !empty($ar_parts[1]) ? intval($ar_parts[1]) : $first_val;

				$query_object_one = clone $query_object;
					$query_object_one->operator = '>=';
					$query_object_one->q_parsed	= $first_val;

				$query_object_two = clone $query_object;
					$query_object_two->operator = '<=';
					$query_object_two->q_parsed	= $second_val;

				// Group in a new "AND"
				$current_op = '$and';
				$new_query_object = new stdClass();
					$new_query_object->{$current_op} = [$query_object_one,$query_object_two];

				$query_object = $new_query_object;
				break;
			# SEQUENCE
			case (strpos($q, $sequence_separator)!==false):
				// Transform "12,25,36" to "(12 OR 25 OR 36)"
				$ar_parts	= explode($sequence_separator, $q);
				$operator = 'IN';
				$q_clean  = array_map(function($el){
					return (int)$el;
				}, $ar_parts);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= implode(',', $q_clean);
				$query_object->format	= 'in_column';
				break;
			# DISTINCT OF
			case (substr($q, 0, 2)==='!='):
				$operator = '!=';
				$q_clean  = (int)str_replace($operator, '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				break;
			# BIGGER OR EQUAL THAN
			case (substr($q, 0, 2)==='>='):
				$operator = '>=';
				$q_clean  = (int)str_replace($operator, '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				break;
			# SMALLER OR EQUAL THAN
			case (substr($q, 0, 2)==='<='):
				$operator = '<=';
				$q_clean  = (int)str_replace($operator, '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				break;
			# BIGGER THAN
			case (substr($q, 0, 1)==='>'):
				$operator = '>';
				$q_clean  = (int)str_replace($operator, '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				break;
			# SMALLER THAN
			case (substr($q, 0, 1)==='<'):
				$operator = '<';
				$q_clean  = (int)str_replace($operator, '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				break;
			// EQUAL DEFAULT
			default:
				$operator = '=';
				$q_clean  = (int)str_replace('+', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				break;
		}//end switch (true) {


		return $query_object;
	}//end resolve_query_object_sql



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'...'	=> 'between',
			','		=> 'sequence',
			'>='	=> 'greater_than_or_equal',
			'<='	=> 'less_than_or_equal',
			'>'		=> 'greater_than',
			'<'		=> 'less_than'
		];

		return $ar_operators;
	}//end search_operators_info



	/**
	/**
	* EXTRACT_COMPONENT_VALUE_FALLBACK
	* Catch common method calls
	* @return string ''
	*/
	public static function extract_component_value_fallback(object $component, string $lang=DEDALO_DATA_LANG, bool $mark=true, string $main_lang=DEDALO_DATA_LANG_DEFAULT) : string {

		return '';
	}//end extract_component_value_fallback



	/**
	* GET_DIFFUSION_DATA
	* Resolve the default diffusion data
	* is used by the `diffusion_data`
	* for component_section_id the default is its own data
	* @param object $ddo
	* @return array $diffusion_data
	*
	* @see class.diffusion_data.php
	* @test false
	*/
	public function get_diffusion_data( object $ddo ) : array {

		$diffusion_data = [];

		$diffusion_data_object = new diffusion_data_object( (object)[
			'tipo'	=> $this->tipo,
			'lang'	=> null,
			'value'	=> $this->get_dato(),
			'id'	=> $ddo->id ?? null
		]);

		$diffusion_data[] = $diffusion_data_object;

		return $diffusion_data;
	}//end get_diffusion_data




}//end class component_section_id
