<?php
/*
* CLASS COMPONENT_GEOLOCATION
*/


class component_geolocation extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	# COMPONENT_GEOLOCATION COSNTRUCT
	function __construct($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=NULL) {
		
		# Force allways DEDALO_DATA_NOLAN
		$lang = $this->lang;				
	

		# Si se pasa un id vacío (desde class.section es lo normal), se verifica si existe en matrix y si no, se crea un registro que se usará en adelante
		if(empty($id)) {

			# Despeja el id si existe a partir del tipo y el parent
			$id = component_common::get_id_by_tipo_parent($tipo, $parent, $lang);	
				#dump($id,'id',"para tipo:$tipo - parent:$parent - lang:$lang");

			# Si no existe, creamos un registro, si o si
			if(empty($id) && $modo=='edit') {

				if( !empty($tipo) && strlen($parent)>0 ) {
					$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
					$RecordObj_matrix 	= new RecordObj_matrix($matrix_table,NULL, $parent, $tipo, $lang);	#($id=NULL, $parent=false, $tipo=false, $lang=DEDALO_DATA_LANG, $matrix_table='matrix')
					$RecordObj_matrix->set_parent($parent);
					$RecordObj_matrix->set_tipo($tipo);
					$RecordObj_matrix->set_lang($lang);
				
					#####################################################################################################
					# DEFAULT VALUES

					# Store section dato as array(key=>value)
					$ar_dato = array();	
					$ar_dato['center']				= '42.819404, -1.646205';	# Museo de Navarra
					$ar_dato['zoom']				= 17;
						#dump($ar_dato,"ar-dato for tipo $this->tipo "); die();

					# END DEFAULT VALUES
					######################################################################################################
					
					# Dato
					$RecordObj_matrix->set_dato($ar_dato);

					$RecordObj_matrix->Save();
					$id = $RecordObj_matrix->get_ID();



					# DEBUG
					if(SHOW_DEBUG===true) {
					$msg = "INFO: Created component_geolocation record $id with: ($tipo, $parent, $lang)";
					error_log($msg);
					}
				}else{
					$msg = "Impossible create new component_geolocation record ";
					if(SHOW_DEBUG===true) {
					$msg .= " ($id,$parent,$tipo,$lang)";
					}
					throw new Exception($msg, 1);
				}
			}
		}

		# ya tenemos registro en matrix, a continuar...
		parent::__construct($id, $tipo, $modo, $parent, $lang);
		
		#dump($this);
	}


	# Josetxo 21/01/2015
	# Transformo el string en array para que guarde el JSON en formato correcto
	public function set_dato($dato) {
		if($dato != ""){
			$objJSON=json_decode($dato, true);
			return parent::set_dato($objJSON);
		}
	}
	# Fin Josetxo 20/01/2015


	# OVERRIDE COMPONENT_COMMON METHOD
	public function get_ar_tools_obj() {
		
		# Remove common tools (time machine and lang)
		unset($this->ar_tools_name);

		# Add tool_transcription
		$this->ar_tools_name[] = 'tool_transcription';

		
		return parent::get_ar_tools_obj();
	}



	/**
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {
		$valor = self::get_dato();

		$separator = ' ,  ';
		if($this->modo=='list') $separator = '<br>';
		
		if (is_array($valor)) {
			# return "Not string value";
			$string  	= '';
			$n 			= count($valor);
			foreach ($valor as $key => $value) {

				if(is_array($value)) $value = print_r($value,true);
				$string .= "$key : $value".$separator;
			}
			$string = substr($string, 0,-4);
			return $string;

		}else{

			return $valor;
		}			
		
	}



}

?>