<?php
/*
* CLASS TOOL_IMPORT_ZOTERO
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# CONSTANTS tool_import_zotero (used by trigger)
define('TOOL_IMPORT_ZOTERO_UPLOAD_DIR'	, DEDALO_MEDIA_BASE_PATH . DEDALO_PDF_FOLDER .'/temp'.'/files/' .'user_'.$_SESSION['dedalo4']['auth']['user_id'].'/' );
define('TOOL_IMPORT_ZOTERO_UPLOAD_URL'	, DEDALO_MEDIA_BASE_URL  . DEDALO_PDF_FOLDER .'/temp'.'/files/' .'user_'.$_SESSION['dedalo4']['auth']['user_id'].'/' );




class tool_import_zotero extends tool_common {
	
	
	protected $section_obj;	# received section
	protected $button_import_propiedades;	# used to store custom options (script path, etc.)
	protected $valid_extensions;

	public static $process_script = false;

	public function __construct( $section_obj, $modo ) {

		# Verify type section object
		if ( get_class($section_obj) !== 'section' ) {
			throw new Exception("Error Processing Request. Only sections are accepted in this tool", 1);
		}
		
		# Fix current component/section
		$this->section_obj  = $section_obj;

		$this->section_tipo = $section_obj->get_tipo();

		# Fix modo
		$this->modo = $modo;
		
		# Valid extensions
		$this->valid_extensions = array('json');		
	}


	/**
	* SET_UP
	*/
	static function set_up() {

		if (isset($_REQUEST['button_tipo']) && isset($_REQUEST['t']) ) {

			$button_import_obj = new button_import($_REQUEST['button_tipo'], null, $_REQUEST['t']);
			$propiedades 	   = json_handler::decode($button_import_obj->RecordObj_dd->get_propiedades());
			if (isset($propiedades->process_script)) {
				if ( !include_once(DEDALO_LIB_BASE_PATH.$propiedades->process_script) ) {
					throw new Exception("Error Processing Request. Error in button import zotero config. Wrong process_script path", 1);
				}
				tool_import_zotero::$process_script = $propiedades->process_script;	// Fix current path
				if(SHOW_DEBUG) {
					error_log("DEBUG INFO ".__METHOD__." Loaded custom tool options: ".DEDALO_LIB_BASE_PATH.$propiedades->process_script);
				}
			}
		}

		# If not already defined in custom import script, define here
		if (!defined('ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_CODIGO')) {
			
			# BIBLIOGRAPHY DEDALO STANDAR TIPOS
			define('ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_CODIGO'								, 'rsc137');
			define('ZOTERO_SECTION_TIPO_VIRTUAL_BIBLIOGRAFIA' 								, 'rsc205');
			define('ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_FILTER'								, 'rsc148');
			define('ZOTERO_SECTION_TIPO_SERIES_COLECCIONES'	  								, 'rsc212');	# Lista de valores Series / colecciones
			define('ZOTERO_COMPONENT_TIPO_SERIES_COLECCIONES' 								, 'rsc214');	# component_input_text in Lista de valores Series / colecciones
			define('ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_DESCRIPCION_TRANSCRIPCION'			, 'rsc210');	# rsc210 Transcripción / descripción 
			define('ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_DESCRIPCION_TRANSCRIPCION_REVISION' 	, 'rsc260');	# rsc210 Transcripción / descripción 
			define('ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_DOCUMENTO'							, 'rsc209');	# Bibliografía Documento [rsc209]
			define('ZOTERO_SECTION_TIPO_LISTA_TIPOLOGIA_BIBLIOGRAFIA'						, 'dd810'); 	# dd810 Lista valores privada tipologia de bibliografía

			## DEDALO
			define('ZOTERO_COMPONENT_TIPO_TIPOLOGIA_DE_BIBLIORAFIA' 	, 'rsc138'); # Tipología bibliográfica select (Nota: Establecer correspondencias tipo 'entry-encyclopedia' => 'Libro electrónico')
			define('ZOTERO_COMPONENT_TIPO_TITULO' 						, 'rsc140'); # Título
			define('ZOTERO_COMPONENT_TIPO_SERIE_COLECCION' 				, 'rsc211'); # Series / colecciones (component_autocomplete)
			define('ZOTERO_COMPONENT_TIPO_AUTORIA_RESPONSABILIDAD' 		, 'rsc349'); # Autoría y responsabilidad
			define('ZOTERO_COMPONENT_TIPO_RESUMEN' 						, 'rsc221'); # Resumen
			define('ZOTERO_COMPONENT_TIPO_FECHA_ACTUALIZACION'			, 'rsc143'); # Fecha de actualización o revisión //accessed
			define('ZOTERO_COMPONENT_TIPO_FECHA'						, 'rsc224'); # Fecha 
			define('ZOTERO_COMPONENT_TIPO_NOTAS'						, 'rsc145'); # Notas 
			define('ZOTERO_COMPONENT_TIPO_NUMERO_NORMALIZADO'			, 'rsc147'); # Número normalizado 
			define('ZOTERO_COMPONENT_TIPO_FUENTE'						, 'rsc218'); # Fuente
			define('ZOTERO_COMPONENT_TIPO_URL'							, 'rsc217'); # URL
			define('ZOTERO_COMPONENT_TIPO_EDITOR'						, 'rsc219'); # Editor (Publisher)
			define('ZOTERO_COMPONENT_TIPO_NUMERO_PAGINAS'				, 'rsc223'); # Nº de paginas del artículo
			define('ZOTERO_COMPONENT_TIPO_NUMERO_DE_EJEMPLAR'			, 'rsc222'); # Nº de Ejemplar
			define('ZOTERO_COMPONENT_TIPO_TITULO_CORTO'					, 'rsc225'); # Titulo corto

			define('ZOTERO_LABEL_NOMBRE_FICHERO_PDF'					, 'dd176'); # Nombre del fichero pdf
		}
	}//end set_up

	


	/**
	* GET_BUTTON_IMPORT_OBJ
	* @param string $button_tipo (Request 'button_tipo')
	* @return button $button_import_obj
	* Get button tipo fron url vars and build button object and fix $this->button_import_propiedades where are custom options
	*//*
	function get_button_import_obj() {

		$vars = array('button_tipo');
			foreach($vars as $name) $$name = common::setVar($name);

		if(empty($button_tipo)) {
			throw new Exception("Error Processing Request. button_tipo not found", 1);
		}			

		$button_import_obj = new button_import($button_tipo,null);
			#dump($button_import_obj,'button_import_obj');

		$propiedades = json_handler::decode($button_import_obj->RecordObj_dd->get_propiedades());

		# Fix propiedades
		$this->button_import_propiedades = $propiedades;

		return $button_import_obj;
	}
	*/


	/**
	* ZOTERO_DATE_TO_DD_DATE
	* Convert zotero date format (object with date/time parts) to standar deddalo dd_date
	* @param object $zotero_date
	* @return object $dd_date
	* Format zotero obj example
	* stdClass Object (
    *        [date-parts] => Array (
    *                [0] => Array (
    *                        [0] => 2014
    *                        [1] => 12
    *                        [2] => 30
    *                    )
    *            )
    *        [season] => 12:57:26
    *    )
	*/
	public static function zotero_date_to_dd_date( stdClass $zotero_date) {

		$dd_date = new dd_date();

		#
		# Date 
		$branch_name = 'date-parts';
		$branch		 = $zotero_date->$branch_name;
		if ( !isset($branch[0][0]) ) {
			error_log("Wrong data from ".print_r($zotero_date,true));
			return (string)'';
		}

		if(isset($branch[0][0])) $dd_date->set_year((int)$branch[0][0]); 
		if(isset($branch[0][1])) $dd_date->set_month((int)$branch[0][1]);
		if(isset($branch[0][2])) $dd_date->set_day((int)$branch[0][2]);


		#
		# Time
		if (property_exists($zotero_date, 'season')) {
			$current_date	= $zotero_date->season;
			if ($current_date) {
				$regex   = "/^([0-9]+)?:?([0-9]+)?:?([0-9]+)?/";
				preg_match($regex, $current_date, $matches);

				if(isset($matches[1])) $dd_date->set_hour((int)$matches[1]);
				if(isset($matches[2])) $dd_date->set_minute((int)$matches[2]);
				if(isset($matches[3])) $dd_date->set_second((int)$matches[3]);
			}
		}

		if(SHOW_DEBUG) {
			
		}		

		return (object)$dd_date;
	}



	/**
	* ZOTERO_NAME_TO_NAME
	* Convert zotero name field (array with all names, names and surnames) to coma separated string of names
	* @param array $zotero_name
	* @return string $name || array $ar_name
	*/
	public static function zotero_name_to_name( array $zotero_name, $return_type='string') {		
		$ar_name=array();

		foreach ($zotero_name as $key => $obj_value) {
				
			$nombre = '';

			if (property_exists($obj_value, 'literal')) {

				$nombre .= $obj_value->literal;

				$ar_name[] = $nombre;

			}else{

				if (property_exists($obj_value, 'given')) {
					$nombre .= $obj_value->given;
				}
				
				$apellido_madre = '';
				if (property_exists($obj_value, 'family')) {
					$apellido_madre .= $obj_value->family;
				}

				$ar_name[] = $nombre.' '.$apellido_madre;
			}

						
		}
		#dump($name, ' name from '.print_r($zotero_name,true));

		switch ($return_type) {
			case 'string':
				return (string)implode(', ', $ar_name);
				break;			
			default:
				return (array)$ar_name;
				break;
		}
	}#end zotero_name_to_name



	/**
	* ZOTERO_PAGE_TO_FIRST_PAGE
	* Get first page int from page data like '27-40' to '27'
	* @param string $zotero_page
	* @return int $first_page default is 1
	*/
	public static function zotero_page_to_first_page( $zotero_page ) {

		switch (true) {
			case (empty($zotero_page)):
				$first_page = 1;
				break;

			case ( strpos($zotero_page, '-')!==false ):
				$ar_parts 	= explode('-', $zotero_page);
				$first_page = $ar_parts[0];
				break;

			default:
				$first_page = 1;
				break;
		}

		if( (int)$first_page < 1 ) $first_page = 1;

		return (int)$first_page;

	}#end zotero_page_to_first_page


	/**
	* GET_SECTION_ID_FROM_ZOTERO_ID
	* @param int $zotero_id
	* @param string $tipo component tipo . default 'ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_CODIGO' (Bibliografia->Código)
	* @param string $section_tipo  		 . default 'ZOTERO_SECTION_TIPO_VIRTUAL_BIBLIOGRAFIA' (Bibligrafía. Virtual section (real is rsc3))
	* @return int $section_id
	*//*
	public static function get_section_id_from_zotero_id( $zotero_id, $tipo=ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_CODIGO, $section_tipo=ZOTERO_SECTION_TIPO_VIRTUAL_BIBLIOGRAFIA ) {
		$section_id=0;

		#$tipo 				= 'rsc137';	# Código (component_input_text)
		#$section_tipo  	= 'rsc3'; 	# Virtual is rsc205
		$lang 				= DEDALO_DATA_NOLAN;
		$value 				= (int)$zotero_id;
		$table 				= 'matrix';#(string)common::get_matrix_table_from_tipo($section_tipo); 
		
		$sql_filter  = JSON_RecordObj_matrix::build_pg_filter('gin','datos',$tipo,$lang,$value);
		$strQuery   = "
		-- ".__METHOD__."
		SELECT section_id \n FROM \"$table\" \n
		WHERE
		section_tipo = '$section_tipo'
		AND \n $sql_filter \n
		LIMIT 1
		";
		$strQuery=sanitize_query($strQuery);
		if(SHOW_DEBUG) {
			#dump($strQuery, ' strQuery');
		}
		$result		= JSON_RecordObj_matrix::search_free($strQuery);
		while ($rows = pg_fetch_assoc($result)) {
			$section_id = $rows['section_id'];
			break;
		}

		return (int)$section_id;
	}//end get_section_id_from_zotero_id
	*/

	/**
	* GET_DATA_MAP
	* Return array map of correspondences from zotero data to dedalo bibliographic record
	* keys are Dedalo record component tipo's and values are zotero object properties
	* @return array $data_map
	*/
	public static function get_data_map() {
		return array(
			ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_CODIGO 		=> 'id',			# Código used as id (rsc137)
			ZOTERO_COMPONENT_TIPO_TIPOLOGIA_DE_BIBLIORAFIA 	=> 'type',			# Tipología bibliográfica (Nota: Establecer correspondencias tipo 'entry-encyclopedia' => 'Libro electrónico')
			ZOTERO_COMPONENT_TIPO_TITULO 					=> 'title',			# Título
			ZOTERO_COMPONENT_TIPO_SERIE_COLECCION 		  	=> 'container-title',# Colección / Series (component_autocomplete)
			ZOTERO_COMPONENT_TIPO_AUTORIA_RESPONSABILIDAD 	=> 'author',		# Autoría y responsabilidad
			ZOTERO_COMPONENT_TIPO_RESUMEN 					=> 'abstract', 		# Resumen
			ZOTERO_COMPONENT_TIPO_FECHA_ACTUALIZACION 		=> 'accessed',		# Fecha de actualización o revisión //accessed
			ZOTERO_COMPONENT_TIPO_FECHA 					=> 'issued',		# Fecha
			ZOTERO_COMPONENT_TIPO_NOTAS 					=> 'note',			# Notas
			ZOTERO_COMPONENT_TIPO_NUMERO_NORMALIZADO 		=> 'ISSN',			# Número normalizado
			ZOTERO_COMPONENT_TIPO_FUENTE 					=> 'source',		# Fuente
			ZOTERO_COMPONENT_TIPO_URL 						=> 'URL',			# URL
			ZOTERO_COMPONENT_TIPO_EDITOR 					=> 'publisher',		# Editor (Publisher)
			ZOTERO_COMPONENT_TIPO_NUMERO_PAGINAS 			=> 'page',			# Nº de paginas del artículo
			ZOTERO_COMPONENT_TIPO_NUMERO_DE_EJEMPLAR 		=> 'issue',			# Nº de Ejemplar
			ZOTERO_COMPONENT_TIPO_TITULO_CORTO 				=> 'shortTitle',	# Titulo corto
			ZOTERO_LABEL_NOMBRE_FICHERO_PDF  				=> 'call-number'	# Nombre del fichero pdf (label)
			);
	}//end get_data_map


	/**
	* GET_TIPOLOGIA_FROM_ZOTERO_TYPE
	* @param string $type Zotero exported name
	* @return int id matrix of corresponding section (private list of values 'Tipología de Bibliografía') OR null
	*/
	public static function get_tipologia_from_zotero_type($type) {
		if (defined('ZOTERO_TIPOLOGIA_FROM_ZOTERO_TYPE_MAP')) { // overwrite if you need change
			$map = unserialize(ZOTERO_TIPOLOGIA_FROM_ZOTERO_TYPE_MAP);
		}else{
			# DEFAULTS : Using section_id 
			$map = array(
				'book' 				=> 1,  # Book
				'magazine' 			=> 2,  # magazine
				'article-journal' 	=> 8,  # articluo en revista científica
				'article' 			=> 8,  # articluo en revista científica <<<<< TEMPORAL ??? (usado po mendeley. Confirmar destino)
				'article-magazine'  => 11, # Articulo en revista
				'thesis' 			=> 4,  # Tesis
				'motion_picture' 	=> 6,  # Movies
				'film' 				=> 6,  # film
				'song' 				=> 7,  # Podcast
				'conference'		=> 9,  # Articulo en conferencia
				'inproceedings'		=> 9,  # Articulo en conferencia
				'proceedings'		=> 14, # Actas
				'mastersthesis'		=> 15, # Proyecto fin de carrera
				'misc'				=> 16, # Misceláneos
				'techreport'		=> 13, # Informe técnico
				'incollection' 		=> 17, # Colección (def: A part of a book having its own title)
				'unpublished'		=> 18, # Sin publicar
				);			
		}
		
		$result = isset($map[$type]) ? $map[$type] : null;

		return $result;
	}//end get_tipologia_from_zotero_type



	/**
	* PROCESS_FILE 
	* @param array $file_data 
	* @param array $checkbox_values
	* @return array $ar_response (array of stdClass objects with tracking info about process)
	*/
	public static function process_file($file_data, $checkbox_values){
		$ar_response=array();

		$section_tipo 	= ZOTERO_SECTION_TIPO_VIRTUAL_BIBLIOGRAFIA;	# Bibliografía. Virtual section (real is rsc3)
		$data_map 		= self::get_data_map();

		#dump($checkbox_values, ' checkbox_values');die();

		foreach ( (array)$checkbox_values as $key => $checked) {
			
			if ($checked===(string)'false') continue; # Skip (note var $checked is NOT boolean, but string)

			#
			# Record
			$zotero_obj = $file_data[$key];

			#
			# Section id get from zotero data
			# Behaviour : 
			$optional_id = 'call-number';
			if (isset($zotero_obj->$optional_id)) {
				$section_id = (int)$zotero_obj->$optional_id;	// Optionally, if is defined zotero->call-number, use this as section id
			}else{
				if(is_string($zotero_obj->id)){

				}else{
					$section_id = (int)$zotero_obj->id;	// Default, get from zotero id
				}
				
			}
			#dump($section_id, ' section_id - '.$zotero_obj->id);die();
			if ($section_id<1) throw new Exception("Error Processing Request. section_id is empty", 1);

			#
			# SECTION : Force create secti0on record if not exits
			$section = section::get_instance($section_id, $section_tipo);
			$forced_create_record = $section->forced_create_record();

			if ($forced_create_record===true) {
				# Created new record
				$parent  = $section_id;
			}else{
				# Record already exists
				$parent  = $section_id;				

				# DEFAULT
				# Propiedades : if default dato is set in 'propiedades', save component here
				# Example: {"filtered_by":{"rsc235":[{"section_tipo":"rsc229","section_id":"2"}]}}
				$RecordObj_dd = new RecordObj_dd($section_tipo);
				$propiedades_current_setion = json_decode($RecordObj_dd->get_propiedades());
				if (isset($propiedades_current_setion->filtered_by)) {
					
					$component_tipo	 		= key($propiedades_current_setion->filtered_by);
						#dump($propiedades_current_setion," propiedades_current_setion - component_tipo: $component_tipo");					
					$component_dato 		= $propiedades_current_setion->filtered_by->$component_tipo;
					$component_modelo_name  = RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
					$current_component 		= component_common::get_instance($component_modelo_name, $component_tipo, $parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
					$current_component->set_dato($component_dato);
					#$current_component->Save();
						#dump($current_component,"current_component section_tipo:$section_tipo");
				}
			}

			/* OLD WORLD
			# PARENT (section id matrix)
			# Each zotero obj is stored as Dédalo row
			if ($section_id>0) {
				#$section = section::get_instance($section_id, $section_tipo);
				$parent  = $section_id;
			}else{
				$section = section::get_instance(null, $section_tipo);
				$parent  = $section->Save();

				# COMPONENT : Filtro 
				$component_tipo 		= ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_FILTER;
				$component_dato 		= array(DEDALO_DEFAULT_PROJECT=>"2");	# Id matrix del proyecto 'Catalogación' component_filter	
				$current_component 		= component_common::get_instance('component_filter', $component_tipo, $parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
				$current_component->set_dato($component_dato);
				$current_component->Save();

				# DEFAULT
				# Propiedades : if default dato is set in 'propiedades', save component here
				# Example: {"filtered_by":{"rsc235":[{"section_tipo":"rsc229","section_id":"2"}]}}
				$RecordObj_dd = new RecordObj_dd($section_tipo);
				$propiedades_current_setion = json_decode($RecordObj_dd->get_propiedades());
				if (isset($propiedades_current_setion->filtered_by)) {
					
					$component_tipo	 		= key($propiedades_current_setion->filtered_by);
						#dump($propiedades_current_setion," propiedades_current_setion - component_tipo: $component_tipo");					
					$component_dato 		= $propiedades_current_setion->filtered_by->$component_tipo;
					$component_modelo_name  = RecordObj_dd::get_modelo_name_by_tipo($component_tipo);	
					$current_component 		= component_common::get_instance($component_modelo_name, $component_tipo, $parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
					$current_component->set_dato($component_dato);
					#$current_component->Save();
						#dump($current_component,"current_component section_tipo:$section_tipo");
				}
			}
			*/
			if ($parent<1) throw new Exception("Error Processing Request. Section parent is empty", 1);

			# Response track
			$ar_response[$parent] = new stdClass();

			# Object foreach
			foreach ($zotero_obj as $name => $value) {

				$component_tipo = array_search($name, $data_map);
				if (empty($component_tipo)) {
					if(SHOW_DEBUG) {
						error_log("- Ignored $name from zotero import process");
					}
					continue; # Skip not accepted data
				}
				
				switch ($name) {
					case 'type':
						$tipologia_id = self::get_tipologia_from_zotero_type( $zotero_obj->$name ); # !! OJO !! La tipología NO se calcula. Es una tabla fija con array de section_id
						if (empty($tipologia_id)) {
							$ar_response[$parent]->$name = "<span class=\"warning\">- Ignored type $name (".to_string($value).") from zotero import process. This typology is not defined in Dedalo</span>";
							error_log("WARNING : - Ignored typology $name (".to_string($value).") from zotero import process. This typology is not defined in Dedalo");						
						}else{
							$component = component_common::get_instance(null, $component_tipo, $parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
							$tipologia_section_tipo = ZOTERO_SECTION_TIPO_LISTA_TIPOLOGIA_BIBLIOGRAFIA; # dd810 Lista valores privada tipologia de bibliografía
							$locator = new locator();
								$locator->set_section_id($tipologia_id);
								$locator->set_section_tipo($tipologia_section_tipo);

							$component->set_dato( $locator );
							$component->Save();							
							$ar_response[$parent]->$name ="+ Saved $name value $tipologia_id ($value) from zotero import process";
						}
						break;

					case 'container-title':
						$section_id_list = self::get_section_id_from_zotero_container_title( $zotero_obj->$name );
						if ($section_id_list>0) {
							# Use existing record
						}else{
							# create a new record in list
							$section_tipo_colecciones_series = ZOTERO_SECTION_TIPO_SERIES_COLECCIONES; # 'rsc212';  # Lista de valores Series / colecciones
							$section_container_list = section::get_instance(null,$section_tipo_colecciones_series); 
							$section_id_list 		= (int)$section_container_list->Save();
							$component_container_list = component_common::get_instance('component_input_text',ZOTERO_COMPONENT_TIPO_SERIES_COLECCIONES, $section_id_list, 'edit', DEDALO_DATA_LANG, $section_tipo_colecciones_series); # Colección / Serie (component_input_text)
							$component_container_list->set_dato($zotero_obj->$name);
							$component_container_list->Save();
						}
						if(SHOW_DEBUG) {
							if ($section_id_list<1) throw new Exception("Error Processing Request", 1);
						}else{
							$ar_response[$parent]->$name = "! Error Processing Request. section_id_list not found ($value)";
						}
						$component = component_common::get_instance('component_autocomplete', $component_tipo, $parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
						$locator = new locator();
							$locator->set_section_id($section_id_list);
							$locator->set_section_tipo(ZOTERO_SECTION_TIPO_SERIES_COLECCIONES);
						$component->set_dato( $locator );
						$component->Save();					
						$ar_response[$parent]->$name ="+ Saved $name value ". json_encode($locator)." from zotero import process";
						break;
					
					case 'author':
						$ar_name   = (array)self::zotero_name_to_name( $zotero_obj->$name, 'array' );
						$component = component_common::get_instance('component_input_text', $component_tipo, $parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
						$component->set_dato( $ar_name );
						$component->Save();						
						$ar_response[$parent]->$name ="+ Saved $name value ".to_string($ar_name)." (".to_string($value).") from zotero import process";
						break;

					case 'issued':
					case 'accessed':
						$date 	   = self::zotero_date_to_dd_date( $zotero_obj->$name );
						$component = component_common::get_instance('component_date', $component_tipo, $parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
						$component->set_dato( $date );
						$component->Save();
						$ar_response[$parent]->$name ="+ Saved $name value ".to_string($date)." from zotero import process";
						break;

					case 'call-number':
						if (empty($value)) {
							$ar_response[$parent]->$name ="- Ignored $name empty file from zotero import process";
							break;
						}

						$ar_response[$parent]->$name = '';

						# 
						# 1 COMPONENT_PDF (ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_DOCUMENTO rsc209)
						# Create component pdf to obtain target path of pdf file 
						$component_tipo = ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_DOCUMENTO;
						$component_pdf 	= component_common::get_instance('component_pdf', $component_tipo, $parent, 'edit', DEDALO_DATA_LANG, $section_tipo);	# Important: is translatable
						$component_pdf->Save();	# Force save to get counter
						$target_pdf_path = $component_pdf->get_pdf_path();
						$ar_response[$parent]->$name .="+ Created component_pdf path $target_pdf_path <br>";

						#
						# 2 COPY PDF FILE FROM SOURCE TO TARGET
						# Working here..
						$source_pdf_path = TOOL_IMPORT_ZOTERO_UPLOAD_DIR . trim($value).'.pdf' ;
						if (!file_exists($source_pdf_path)) {
							$ar_response[$parent]->$name .="- Error on acces to file $source_pdf_path. File not exists or is not accessible.";
							break;
						}						
						if (!rename($source_pdf_path, $target_pdf_path)) {
							if(SHOW_DEBUG) {
								error_log("source_pdf_path: $source_pdf_path");
								error_log("target_pdf_path: $target_pdf_path");
							}
							$ar_response[$parent]->$name .="- Error on move file $source_pdf_path to $target_pdf_path. File not moved.<br>";
							break;
						}
						$ar_response[$parent]->$name .="+ Moved pdf $source_pdf_path to $target_pdf_path <br>";

						#
						# 3 INDEX/TRANSCRIBE PDF FILE CONTENT TO TEXT AREA (ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_DESCRIPCION_TRANSCRIPCION rsc210)
						# $value contain page number like 20-43. Using first value like '20' to start page number counter
						$page = isset($zotero_obj->page) ? $zotero_obj->page : 1;
						$options = new stdClass();
							$options->path_pdf 	 = (string)$target_pdf_path;	# full source pdf file path
							$options->first_page = (int)self::zotero_page_to_first_page( $page );	# number of first page. default is 1
								#dump($options, ' options');
						$pdf_file_text = (object)tool_transcription::get_text_from_pdf( $options );

						$clean_pdf_file_text = trim($pdf_file_text->original);

						#dump($clean_pdf_file_text,'$clean_pdf_file_text '.strlen($clean_pdf_file_text));

						if (empty($pdf_file_text) || !isset($pdf_file_text->result) || $pdf_file_text->result=='error' || strlen($clean_pdf_file_text)<1 ) {
							$pdf_file_url = $component_pdf->get_pdf_url();
							$ar_response[$parent]->$name .= "<span class=\"error\">";
							$ar_response[$parent]->$name .= "- Error in pdf to text transcription. <br>".$pdf_file_text->msg ."<br>";
							$ar_response[$parent]->$name .= " (There are probably a permissions/security restriction problem like with the pdf file).";
							$ar_response[$parent]->$name .= " Please review Document Security Content Copying options in file: <a href=\"$pdf_file_url\" target=\"_blank\" >".pathinfo($source_pdf_path)['basename']."</a>";
							$ar_response[$parent]->$name .= "</span><br>";

							$component_tipo = ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_DESCRIPCION_TRANSCRIPCION_REVISION;
							$component 		= component_common::get_instance('component_radio_button', $component_tipo, $parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
							$locator = new locator();
								$locator->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
								$locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);

							$component->set_dato( $locator );
							$component->Save();
							$ar_response[$parent]->$name .="- Saved transcription for revision: yes.<br>";

							#dump($component,'$component');
						
						}else{						
						
							$component_tipo = ZOTERO_COMPONENT_TIPO_BIBLIOGRAFIA_DESCRIPCION_TRANSCRIPCION;
							$component 		= component_common::get_instance('component_text_area', $component_tipo, $parent, 'edit', DEDALO_DATA_LANG, $section_tipo);
							$component->set_dato( $pdf_file_text->result );
							$component->Save();
							$ar_response[$parent]->$name .="+ Saved pdf text ".substr($pdf_file_text->result,0,160).".. as pdf transcription.<br>";
						}
						break;

					default:
						$component = component_common::get_instance(null, $component_tipo, $parent, 'edit', DEDALO_DATA_LANG, $section_tipo);
						$component->set_dato( $zotero_obj->$name );
						$component->Save();
						$ar_response[$parent]->$name ="+ Saved $name value ".to_string($value)." from zotero import process";

						if ($name=='title') {
							$ar_response[$parent]->titulo = $zotero_obj->$name;
						}
						break;
				}#end switch


			}#end foreach ($zotero_obj as $name => $value)


		}#end foreach ( (array)$checkbox_values as $key => $checked)
		#dump($ar_response, ' ar_response');

		return (array)$ar_response;
	}//end process_file



	/**
	* GET_SECTION_ID_FROM_ZOTERO_CONTAINER_TITLE
	* Busca en la lista de valores pública 'Colecciones / Series' el nombre dado y devuelve el section_id del registro encontrado si lo hay
	* @param string $zotero_container_title
	* @return int $section_id
	*/
	public static function get_section_id_from_zotero_container_title( $zotero_container_title ) {
		$section_id=0;

		$tipo 			= ZOTERO_COMPONENT_TIPO_SERIES_COLECCIONES;		# Colección / Serie (component_input_text)
		$section_tipo   = ZOTERO_SECTION_TIPO_SERIES_COLECCIONES;		# 'rsc212'; 	# Lista de valores Colecciones / Series 
		$lang 			= DEDALO_DATA_LANG;
		$value 			= $zotero_container_title;
		$table 			= (string)common::get_matrix_table_from_tipo($section_tipo); 
		
		$sql_filter  = JSON_RecordObj_matrix::build_pg_filter('gin','datos',$tipo,$lang,$value);
		$strQuery   = "-- ".__METHOD__."
		SELECT section_id
		FROM \"$table\"
		WHERE
		section_tipo = '$section_tipo'
		AND \n $sql_filter
		LIMIT 1
		";
		$strQuery=sanitize_query($strQuery);
		if(SHOW_DEBUG) {
			#dump($strQuery, ' strQuery');
		}
		$result		= JSON_RecordObj_matrix::search_free($strQuery);
		while ($rows = pg_fetch_assoc($result)) {
			$section_id = $rows['section_id'];
			break;
		}
		#dump($section_id, ' section_id '.utf8_decode($strQuery));

		return (int)$section_id;
	}//end get_section_id_from_zotero_container_title


	
}#end class



# SET TOOL CONTANTS
tool_import_zotero::set_up();


?>