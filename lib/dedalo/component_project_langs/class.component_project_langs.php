<?php
/*
* CLASS COMPONENT PROJECT LANGS
*/


class component_project_langs extends component_common {
	
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	function __construct($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=NULL) {

		# Force allways DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# EDIT : Si se pasa un id vacío (desde class.section es lo normal), se verifica si existe en matrix y si no, se crea un registro que se usará en adelante
		if($modo=='edit' && empty($id)) {

			# Despeja el id si existe a partir del tipo y el parent
			$id = component_common::get_id_by_tipo_parent($tipo, $parent, $lang);	
				#dump($id,"id calculado (get_id_by_tipo_parent) para tipo:$tipo - parent:$parent - lang:$lang");

			# Si no existe, creamos un registro, si o si
			if(empty($id)) {

				#throw new Exception("component_portal id not found. var: id:$id, tipo:$tipo, modo:$modo, parent:$parent, lang:$lang ", 1);
				

				if( !empty($tipo) && strlen($parent)>0 ) {
					$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
					$RecordObj_matrix 	= new RecordObj_matrix($matrix_table,NULL, $parent, $tipo, $lang);	#($id=NULL, $parent=false, $tipo=false, $lang=DEDALO_DATA_LANG, $matrix_table='matrix')
					$RecordObj_matrix->set_parent($parent);
					$RecordObj_matrix->set_tipo($tipo);
					$RecordObj_matrix->set_lang($lang);
					# Add default project langs from config
					$RecordObj_matrix->set_dato(unserialize(DEDALO_PROJECTS_DEFAULT_LANGS));

					$RecordObj_matrix->Save();
					$id = $RecordObj_matrix->get_ID();

					# DEBUG
					if(SHOW_DEBUG===true) {
					$msg = "INFO: Created component_project_langs record $id with: (tipo:$tipo, parent:$parent, lang:$lang)";
					error_log($msg);
					}
				}else{
					$msg = "Impossible create new component_project_langs record ";
					if(SHOW_DEBUG===true) {
					$msg .= " (id:$id, tipo:$tipo, parent:$parent, lang:$lang, modo:$modo)";
					}
					throw new Exception($msg, 1);
				}
			}
		}

		# ya tenemos registro en matrix, a continuar...
		parent::__construct($id, $tipo, $modo, $parent, $lang);
	}




	# GET AR LANGS (Get array of langs formated as $terminoID => $lang_name)
	protected function get_ar_langs() {
		
		$dato		= $this->get_dato();
		$ar_langs	= array();
		
		if(is_array($dato)) foreach($dato as $terminoID) {
			
			$lang_name				= RecordObj_ts::get_termino_by_tipo($terminoID);			
			$ar_langs[$terminoID]	= $lang_name ;
		}
		return $ar_langs;	
	}
	
	
	/**
	* SAVE
	* Overwrite common Save . Force allways maintain default langs
	*/
	public function Save() {

		# ar langs mandatory (config)
		$dedalo_projects_default_langs = unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);

		# current dato langs
		$current_dato_langs = (array)$this->dato;
		
		# prepend mandatory langs if they are not inside current dato
		foreach ($dedalo_projects_default_langs as $current_lang) {
			if(!in_array($current_lang, $current_dato_langs))
				array_unshift($current_dato_langs, $current_lang);
		}

		# update object
		$this->dato = $current_dato_langs;

		# Reset session var (stored for speed)
		unset($_SESSION['config4']['ar_all_langs']);

		# common save
		return parent::Save();
	}
	
	

}
?>