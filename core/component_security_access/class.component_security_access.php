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
	* GET_DATALIST
	* @return 
	*/
	public function get_datalist() {

		$user_id = navigator::get_user_id();
		$is_global_admin = security::is_global_admin($user_id);
		$ar_areas = [];


		if($user_id === DEDALO_SUPERUSER || $is_global_admin=== true){

			$ar_areas = area::get_areas();

		}else{

			$dato = $this->get_dato();

			$ar_permisions_areas = array_filter($dato, function($item) {
				return (isset($item->type) && $item->type==='area') ? $item : null;
			});

			foreach ($ar_permisions_areas as $item) {
				$ar_areas[]	= ontology::tipo_to_json_item($item->tipo);
			}	
		}

		$datalist = new stdClass();
			$datalist->result = $ar_areas;

		return $datalist;	
	}//end get_datalist



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
		}		
	}//end update_dato_version


	
};
?>