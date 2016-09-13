<?php
/*
* CLASS COMPONENT_GEOLOCATION
*/


class component_geolocation extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	# COMPONENT_GEOLOCATION COSNTRUCT
	function __construct($tipo, $parent=null, $modo='edit', $lang=NULL, $section_tipo=null) {
		
		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		# Dato : Verificamos que hay un dato. Si no, asignamos el dato por defecto en el idioma actual
		$dato = $this->get_dato();

		# Si se pasa un id vacío (desde class.section es lo normal), se verifica si existe en matrix y si no, se crea un registro que se usará en adelante
		$need_save=false;
		if((!isset($dato->lat) || !isset($dato->lon)) && $this->parent>0) {
			#####################################################################################################
			# DEFAULT VALUES
			# Store section dato as array(key=>value)
			$dato_new = new stdClass();	
				$dato_new->lat		= '39.462571';
				$dato_new->lon		= '-0.376295';	# Calle Denia
				$dato_new->zoom		= 17;
				$dato_new->alt		= 16;
				#$dato_new->coordinates	= array();
			# END DEFAULT VALUES
			######################################################################################################
			
			# Dato
			$this->set_dato($dato_new);
			$need_save=true;
		}

		#
		# CONFIGURACIÓN NECESARIA PARA PODER SALVAR
		# Nothing to do here

		if ($need_save===true) {

			$result = $this->Save();

			# DEBUG
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__."  Added default component_geolocation data $parent with: ($tipo, $lang) dato: ".to_string($dato_new), logger::DEBUG);
			}
		}

		
		if(SHOW_DEBUG) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible=='si') {
				throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
			}
		}
						
	}


	# GET DATO : Format {"center":"39.462571, -0.376295","zoom":17}
	public function get_dato() {
		$dato = parent::get_dato();
		return (object)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (object)$dato );
	}


	# OVERRIDE COMPONENT_COMMON METHOD
	public function get_ar_tools_obj() {
		
		# Remove common tools (time machine and lang)
		#unset($this->ar_tools_name);
		$this->ar_tools_name = array();

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
		
		$valor = (array)self::get_dato();

		$separator = ' ,  ';
		if($this->modo=='list') $separator = '<br>';
	#dump($valor,"valor");
		if (is_object($valor)) {
			$valor = array($valor); # Convert json obj to array			
		}

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
		
	}//end get_valor





};
?>