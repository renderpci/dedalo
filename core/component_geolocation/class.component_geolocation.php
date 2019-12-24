<?php
/*
* CLASS COMPONENT_GEOLOCATION
*
*
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
				$dato_new->zoom		= 12;
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
			# debug_log(__METHOD__."  Added default component_geolocation data $parent with: ($tipo, $lang) dato: ".to_string($dato_new), logger::DEBUG);
		}

		
		if(SHOW_DEBUG) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible==='si') {
				#throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
				trigger_error("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP");
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

		# json encoded dato
		if (is_string($dato)) {
			$dato = json_decode($dato);
		}

		if (!isset($dato->zoom)) {
			$dato->zoom = "12";
		}

		parent::set_dato( (object)$dato );
	}


	/**
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {
		
		$valor = (array)self::get_dato();

		$separator = ' ,  ';
		if($this->modo==='list') $separator = '<br>';
	
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



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( $lang=null ) {
	
		$dato 			 = $this->get_dato();
		$diffusion_value = json_encode($dato);

		return (string)$diffusion_value;
	}//end get_diffusion_value



	/**
	* BUILD_GEOLOCATION_TAG_STRING
	* Example
	* [geo-n-1-data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[2.304362542927265,41.82053505145308]}}]}:data]
	* {
		"type": "FeatureCollection",
		"features": [
		    {
		      "type": "Feature",
		      "properties": {},
		      "geometry": {
		        "type": "Point",
		        "coordinates": [
		          2.304362542927265,
		          41.82053505145308
		        ]
		      }
		    }
		]
	* }
	*
	* @return 
	*/
	public static function build_geolocation_tag_string($tag_id, $lon, $lat) {
		/*
		$geometry = new stdClass();
			$geometry->type 		= "Point";
			$geometry->coordinates 	= array($lon, $lat)

		$feature = new stdClass();
			$feature->type 		 = "Feature";
			$feature->properties = new stdClass();
			$feature->geometry 	 = $geometry
		
		$data = new stdClass();
			$data->type 	= 'FeatureCollection';
			$data->features = array( $feature );
		*/
		$result = "[geo-n-".$tag_id."-data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[".$lon.",".$lat."]}}]}:data]";

		return (string)$result;
	}//end build_geolocation_tag_string



	/**
	* GET_DIFFUSION_VALUE_SOCRATA
	* Calculate current component diffusion value for target field in socrata
	* Used for diffusion_mysql to unify components diffusion value call to publish in socrata
	* @return string $diffusion_value_socrata
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value_socrata() {
	
		$dato 			= $this->get_dato();
		$socrata_data 	= 'POINT ('.$dato->lat.', '.$dato->lon.')';

		# {
		#   "type": "Point",
		#   "coordinates": [
		#     -87.653274,
		#     41.936172
		#   ]
		# }

		$geo_json_point = new stdClass();
			$geo_json_point->type 		 = 'Point';
			$geo_json_point->coordinates = [
				floatval($dato->lon),
				floatval($dato->lat)				
			];

		#$point = new stdClass();
		#	$point->latitude  = 47.59815;
		#	$point->longitude = -122.334540;

					
		$diffusion_value_socrata = $geo_json_point;// json_encode($geo_json_point, JSON_UNESCAPED_SLASHES); // json_encode($socrata_data, JSON_UNESCAPED_SLASHES);

		return $diffusion_value_socrata;
	}//end get_diffusion_value_socrata



}
?>