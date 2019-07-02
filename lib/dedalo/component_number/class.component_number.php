<?php
/*
* CLASS COMPONENT_NUMBER
*
*
*/
class component_number extends component_common {
	

	
	/**
	* GET_DATO
	*/
	public function get_dato() {

		$dato = parent::get_dato();				
	
		$format_dato = $this->set_format_form_type($dato);
		
		return $format_dato;
	}//end get_dato



	/**
	* SET_DATO
	*/
	public function set_dato($dato) {

		if ($dato==='') {
			$dato = null;
		}

		$format_dato = $this->set_format_form_type($dato);

		return parent::set_dato( $format_dato );				
	}//end set_dato



	/**
	* GET_VALOR
	* Returns int or float number as string formatted
	* @return string $valor
	*/
	public function get_valor() {

		$dato = $this->get_dato();
		if (is_array($dato)) {
			$valor = component_number::number_to_string($dato[0]);		
		}else{
			$valor = component_number::number_to_string($dato);	
		}
		
		return (string)$valor;
	}//end get_valor



	/*
	* SET_FORMAT_FORM_TYPE
	* Format the dato into the standard format or the propiedades format of the current intance of the component
	*/
	public function set_format_form_type( $dato ) {

		$propiedades = $this->get_propiedades();

		if($dato === null || empty($dato)){
			return $dato;
		}

	
		if(empty($propiedades->type)){			
			return (float)$dato;
		}else{
			foreach ($propiedades->type as $key => $value) {

				switch ($key) {
					case 'int':
						if($value === 0 || empty($value)){
							return (int)$dato;
						}
						if ( strpos($dato, '-')===0 )  {
							$dato = '-'.substr($dato,1,$value);
							$dato = (int)$dato;

						}else{
							$dato = (int)substr($dato,0,$value);
						}						
						break;
					
					default:
						$dato = (float)round($dato,$value);
						break;
				}

			}//end foreach ($propiedades->type as $key => $value)
		}//end if(empty($propiedades->type))

		return $dato;
	}//end set_format_form_type



	/*
	* NUMBER_TO_STRING
	* Format the dato into the standard format or the propiedades format of the current intance of the component
	*/
	public function number_to_string( $dato ) {

		$propiedades = $this->get_propiedades();

		if($dato === null || empty($dato)){
			return $dato;
		}

		if(empty($propiedades->type)){			
			return (string)$dato;
		}else{
			foreach ($propiedades->type as $key => $value) {

				switch ($key) {
					case 'int':
						if($value === 0 || empty($value)){
							return (string)$dato;
						}
						if ( strpos($dato, '-')===0 )  {
							$dato = '-'.substr($dato,1,$value);
							$dato = (string)$dato;

						}else{
							$dato = (string)substr($dato,0,$value);
						}						
						break;
					
					default:
						$dato = number_format($dato,$value,'.','');
						break;
				}

			}//end foreach ($propiedades->type as $key => $value)
		}//end if(empty($propiedades->type))

		return $dato;
	}//end number_to_string



