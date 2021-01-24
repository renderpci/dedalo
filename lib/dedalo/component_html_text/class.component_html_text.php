<?php
/*
* CLASS COMPONENT_HTML_TEXT
*
*
*/
class component_html_text extends component_common {


	# GET DATO : Format "Hello world"
	public function get_dato() {
		$dato = parent::get_dato();
		return (string)$dato;
	}



	# SET_DATO
	public function set_dato($dato) {			
		if ($dato==='""') {
			$dato = "";
		}

		parent::set_dato( (string)$dato );
	}



	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save( $update_all_langs_tags_state=true ) {
		
		# Dato current assigned
		$dato_current 	= $this->dato;

		# Clean dato 
		$dato_clean 	= $this->clean_text($dato_current);

		# Set dato again (cleaned)
		$this->dato 	= $dato_clean;

			#dump($this->dato,'$this->dato');

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}



	# OVERRIDE COMPONENT_COMMON METHOD
	public function get_ar_tools_obj() {		
		return parent::get_ar_tools_obj();
	}	



	/**
	* GET DATO DEFAULT 
	* Overwrite common_function
	*/
	public function get_dato_default_lang() {

		$dato = parent::get_dato_default_lang();
		
		return $dato;
	}//end get_dato_default_lang



	/**
	* GET VALOR
	* Overwrite common_function
	*/
	public function get_valor() {
		
		switch ($this->modo) {
			case 'dummy':
			case 'diffusion':
				$dato = parent::get_dato();
				break;
			
			default:
				$dato	= parent::get_dato();
				$dato	= $this->clean_text($dato);
				break;
		}		

		return $dato;
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value to export data (tool export)
	* @return string $valor_export
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) {

		$valor_export = $this->get_valor($lang);
		
		return $valor_export;
	}//end get_valor_export



	/**
	* CLEAN_TEXT
	* Anclaje para futuros preprocesados del texto. De momento sólo haremos un trim
	*/
	public function clean_text($string){

		# Desactivo porque elimina el '<mar>'
		#$string = filter_var($string, FILTER_UNSAFE_RAW );	# FILTER_SANITIZE_STRING
		#$string = stripslashes($string);

		return trim($string);
	}//end clean_text



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @return object $query_object
	*/
	public static function resolve_query_object_sql($query_object) {
		
    	# Always set fixed values
		$query_object->type = 'string';

		$q = $query_object->q;
		$q = pg_escape_string(stripslashes($q));

        switch (true) {
        	# IS NULL
			case ($q==='!*'):
				$operator = 'IS NULL';
				$q_clean  = '';
				$query_object->operator = $operator;
    			$query_object->q_parsed	= $q_clean;
    			$query_object->unaccent = false;

				$clone = clone($query_object);
	    			$clone->operator = '~*';
	    			$clone->q_parsed = '\'.*""\'';

				$logical_operator = '$or';
    			$new_query_json = new stdClass;    			
	    			$new_query_json->$logical_operator = [$query_object, $clone];
    			# override
    			$query_object = $new_query_json ;

				break;
			# IS NOT NULL
			case ($q==='*'):
				$operator = 'IS NOT NULL';
				$q_clean  = '';
				$query_object->operator = $operator;
    			$query_object->q_parsed	= $q_clean;
    			$query_object->unaccent = false;

				$clone = clone($query_object);
	    			//$clone->operator = '!=';
	    			$clone->operator = '!~';
	    			$clone->q_parsed = '\'.*""\'';


				$logical_operator ='$and';
    			$new_query_json = new stdClass;    			
    				$new_query_json->$logical_operator = [$query_object, $clone];    

				# override
    			$query_object = $new_query_json ;
				break;
			# IS DIFFERENT			
			case (strpos($q, '!=')===0):
				$operator = '!=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator = '!~';
    			$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
    			$query_object->unaccent = false;
				break;
			# IS SIMILAR
			case (strpos($q, '=')===0):
				$operator = '=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator = '~';
    			$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
    			$query_object->unaccent = true;
				break;
			# NOT CONTAIN
			case (strpos($q, '-')===0):
				$operator = '!~*';
				$q_clean  = str_replace('-', '', $q);
				$query_object->operator = $operator;
    			$query_object->q_parsed	= '\'.*'.$q_clean.'.*\'';
    			$query_object->unaccent = true;
				break;	
			# CONTAIN				
			case (substr($q, 0, 1)==='*' && substr($q, -1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator = $operator;
    			$query_object->q_parsed	= '\'.*".*'.$q_clean.'.*\'';
    			$query_object->unaccent = true;
				break;
			# ENDS WITH
			case (substr($q, 0, 1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator = $operator;
    			$query_object->q_parsed	= '\'.*".*'.$q_clean.'".*\'';
    			$query_object->unaccent = true;
				break;
			# BEGINS WITH
			case (substr($q, -1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator = $operator;
    			$query_object->q_parsed	= '\'.*"'.$q_clean.'.*\'';
    			$query_object->unaccent = true;
				break;
			# LITERAL
			case (substr($q, 0, 1)==='\"' && substr($q, -1)==='\"'):
				$operator = '~';
				$q_clean  = str_replace('\"', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent = false;
				break;
			# CONTAIN
			default:
				$operator = '~*';
				$q_clean  = $q;
				$query_object->operator = $operator;
    			$query_object->q_parsed	= '\'.*".*'.$q_clean.'.*\'';
    			$query_object->unaccent = true;
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
			'*' 	 => 'no_vacio', // not null
			'!*' 	 => 'campo_vacio', // null	
			'=' 	 => 'similar_a',
			'!=' 	 => 'distinto_de',
			'-' 	 => 'no_contiene',
			'*text*' => 'contiene',
			'text*'  => 'empieza_con',
			'*text'  => 'acaba_con',
			'"text"' => 'literal',
		];

		return $ar_operators;
	}//end search_operators_info



	/**
	* RENDER_LIST_VALUE
	* (Overwrite for non default behaviour)
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

		return strip_tags($value);
	}//end render_list_value


	
}//end component_html_text