<?php
/*
* CLASS COMPONENT REF
 La idea es que sea un puntero hacia otros componentes. Que guarde el id_matrix y el tipo y se resuelva al mostrarse.
 Ejemplo: guardamos el id_matrix del usuario actual desde activity y al mostrar el componente en los listado de actividad, mostramos su resolución
 en lugar de su dato (Admin por )... por acabar..
*/


class component_autocomplete extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	# Array of related terms in structure (one or more)
	protected $ar_terminos_relacionados;

	# referenced component tipo
	public $referenced_tipo;

	/*
	function __construct($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {

		parent::__construct($id, $tipo, $modo, $parent, $lang);

		$this->referenced_tipo = $this->get_referenced_tipo();
	}
	*/


	/**
	* SAVE OVERRIDE
	* Overwrite component_common method
	*/
	public function Save() {		

		# Salvamos de forma estándar
		return parent::Save();


		/*
		#
		# DELETE TERM CASE (EN PROCESO)
		#
			# Dato candidate to save
			$dato = $this->dato;

			# DELETE TERM
			if(intval($dato)>0) {
				# Tipo referenced
				#$component_tipo = $this->get_referenced_tipo();	
				# Dato exists in any matrix record
				$dato_exists = component_common::dato_already_exists($dato, $component_tipo=NULL);
					dump($dato_exists,'$dato_exists'); return null;

				if ($dato_exists===false) {
					# REMOVE SECTION LIST RECORD
					$section_id 	= intval($dato);
					$section_tipo 	= common::get_tipo_by_id($section_id, $table='matrix');
					$section 		= new section($section_id,$section_tipo);
						dump($section,'section to delete '.$dato);
					#$section->Delete('delete_record');
				}
			}
		*/
	}


	/**
	* GET_REFERENCED_TIPO
	*/
	public function get_referenced_tipo() {

		$referenced_tipo = null;

		# RELACIONES : Search and add relations to current component
		$relaciones = $this->RecordObj_ts->get_relaciones();
			#dump($relaciones,'$relaciones');

		# ONLY 1 TR IS ALLOWED
		if(count($relaciones)!=1) {
			$tipo 		= $this->get_tipo();
			$termino 	= RecordObj_ts::get_termino_by_tipo($tipo);
			$modelo 	= RecordObj_ts::get_modelo_name_by_tipo($tipo);
			$msg = "Error Processing Request. invalid number of related components (".count($relaciones).") $termino";
			if(SHOW_DEBUG) {
				#dump($this,'this');				
				$msg .= "<hr> $modelo : $termino [$tipo] => relaciones = ". var_export($relaciones,true);
			}				
			throw new Exception($msg, 1);
		} 

		if (!empty($relaciones) && is_array($relaciones)) {

			foreach($relaciones as $ar_relaciones) {

				foreach($ar_relaciones as $tipo_modelo => $current_tipo) {
					#dump($referenced_tipo,'$referenced_tipo');
					$referenced_tipo = $current_tipo;
					break;
				}
			}

		# DEFAULT : Default searhc tipo is self component tipo
		}else{

			#$referenced_tipo[] = $this->get_tipo();
			$msg = "Error Processing Request. Related components not found";
			throw new Exception($msg, 1);			
		}

		return $referenced_tipo;
	}

	

	/**
	* GET VALOR 
	* Get resolved string representation of current value (expected id_matrix of section or array)
	*/
	public function get_valor() {
		
		$referenced_tipo 	= $this->get_referenced_tipo();
		$id_matrix			= intval($this->dato);
			#dump($id_matrix,'$id_matrix');

		if ($id_matrix>0) {
				
				$ar_list_of_values	= $this->get_ar_list_of_values();
				$dato 				= $this->get_dato();
					#dump($ar_list_of_values,'ar_list_of_values dato: '.$dato);

				if(!is_array($dato)) $dato = array($dato);

				$dato_string = NULL;
				if (isset($dato[0])) {
					$dato_string = $dato[0];
				}
				#dump($dato);
				
				if (is_array ($ar_list_of_values)) foreach ($ar_list_of_values as $value => $rotulo) {
								
					if( $value == $dato_string ) {
						
						$this->valor = $rotulo;	#dump($rotulo,'$rotulo');	
						
						return $this->valor;
					}
				}
		}
		/**/
		
		return null;					
	}

	
	/**
	* AUTOCOMPLETE_SEARCH
	* Used by trigger on ajax call
	* @param tipo
	* @param string_to_search
	* @return ar_result 
	*	Array format: id_matrix=>dato_string 
	*/
	public static function autocomplete_search($referenced_tipo, $string_to_search, $max_results=30) {

		# AR REFERENCED TIPO IS EMPTY
		if (empty($referenced_tipo)) return NULL;

		
		# SEARCH STRING : Search dato begins with 'string_to_search' and get array of 'parent'
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'parent';		
		// Array referenced tipo
		$arguments['tipo']				= $referenced_tipo;
		$arguments['dato:json_begins']	= $string_to_search;
		$arguments['lang:or']			= array(DEDALO_DATA_LANG, DEDALO_DATA_NOLAN);
		$arguments['sql_limit']			= $max_results;
		$matrix_table 					= common::get_matrix_table_from_tipo($referenced_tipo);
		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_records						= $RecordObj_matrix->search($arguments);
			#dump($arguments,'arguments'); dump($ar_records,'ar_records');	

		# SEARCH FULL STRING : Iterate and search full dato of previous founded records (by stored array of parents)
		$ar_result = array();
		if(is_array($ar_records)) foreach ($ar_records as $id_matrix) {

			$arguments=array();
			$arguments['strPrimaryKeyName']	= 'dato';
			$arguments['parent']			= $id_matrix;
			$arguments['tipo']				= $referenced_tipo;
			$matrix_table 					= common::get_matrix_table_from_tipo($referenced_tipo);
			$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
			$ar_records_dato				= $RecordObj_matrix->search($arguments);

			$ar_result[$id_matrix] 	= json_handler::decode($ar_records_dato[0]);
		}
		#dump($ar_result,'$ar_result');

		return $ar_result;
	}











}
?>