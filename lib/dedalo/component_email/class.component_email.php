<?php
/*
* CLASS COMPONENT EMAIL
*
*
*/
class component_email extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	/**
	* GET DATO : Format "user@domain.com"
	*/
	public function get_dato() {

		$dato = parent::get_dato();
		
		return (array)$dato;
	}//end get_dato



	/**
	* SET_DATO
	*/
	public function set_dato($dato) {

		$safe_dato=array();
		foreach ((array)$dato as $key => $value) {			
				$safe_dato[] = component_email::clean_email($value);		
		}
		$dato = $safe_dato;

		parent::set_dato( (array)$dato );		
	}//end set_dato



	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		# Opcionalmente se podría validar mediante aquí el dato.. aunque ya se ha hecho en javascript
		$email = $this->get_dato();
		foreach ((array)$email as $key => $value) {		
			if (!empty($value) && false===component_email::is_valid_email($value)) {
				debug_log(__METHOD__." No data is saved. Invalid email ".to_string($value), logger::ERROR);
				return false;
			}
		}

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}//end Save



	/**
	* IS_VALID_EMAIL
	* @return bool
	*/
	public static function is_valid_email( $email ) {

		return filter_var($email, FILTER_VALIDATE_EMAIL) 
        	&& preg_match('/@.+\./', $email);
	}//end is_valid_email



	/**
	* CLEAN_EMAIL
	* @return string $email
	*/
	public static function clean_email($email) {
		
		$email = trim($email);

		if (!empty($email)) {
			$email = preg_replace('=((<CR>|<LF>|0x0A/%0A|0x0D/%0D|\\n|\\r|\'|\")\S).*=i', null, $email);
		}
		

		return $email;
	}//end clean_email



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
		
		$q = pg_escape_string(stripslashes($q));

		$q_operator = isset($query_object->q_operator) ? $query_object->q_operator : null;

		# Prepend if exists
		#if (isset($query_object->q_operator)) {
		#	$q = $query_object->q_operator . $q;
		#}

		switch (true) {
			# EMPTY VALUE (in current lang data)
			case ($q==='!*'):
				$operator = 'IS NULL';
				$q_clean  = '';
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				$query_object->unaccent = false;
				$query_object->lang 	= 'all';

				$logical_operator = '$or';
				$new_query_json = new stdClass;
					$new_query_json->$logical_operator = [$query_object];

				// Search empty only in current lang
				// Resolve lang based on if is translatable
					$path_end 		= end($query_object->path);
					$component_tipo = $path_end->component_tipo;
					$RecordObj_dd   = new RecordObj_dd($component_tipo);
					$lang 			= $RecordObj_dd->get_traducible()!=='si' ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;

					#$clone = clone($query_object);
					#	$clone->operator = '=';
					#	$clone->q_parsed = '\'[]\'';
					#	$clone->lang 	 = $lang;
					#$new_query_json->$logical_operator[] = $clone;

					$clone = clone($query_object);
						$clone->operator = '=';
						$clone->q_parsed = '\'\'';
						$clone->lang 	 = $lang;
					$new_query_json->$logical_operator[] = $clone;

					// legacy data (set as null instead '')
					$clone = clone($query_object);
						$clone->operator = 'IS NULL';
						$clone->lang 	 = $lang;
					$new_query_json->$logical_operator[] = $clone;			

				# override
				$query_object = $new_query_json ;
				break;
			# NOT EMPTY (in any project lang data)
			case ($q==='*'):
				$operator = 'IS NOT NULL';
				$q_clean  = '';
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				$query_object->unaccent = false;

				$logical_operator ='$and';
				$new_query_json = new stdClass;
					$new_query_json->$logical_operator = [$query_object];

				// langs check
					$ar_query_object = [];
					
						#$clone = clone($query_object);
						#	$clone->operator = '!=';
						#	$clone->q_parsed = '\'[]\'';
						#	$clone->lang 	 = DEDALO_DATA_NOLAN;
						#$ar_query_object[] = $clone;

						$clone = clone($query_object);
							$clone->operator = '!=';
							$clone->q_parsed = '\'\'';
							$clone->lang 	 = DEDALO_DATA_NOLAN;
						$ar_query_object[] = $clone;
					

					$logical_operator ='$or';
					$langs_query_json = new stdClass;
						$langs_query_json->$logical_operator = $ar_query_object;				

				# override
				$query_object = [$new_query_json, $langs_query_json];
				break;
			# IS DIFFERENT			
			case (strpos($q, '!=')===0 || $q_operator==='!='):
				$operator = '!=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator = '!~';
				$query_object->q_parsed = '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent = false;
				break;
			# IS SIMILAR
			case (strpos($q, '=')===0 || $q_operator==='='):
				$operator = '=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator = '~*';
				$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent = true;
				break;
			# NOT CONTAIN
			case (strpos($q, '-')===0 || $q_operator==='-'):
				$operator = '!~*';
				$q_clean  = str_replace('-', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*".*'.$q_clean.'.*\'';
				$query_object->unaccent = true;
				break;
			# CONTAIN EXPLICIT
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
			case (substr($q, 0, 1)==="'" && substr($q, -1)==="'"):
				$operator = '~';
				$q_clean  = str_replace("'", '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent = false;
				break;
			# DEFAULT CONTAIN 
			default:
				$operator = '~*';
				$q_clean  = str_replace('+', '', $q);				
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*".*'.$q_clean.'.*\'';
				$query_object->unaccent = true;
				break;			
		}//end switch (true) {
		#dump($query_object, ' query_object ++ '.to_string());
	   

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
			'\'text\'' => 'literal',
		];

		return $ar_operators;
	}//end search_operators_info

	/**
	* GET_STRUCTURE_BUTTONS
	* @return 
	*/
	public function get_structure_buttons($permissions=null) {
		

		return [];
	}//end get_structure_buttons

}
?>