	/**
	* RENDER_LIST_VALUE
	* Overwrite for non default behaviour
	* Receive value from section list and return proper value to show in list
	* Sometimes is the same value (eg. component_input_text), sometimes is calculated (e.g component_portal)
	* @param string $value
	* @param string $tipo
	* @param int $parent
	* @param string $modo
	* @param string $lang
	* @param string $section_tipo
	* @param int $section_id
	*
	* @return string $list_value
	*/
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id, $current_locator=null, $caller_component_tipo=null) {
	

		$component 	= component_common::get_instance(__CLASS__,
													 $tipo,
												 	 $parent,
												 	 $modo,
													 DEDALO_DATA_NOLAN,
												 	 $section_tipo);
		
		# Use already query calculated values for speed
		#$dato = json_handler::decode($value);
		#$component->set_dato($dato);

		$component->set_identificador_unico($component->get_identificador_unico().'_'.$section_id.'_'.$caller_component_tipo); // Set unic id for build search_options_session_key used in sessions
		
		$value = $component->get_html();
		#$value = $component->get_valor();


		return $value;		
	}//end render_list_value



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @return object $query_object
	*/
	public static function resolve_query_object_sql($query_object) {
		
		$q = $query_object->q;
		if (isset($query_object->type) && $query_object->type==='jsonb') {
			$q = json_decode($q);
		}	

    	# Always set fixed values
		$query_object->type = 'number';


		$query_object->component_path[] = 'lg-nolan'; 
		
		# Always without unaccent
		$query_object->unaccent = false;

		$between_separator  = '...';
		//$sequence_separator = ',';

        switch (true) {
        	
        	# BETWEEN
			case (strpos($q, $between_separator)!==false):
				// Transform "12...25" to "12 AND 25"
				$ar_parts 	= explode($between_separator, $q);
				$first_val  = !empty($ar_parts[0]) ? intval($ar_parts[0]) : 0;
				$second_val = !empty($ar_parts[1]) ? intval($ar_parts[1]) : $first_val;

				$query_object_one = clone $query_object;
					$query_object_one->operator = '>=';
					$query_object_one->q_parsed	= '\''.$first_val.'\'';

				$query_object_two = clone $query_object;
					$query_object_two->operator = '<=';
					$query_object_two->q_parsed	= '\''.$second_val.'\'';

				// Return an array instead object
				#$query_object = [$query_object_one,$query_object_two];
				
				// Group in a new "AND"
				$current_op = '$and';
				$new_query_object = new stdClass();
					$new_query_object->{$current_op} = [$query_object_one,$query_object_two];

				$query_object = $new_query_object;
				break;	
        	# SEQUENCE
			/*case (strpos($q, $sequence_separator)!==false):
				// Transform "12,25,36" to "(12 OR 25 OR 36)"
				$ar_parts 	= explode($sequence_separator, $q);
				$ar_result  = []; 
				foreach ($ar_parts as $key => $value) {
					$value = (int)$value;
					if ($value<1) continue;
					$query_object_current = clone $query_object;
						$query_object_current->operator = '=';
						$query_object_current->q_parsed	= '\''.$value.'\'';
					$ar_result[] = $query_object_current;
				}
				// Return an subquery instead object
				$cop = '$or';
				$new_object = new stdClass();
					$new_object->{$cop} = $ar_result;
				$query_object = $new_object;
				break;
				*/
			# BIGGER OR EQUAL THAN
			case (substr($q, 0, 2)==='>='):
				$operator = '>=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator = $operator;
    			$query_object->q_parsed	= '\''.$q_clean.'\'';
				break;
			# SMALLER OR EQUAL THAN
			case (substr($q, 0, 2)==='<='):
				$operator = '<=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator = $operator;
    			$query_object->q_parsed	= '\''.$q_clean.'\'';
				break;		
			# BIGGER THAN
			case (substr($q, 0, 1)==='>'):
				$operator = '>';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator = $operator;
    			$query_object->q_parsed	= '\''.$q_clean.'\'';
				break;
			# SMALLER THAN
			case (substr($q, 0, 1)==='<'):
				$operator = '<';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator = $operator;
    			$query_object->q_parsed	= '\''.$q_clean.'\'';
				break;
			// EQUAL DEFAULT
			default:
				$operator = '=';
				$q_clean  = str_replace('+', '', $q);				
				$query_object->operator = $operator;
    			$query_object->q_parsed	= '\''.$q_clean.'\'';	
				break;
		}//end switch (true) {		


        return $query_object;
	}//end resolve_query_object_sql



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() {
		
		$ar_operators = [
			'...' 	=> 'entre',
			#',' 	=> 'secuencia',
			'>=' 	=> 'mayor_o_igual_que',
			'<='	=> 'menor_o_igual_que',
			'>' 	=> 'mayor_que',
			'<'		=> 'menor_que',
			#'=' 	=> 'igual'
		];

		return $ar_operators;
	}//end search_operators_info



	/**
	* GET_DIFFUSION_VALUE
	* Calculate current component diffsuion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( $lang ) {
		
		$dato 			 = parent::get_dato();
		$diffusion_value = $dato;

		return $diffusion_value;
	}//end get_diffusion_value



}//end component_number
?>