<?php
/*
* CLASS COMPONENT SECURITY ACCESS
* Manages
*
*/
class component_security_access extends component_common {



	/**
	* GET DATO 
	* @return object $dato
	* Format [{"tipo":"dd21","parent":"dd20","value":3}]
	*/
	public function get_dato() {
		$dato = parent::get_dato();
		if (!is_array($dato) && empty($dato)) {
			$dato = [];
		}

		return (array)$dato;
	}



	/**
	* SET_DATO
	* @param object $dato
	*/
	public function set_dato($dato) {
		if (!is_array($dato)) {
			if(empty($dato)) {
				$dato = [];
			}else{
				$dato = (array)$dato;
			}
		}
		parent::set_dato($dato);
	}
	


	/**
	* GET_CONTEXT
	* @return 
	*/
	public function get_context() {

		$user_id = navigator::get_user_id();

		if($user_id<0){

			$ar_areas = area::get_areas();

		}else{

			$dato = $this->get_dato();

			foreach ($dato as $current_item) {
					$RecordObj_dd 	= new RecordObj_dd($current_item->tipo);
					$label 			= $RecordObj_dd->get_label();
					$parent 		=[];
				}
			
		}
		
	}//end get_context




	/**
	* GET ARRAY TIPO ADMIN
	* @return array $ar_tipo_admin
	* Devulve el área 'Admin' además de sus hijos
	* (usado para excluirles las opciones admin en el arbol)
	*/
	public static function get_ar_tipo_admin() {

		# STATIC CACHE
		static $ar_tipo_admin;
		if(isset($ar_tipo_admin)) return $ar_tipo_admin;

		$ar_result 	= RecordObj_dd::get_ar_terminoID_by_modelo_name($modelo_name='area_admin', $prefijo='dd');
		$ar_tesauro = array();

		if(!empty($ar_result[0])) {
			$tipo					= $ar_result[0];
			$obj 					= new RecordObj_dd($tipo);
			$ar_childrens_of_this	= $obj->get_ar_childrens_of_this();
			$ar_tesauro 			= $ar_childrens_of_this;
			#dump($ar_tesauro);
		}
		# Añadimos el propio termino como padre del arbol
		#array_push($ar_tesauro, $tipo);
		array_unshift($ar_tesauro, $tipo);

		# STORE CACHE DATA
		$ar_tipo_admin = $ar_tesauro ;

		#dump($ar_tesauro," ar_tesauro");

		return $ar_tesauro ;
	}


	/**
	* GET_AR_CHILDREN_ELEMENTS
	* @return array $ar_children_elements
	*/
	public static function get_ar_children_elements( $tipo ) {
		
		$get_ar_children_elements = array();

		$RecordObj_dd			= new RecordObj_dd($tipo);
		$ar_ts_childrens		= $RecordObj_dd->get_ar_childrens_of_this();
			#dump($ar_ts_childrens, ' ar_ts_childrens ++ '.to_string());
					
		foreach ((array)$ar_ts_childrens as $children_terminoID) {				
			
			$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($children_terminoID,true);								
			$ar_exclude_modelo		= array('section_list','box_elements','exclude_elements');		# ,'filter'	,'tools','search_list'
			$exclude_this_modelo 	= false;
			foreach($ar_exclude_modelo as $modelo_exclude) {					
				if( strpos($modelo_name, $modelo_exclude)!==false ) {
					$exclude_this_modelo = true;
					break;	
				}
			}
			
			if ( $exclude_this_modelo !== true ) {		
				#$ar_temp = self::get_ar_ts_childrens_recursive($children_terminoID);						
				$get_ar_children_elements[] = $children_terminoID;				
			}				
		}

		return $get_ar_children_elements;
	}//end get_ar_children_elements



	/**
	* UPDATE_DATO_VERSION
	* @param array $update_version
	* @param mixed $dato_unchanged
	* @return object $response
	*/
	public static function update_dato_version($request_options) {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->dato_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version = $options->update_version;
			$dato_unchanged = $options->dato_unchanged;
			$reference_id 	= $options->reference_id;

		$update_version = implode(".", $update_version);
		#dump($dato_unchanged, ' dato_unchanged ++ -- '.to_string($update_version)); #die();

		switch ($update_version) {

			case '6.0.0':

			// old dato: {"oh1":{"oh2":2}}
			// new dato :[{"tipo":"oh2","parent":"oh1","value":2}]

			if(!empty($dato_unchanged) && is_object($dato_unchanged)) {

				$new_dato = [];
				foreach ($dato_unchanged as $current_parent => $current_ar_tipo) {
					foreach ($current_ar_tipo as $current_tipo => $value) {
						$current_dato = new stdClass();
						$current_dato->tipo 	= $current_tipo;
						$current_dato->parent 	= $current_parent;
						$current_dato->value 	= $value;
						$new_dato[] = $current_dato;
					}
				}

				$response = new stdClass();
					$response->result = 1;
					$response->new_dato = $new_dato;
					$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";

			}else{
				$response = new stdClass();
					$response->result = 2;
					$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
					return $response;
				}

			return $response;
			break;

			case '4.0.11':					
				$data_changed=false;
				if(!empty($dato_unchanged)) {

					$new_dato = new stdClass();
					foreach ((object)$dato_unchanged as $tipo => $value) {

						if (is_object($value)) {
							break; // Temporal !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! sólo para datos mezcados 4.0.10 y 4.0.11 en la instalación de desarrollo
						}

						# Group elements by section
						$ar_terminoID = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo, 'section', 'parent', $search_exact=true);
						if (!empty($ar_terminoID[0])) {
							$section_tipo = $ar_terminoID[0];
						
							if (!isset($new_dato->$section_tipo)) {
								$new_dato->$section_tipo = new stdClass();
							}
							$new_dato->$section_tipo->$tipo = (int)$value; // Convert values to int
							$data_changed=true;
						}					
					}					
				}
					
				# Compatibility old dedalo instalations
				if ($data_changed) {
					$response = new stdClass();
						$response->result =1;
						$response->new_dato = $new_dato;
						$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
					return $response;
				}else{
					$response = new stdClass();
						$response->result = 2;
						$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
					return $response;
				}
				break;

		}		
	}//end update_dato_version





	
	
};
?>