<?php
/*
* CLASS COMPONENT_JSON
*
*
*/
class component_json extends component_common {


	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	
	/**
	* __CONSTRUCT
	* Call parent component_common constructor
	*/
	public function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {
		
		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);
	}//end __construct



	/**
	* GET_DATO
	* @return obejct $dato
	*/
	public function get_dato() {

		// Compressed dato to avoid postgresql change index order
		$dato = parent::get_dato();

		// De-Compress dato
		$dato = json_decode($dato);

		if(!empty($dato) && !is_object($dato) && !is_array($dato)) {			
			trigger_error("Error. dato converted to empty object because is not as expected object. ". gettype($dato));			
			$dato = new stdClass();
		}

		return $dato;
	}//end get_dato



	/**
	* SET_DATO
	*/
	public function set_dato($dato) {

		if (!empty($dato)) {

			if (is_string($dato)) {

				if ($this->modo==='search') {
					$dato = [$dato];
				}else{
					if (!$dato = json_decode($dato)) {
						trigger_error("Error. Only valid JSON is accepted as dato");
						return false;
					}
				}
			}

			if(!is_object($dato) && !is_array($dato)) {
				trigger_error("Error. Stopped set_dato because is not as expected object. ". gettype($dato));
				return false;
			}
		}

		// Compress dato to avoid postgresql change index order
		$dato = json_encode($dato);
		#$dato = serialize($dato);
		//error_log( print_r($dato, true) );
		
		parent::set_dato( $dato );
	}//end set_dato



	/**
	* GET_VALOR
	* @return string $valor
	*/
	public function get_valor() {
		$dato  = $this->get_dato();
		$valor = json_encode($dato);

		return $valor;
	}//end get_valor



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* @return object $query_object
	*	Edited/parsed version of received object
	*/
	public static function resolve_query_object_sql($query_object) {
		#debug_log(__METHOD__." query_object ".to_string($query_object), logger::DEBUG);

		$q = $query_object->q;
		if (isset($query_object->type) && $query_object->type==='jsonb') {
			$q = json_decode($q);
		}

		# Always set fixed values
		$query_object->type = 'string';
		$query_object->unaccent = false;

		$q = pg_escape_string(stripslashes($q));

		$q_operator = isset($query_object->q_operator) ? $query_object->q_operator : null;

		$component		= end($query_object->path);
		$component_tipo	= $component->component_tipo;

		switch (true) {
			# EMPTY VALUE (in current lang data)
			case ($q==='!*'):
				$operator = 'IS NULL';
				$q_clean  = '';
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				$query_object->lang 	= 'all';

				$logical_operator = '$or';
				$new_query_json = new stdClass;
					$new_query_json->$logical_operator = [$query_object];

				// Search empty only in current lang
				// Resolve lang based on if is translatable
					$path_end		= end($query_object->path);
					$component_tipo	= $path_end->component_tipo;
					$lang			= DEDALO_DATA_NOLAN;

					$clone = clone($query_object);
						$clone->operator = '=';
						$clone->q_parsed = '\'[]\'';
						$clone->lang 	 = $lang;

					$new_query_json->$logical_operator[] = $clone;

					$clone2 = clone($query_object);
						$clone2->operator = '=';
						$clone2->q_parsed = '\'{}\'';
						$clone2->lang 	 = $lang;

					$new_query_json->$logical_operator[] = $clone2;

					// legacy data (set as null instead [])
					$clone = clone($query_object);
						$clone->operator = 'IS NULL';
						$clone->lang 	 = $lang;

					$new_query_json->$logical_operator[] = $clone;

				# override
				$query_object = $new_query_json;
				break;
			# NOT EMPTY (in any project lang data)
			case ($q==='*'):
				$operator = 'IS NOT NULL';
				$q_clean  = '';
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;

				$logical_operator ='$and';
				$new_query_json = new stdClass;
					$new_query_json->$logical_operator = [$query_object];

				// langs check
					$ar_query_object	= [];
					$ar_all_langs		= [DEDALO_DATA_NOLAN]; // Added no lang also
					foreach ($ar_all_langs as $current_lang) {

						$clone = clone($query_object);
							$clone->operator = '!=';
							$clone->q_parsed = '\'[]\'';
							$clone->lang 	 = $current_lang;

						$clone2 = clone($query_object);
							$clone2->operator = '!=';
							$clone2->q_parsed = '\'{}\'';
							$clone2->lang 	 = $current_lang;

						$current_operator ='$and';
						$current_langs_query_json = new stdClass;
							$current_langs_query_json->$current_operator = [$clone, $clone2];

						$ar_query_object[] = $current_langs_query_json;
					}

					$logical_operator ='$or';
					$langs_query_json = new stdClass;
						$langs_query_json->$logical_operator = $ar_query_object;

				# override
				$query_object = [$new_query_json, $langs_query_json];
				break;
			# NOT CONTAIN
			case (strpos($q, '-')===0 || $q_operator==='-'):
				$operator	= '!~*';
				$q_clean	= str_replace('-', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*'.$q_clean.'.*\'';
				break;
			# CONTAIN EXPLICIT
			case (substr($q, 0, 1)==='*' && substr($q, -1)==='*'):
				$operator	= '~*';
				$q_clean	= str_replace('*', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*'.$q_clean.'.*\'';
				break;
			# LITERAL
			case (substr($q, 0, 1)==="'" && substr($q, -1)==="'"):
				$operator	= '~';
				$q_clean	= str_replace("'", '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
				break;
			# DEFAULT CONTAIN
			default:
				$operator	= 'ILIKE';
				$q_clean	= $q;
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'%'.$q_clean.'%\'';
				break;
		}//end switch (true)


		return $query_object;
	}//end resolve_query_object_sql



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() {

		$ar_operators = [
			'*' 	 => 'no_vacio', // not null
			'!*' 	 => 'campo_vacio', // null
			// '=' 	 => 'similar_a',
			// '!=' 	 => 'distinto_de',
			'-' 	 => 'no_contiene',
			// '*text*' => 'contiene',
			// 'text*'  => 'empieza_con',
			// '*text'  => 'acaba_con',
			// '\'text\'' => 'literal',
		];

		return $ar_operators;
	}//end search_operators_info



}//end class component_json