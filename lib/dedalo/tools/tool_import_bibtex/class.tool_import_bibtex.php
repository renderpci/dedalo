<?php
/*
* CLASS TOOL_IMPORT_BIBTEX

	Field types[edit]
	A BibTeX entry can contain various types of fields. The following types are recognized by the default bibliography styles; some third-party styles may accept additional ones:

	address
		Publisher's address (usually just the city, but can be the full address for lesser-known publishers)
	annote
		An annotation for annotated bibliography styles (not typical)
	author
		The name(s) of the author(s) (in the case of more than one author, separated by and
	booktitle
		The title of the book, if only part of it is being cited
	chapter
		The chapter number
	crossref
		The key of the cross-referenced entry
	edition
		The edition of a book, long form (such as "First" or "Second")
	editor
		The name(s) of the editor(s)
	howpublished
		How it was published, if the publishing method is nonstandard
	institution
		The institution that was involved in the publishing, but not necessarily the publisher
	journal
		The journal or magazine the work was published in
	key
		A hidden field used for specifying or overriding the alphabetical order of entries (when the "author" and "editor" fields are missing). Note that this is very different from the key (mentioned just after this list) that is used to cite or cross-reference the entry.
	month
		The month of publication (or, if unpublished, the month of creation)
	note
		Miscellaneous extra information
	number
		The "(issue) number" of a journal, magazine, or tech-report, if applicable. (Most publications have a "volume", but no "number" field.)
	organization
		The conference sponsor
	pages
		Page numbers, separated either by commas or double-hyphens.
	publisher
		The publisher's name
	school
		The school where the thesis was written
	series
		The series of books the book was published in (e.g. "The Hardy Boys" or "Lecture Notes in Computer Science")
	title
		The title of the work
	type
		The field overriding the default type of publication (e.g. "Research Note" for techreport, "{PhD} dissertation" for phdthesis, "Section" for inbook/incollection)
	volume
		The volume of a journal or multi-volume book
	year
		The year of publication (or, if unpublished, the year of creation)

	In addition, each entry contains a key (Bibtexkey) that is used to cite or cross-reference the entry. This key is the first item in a BibTeX entry, and is not part of any field.


	# E.G.
	@book{SerraiGuell1991,
		address = {Barcelona},
		annote = {Cat�leg exposici�},
		author = {{Serra i G{\"{u}}ell}, Eudald and Huera, Carmen and {Soriano Marin}, Mar{\'{\i}}a Dolores},
		isbn = {8476094760},
		keywords = {Escultura antropol{\`{o}}gica - Exposicions,Eudald - Exposicions,MEB,Museu Etnol{\`{o}}gic - Barcelona - Exposicions,Serra},
		mendeley-tags = {MEB},
		publisher = {Ajuntament de Barcelona; Fundaci� Folch},
		title = {{Escultures antropol{\`{o}}giques d' Eudald Serra i G{\"{u}}ell: Museu Etnol{\`{o}}gic octubre 1991 - gener 1992}},
		year = {1991}
	}
	@article{FortiFornas1995,
		author = {{Fort i Fornas}, Agustina},
		file = {:/nas01/USR1/3/USR/AM36453/Mendeley Desktop/Fort i Fornas - 1995 - La revista 'cuadernos de arqueolog{\'{\i}}a e historia de la ciudad 1 , 1960-1980.pdf:pdf},
		journal = {Barcelona quaderns d'hist{\`{o}}ria},
		keywords = {MHCB,MUHBA,SAB,fonts orals},
		mendeley-tags = {MHCB,MUHBA,SAB,fonts orals},
		number = {1},
		pages = {33--46},
		title = {{La revista 'cuadernos de arqueolog{\'{\i}}a e historia de la ciudad 1 , 1960-1980*}},
		url = {http://www.raco.cat/index.php/BCNQuadernsHistoria/article/view/105165},
		year = {1995}
	}


*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

#if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# CONSTANTS tool_import_bibtex (used by trigger)
define('TOOL_IMPORT_BIBTEX_UPLOAD_DIR'	, DEDALO_MEDIA_BASE_PATH . DEDALO_PDF_FOLDER .'/temp'.'/bibtex_files/' .'user_'.$_SESSION['dedalo4']['auth']['user_id'].'/' );
define('TOOL_IMPORT_BIBTEX_UPLOAD_URL'	, DEDALO_MEDIA_BASE_URL  . DEDALO_PDF_FOLDER .'/temp'.'/bibtex_files/' .'user_'.$_SESSION['dedalo4']['auth']['user_id'].'/' );




class tool_import_bibtex extends tool_common {
	
	
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
		$this->section_obj = $section_obj;

		$this->section_tipo = $section_obj->get_tipo();

		# Fix modo
		$this->modo = $modo;
		
		# Valid extensions
		$this->valid_extensions = array('bib','pdf');		
	}


	/**
	* SET_UP
	*/
	public static function set_up() {

		$var_requested 		= common::get_request_var('button_tipo');
		$var_requested_t	= common::get_request_var('t');
		#if (isset($_REQUEST['button_tipo']) && isset($_REQUEST['t']) ) {
		if (!empty($var_requested) && !empty($var_requested_t) ) {

			#$button_import_obj = new button_import($_REQUEST['button_tipo'], null, $_REQUEST['t']);
			$button_import_obj = new button_import($var_requested, null, $var_requested_t);
			$propiedades 	   = json_handler::decode($button_import_obj->RecordObj_dd->get_propiedades());
			if (isset($propiedades->process_script)) {
				if ( !include_once(DEDALO_LIB_BASE_PATH.$propiedades->process_script) ) {
					throw new Exception("Error Processing Request. Error in button import bibtex config. Wrong process_script path", 1);
				}
				tool_import_bibtex::$process_script = $propiedades->process_script;	// Fix current path
				if(SHOW_DEBUG) {
					error_log("DEBUG INFO ".__METHOD__." Loaded custom tool options: ".DEDALO_LIB_BASE_PATH.$propiedades->process_script);
				}
			}
		}

		# If not already defined in custom import script, define here
		if (!defined('BIBLIO_SECTION_TIPO_VIRTUAL_BIBLIOGRAFIA')) {
			
			# BIBLIOGRAPHY DEDALO STANDAR TIPOS
			define('BIBLIO_SECTION_TIPO_VIRTUAL_BIBLIOGRAFIA' 					, 'rsc205');
			define('BIBLIO_COMPONENT_TIPO_BIBLIOGRAFIA_CODIGO'					, 'rsc137');			
			define('BIBLIO_COMPONENT_TIPO_BIBLIOGRAFIA_FILTER'					, 'rsc148');
			define('BIBLIO_SECTION_TIPO_SERIES_COLECCIONES'	  					, 'rsc212');	# Lista de valores Series / colecciones
			define('BIBLIO_COMPONENT_TIPO_SERIES_COLECCIONES' 					, 'rsc214');	# component_input_text in Lista de valores Series / colecciones			
			define('BIBLIO_COMPONENT_TIPO_BIBLIOGRAFIA_DESCRIPCION_TRANSCRIPCION', 'rsc210');	# rsc210 Transcripción / descripción 
			define('BIBLIO_COMPONENT_TIPO_BIBLIOGRAFIA_DESCRIPCION_TRANSCRIPCION_REVISION', 'rsc260');	# rsc210 Transcripción / descripción 
			define('BIBLIO_COMPONENT_TIPO_BIBLIOGRAFIA_DOCUMENTO'				, 'rsc209');	# Bibliografía Documento [rsc209]
			define('BIBLIO_SECTION_TIPO_LISTA_TIPOLOGIA_BIBLIOGRAFIA'			, 'dd810'); 	# dd810 Lista valores privada tipologia de bibliografía
			define('BIBLIO_COMPONENT_TIPO_DATOS_DE_PUBLICACION'					, 'rsc142');	# Toponimia. Lugar de publicación


			# PERSONS (AUTHOR, ETC.)
			define('BIBLIO_SECTION_TIPO_VIRTUAL_PERSONS' 						, 'rsc194');
			define('BIBLIO_PERSONS_COMPONENT_TIPO_NAME' 						, 'rsc85');
			define('BIBLIO_PERSONS_COMPONENT_TIPO_SURNAME' 						, 'rsc86');
			define('BIBLIO_PERSONS_COMPONENT_TIPO_TYPOLOGY'						, 'rsc90');
			
			## DEDALO
			define('BIBLIO_COMPONENT_TIPO_TIPOLOGIA_DE_BIBLIORAFIA' 			, 'rsc138'); # Tipología bibliográfica select (Nota: Establecer correspondencias tipo 'entry-encyclopedia' => 'Libro electrónico')
			define('BIBLIO_COMPONENT_TIPO_TITULO' 								, 'rsc140'); # Título
			define('BIBLIO_COMPONENT_TIPO_SERIE_COLECCION' 						, 'rsc211'); # Series / colecciones (component_autocomplete)
			define('BIBLIO_COMPONENT_TIPO_AUTORIA_RESPONSABILIDAD' 				, 'rsc139'); # Autoría y responsabilidad
			define('BIBLIO_COMPONENT_TIPO_RESUMEN' 								, 'rsc221'); # Resumen
			define('BIBLIO_COMPONENT_TIPO_EDITION'								, 'rsc141');# Edition
			define('BIBLIO_COMPONENT_TIPO_FECHA_ACTUALIZACION'					, 'rsc143'); # Fecha de actualización o revisión //accessed
			define('BIBLIO_COMPONENT_TIPO_FECHA'								, 'rsc224'); # Fecha 
			define('BIBLIO_COMPONENT_TIPO_NOTAS'								, 'rsc145'); # Notas 
			define('BIBLIO_COMPONENT_TIPO_NUMERO_NORMALIZADO'					, 'rsc147'); # Número normalizado
			
			define('BIBLIO_COMPONENT_TIPO_TYPE_OF_NUMERO_NORMALIZADO'			, 'rsc249'); # Tipo del Número normalizado, como 'issn', 'isbn', 'doi' ..
			define('BIBLIO_COMPONENT_TIPO_DEPOSITO_LEGAL'						, 'rsc250'); # Depósito legal

			define('BIBLIO_COMPONENT_TIPO_FUENTE'								, 'rsc218'); # Fuente
			define('BIBLIO_COMPONENT_TIPO_URL'									, 'rsc217'); # URL
			define('BIBLIO_COMPONENT_TIPO_EDITOR'								, 'rsc219'); # Editor (Publisher)
			define('BIBLIO_COMPONENT_TIPO_NUMERO_PAGINAS'						, 'rsc223'); # Nº de paginas del artículo
			define('BIBLIO_COMPONENT_TIPO_NUMERO_DE_EJEMPLAR'					, 'rsc222'); # Nº de Ejemplar
			define('BIBLIO_COMPONENT_TIPO_TITULO_CORTO'							, 'rsc225'); # Titulo corto

			define('BIBLIO_LABEL_NOMBRE_FICHERO_PDF'							, 'dd176'); # Nombre del fichero pdf

			# TYPE OF NORMALIZED NUMBER
			define('BIBLIO_SECTION_TYPE_OF_NORMALIZED_NUMBER' 					, 'dd292');
			define('BIBLIO_COMPONENT_TIPO_TYPE_OF_NORMALIZED_NUMBER' 			, 'dd296');
			define('BIBLIO_TYPE_OF_NORMALIZED_NUMBER_ISBN_SECTION_ID' 			, 1);
			define('BIBLIO_TYPE_OF_NORMALIZED_NUMBER_ISSN_SECTION_ID' 			, 2);
		}
	}//end set_up



	/**
	* PARSE_BIBEX
	* Parses bibex file or strig with a proper lubrary and result array with all elements
	* @return array | null $result
	*/
	public static function parse_bibex($file=null, $string=null) {		
		
		# parser lib
		require(DEDALO_LIB_BASE_PATH.'/tools/tool_import_bibtex/lib/BibtexParser/BibtexParser.php');

		# If input is file, get text content
		if ($file) {
			$string = file_get_contents($file);
		}

		# parser lib
		require(DEDALO_LIB_BASE_PATH.'/tools/tool_import_bibtex/lib/class.latex.php');

		# Decode latex chars to utf8 BEFORE send to parser lib
		$string = latex::latex_decode( $string );
		
		# Parse as array
        $result = \AudioLabs\BibtexParser\BibtexParser::parse_string($string);
		
		return $result;
		
	}#end parse_bibex




	/**
	* RESOLVE_FILENAME
	* Resolve filename from bibtex data filename path
	* @return string $filenam
	*/
	public static function resolve_filename( $file_name_raw ) {
		
		$filename = null;

		$path_parts = pathinfo($file_name_raw);
			#dump($path_parts, ' path_parts ++ '.to_string($file_name_raw));
		if (!isset($path_parts['basename']) || !isset($path_parts['extension']) || $path_parts['extension']!='pdf:pdf') {
			trigger_error("Error on read/validate filename form file_name_raw: ".$file_name_raw);
			return null;
		}

		switch ($path_parts['extension']) {
			case 'pdf:pdf':
				$filename = $path_parts['filename'] .'.pdf';
				break;
			
			default:
				$filename = $path_parts['basename'];
				break;
		}

		#$filename = rawurlencode($filename);
		#dump($filename, ' filename ++ '.to_string($file_name_raw));

		return $filename;

	}#end resolve_filename

	

	/**
	* BIBEX_DATE_TO_DD_DATE
	* Convert bibex date format (object with date/time parts) to standar deddalo dd_date
	* @param object $bibex_date
	* @return object $dd_date
	* Format bibex obj example
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
	public static function bibex_date_to_dd_date( stdClass $bibex_date) {

		$dd_date = new dd_date();

		#
		# Date 
		$branch_name = 'date-parts';
		$branch		 = $bibex_date->$branch_name;
		if ( !isset($branch[0][0]) ) {
			error_log("Wrong data from ".print_r($bibex_date,true));
			return (string)'';
		}

		if(isset($branch[0][0])) $dd_date->set_year((int)$branch[0][0]); 
		if(isset($branch[0][1])) $dd_date->set_month((int)$branch[0][1]);
		if(isset($branch[0][2])) $dd_date->set_day((int)$branch[0][2]);


		#
		# Time
		if (property_exists($bibex_date, 'season')) {
			$current_date	= $bibex_date->season;
			if ($current_date) {
				$regex   = "/^([0-9]+)?:?([0-9]+)?:?([0-9]+)?/";
				preg_match($regex, $current_date, $matches);

				if(isset($matches[1])) $dd_date->set_hour((int)$matches[1]);
				if(isset($matches[2])) $dd_date->set_minute((int)$matches[2]);
				if(isset($matches[3])) $dd_date->set_second((int)$matches[3]);
			}
		}

		return (object)$dd_date;
	}



	/**
	* BIBLIO_NAME_TO_NAME_OBJ
	* Convert bibtex name field to object
	* @param string $biblio_name Like Martinez Díaz, Jose Pablo
	* @return object $name_obj
	*/
	public static function biblio_name_to_name_obj( string $biblio_name ) {
		
		$name_obj = new stdClass();
			$name_obj->name 	= null;
			$name_obj->surname 	= null;

		$ar_parts = explode(',', $biblio_name);
		switch (true) {
			case isset($ar_parts[0]) && isset($ar_parts[1]):
				$name_obj->name 	= addslashes(trim($ar_parts[1]));
				$name_obj->surname 	= addslashes(trim($ar_parts[0]));
				break;
			case isset($ar_parts[0]):
				$name_obj->surname 	= addslashes(trim($ar_parts[0]));
			default:
				$name_obj->surname 	= addslashes(trim($biblio_name));
				break;
		}
		
		return $name_obj;

	}#end biblio_name_to_name_obj



	
	

	/**
	* GET_DATA_MAP
	* Return array map of correspondences from biblio data to dedalo bibliographic record
	* keys are Dedalo record component tipo's and values are biblio object properties
	* @return array $data_map
	*/
	public static function get_data_map() {
		return array(
			'reference'		=> BIBLIO_COMPONENT_TIPO_BIBLIOGRAFIA_CODIGO,		# Código used as id (rsc137)
			'type'			=> BIBLIO_COMPONENT_TIPO_TIPOLOGIA_DE_BIBLIORAFIA,	# Tipología bibliográfica (Nota: Establecer correspondencias tipo 'entry-encyclopedia' => 'Libro electrónico')
			'title' 		=> BIBLIO_COMPONENT_TIPO_TITULO,					# Título
			'booktitle'		=> BIBLIO_COMPONENT_TIPO_TITULO,
			'series' 		=> BIBLIO_COMPONENT_TIPO_SERIE_COLECCION,			# Colección / Series (component_autocomplete)
			'author'		=> BIBLIO_COMPONENT_TIPO_AUTORIA_RESPONSABILIDAD, 	# Autoría y responsabilidad
			'abstract' 		=> BIBLIO_COMPONENT_TIPO_RESUMEN,					# Resumen
			'year'			=> BIBLIO_COMPONENT_TIPO_FECHA,						# Fecha
			'annote'		=> BIBLIO_COMPONENT_TIPO_NOTAS,						# Notas
			'isbn'			=> BIBLIO_COMPONENT_TIPO_NUMERO_NORMALIZADO, 		# Número normalizado. (NOTA: 'isbn' no es estándar, pero lo aceptaremos...) |number
			'issn' 			=> BIBLIO_COMPONENT_TIPO_NUMERO_NORMALIZADO,		# Número normalizado			
			'journal'		=> BIBLIO_COMPONENT_TIPO_FUENTE,					# Fuente
			'url'			=> BIBLIO_COMPONENT_TIPO_URL,						# URL
			'publisher'		=> BIBLIO_COMPONENT_TIPO_EDITOR,					# Editor (Publisher)
			'institution'	=> BIBLIO_COMPONENT_TIPO_EDITOR,
			'pages'			=> BIBLIO_COMPONENT_TIPO_NUMERO_PAGINAS, 			# Nº de paginas del artículo
			'number'		=> BIBLIO_COMPONENT_TIPO_NUMERO_DE_EJEMPLAR,		# Nº de Ejemplar
			'file'			=> BIBLIO_LABEL_NOMBRE_FICHERO_PDF,					# Nombre del fichero pdf (label)
			'edition'		=> BIBLIO_COMPONENT_TIPO_EDITION,					# Nombre de la edición
			'address'		=> BIBLIO_COMPONENT_TIPO_DATOS_DE_PUBLICACION,		# Toponimia tipo 'Girona'
			);
		/* OLD WORLD
		return array(
			BIBLIO_COMPONENT_TIPO_BIBLIOGRAFIA_CODIGO 		=> 'reference',		# Código used as id (rsc137)
			BIBLIO_COMPONENT_TIPO_TIPOLOGIA_DE_BIBLIORAFIA 	=> 'type',			# Tipología bibliográfica (Nota: Establecer correspondencias tipo 'entry-encyclopedia' => 'Libro electrónico')
			BIBLIO_COMPONENT_TIPO_TITULO 					=> 'title',			# Título
			BIBLIO_COMPONENT_TIPO_SERIE_COLECCION 		  	=> 'series',		# Colección / Series (component_autocomplete)
			BIBLIO_COMPONENT_TIPO_AUTORIA_RESPONSABILIDAD 	=> 'author',		# Autoría y responsabilidad
			BIBLIO_COMPONENT_TIPO_RESUMEN 					=> 'abstract', 		# Resumen
			#BIBLIO_COMPONENT_TIPO_FECHA_ACTUALIZACION 		=> 'accessed',		# Fecha de actualización o revisión //accessed
			BIBLIO_COMPONENT_TIPO_FECHA 					=> 'year',			# Fecha
			BIBLIO_COMPONENT_TIPO_NOTAS 					=> 'annote',		# Notas
			
			BIBLIO_COMPONENT_TIPO_NUMERO_NORMALIZADO 		=> 'isbn',			# Número normalizado. (NOTA: 'isbn' no es estándar, pero lo aceptaremos...) |number
			BIBLIO_COMPONENT_TIPO_NUMERO_NORMALIZADO 		=> 'issn',			

			BIBLIO_COMPONENT_TIPO_FUENTE 					=> 'journal',		# Fuente
			BIBLIO_COMPONENT_TIPO_URL 						=> 'url',			# URL
			BIBLIO_COMPONENT_TIPO_EDITOR 					=> 'publisher',		# Editor (Publisher)
			BIBLIO_COMPONENT_TIPO_NUMERO_PAGINAS 			=> 'pages',			# Nº de paginas del artículo
			BIBLIO_COMPONENT_TIPO_NUMERO_DE_EJEMPLAR 		=> 'number',		# Nº de Ejemplar
			#BIBLIO_COMPONENT_TIPO_TITULO_CORTO 			=> 'shortTitle',	# Titulo corto
			BIBLIO_LABEL_NOMBRE_FICHERO_PDF  				=> 'file',			# Nombre del fichero pdf (label)	
			BIBLIO_COMPONENT_TIPO_EDITION 					=> 'edition',		# Nombre de la edición			
			);
			*/
	}//end get_data_map



	/**
	* GET_TIPOLOGIA_FROM_biblio_TYPE
	* @param string $type biblio exported name
	* @return int id matrix of corresponding section (private list of values 'Tipología de Bibliografía') OR null
	*/
	public static function get_tipologia_from_biblio_type($type) {
		if (defined('BIBLIO_TIPOLOGIA_FROM_BIBLIO_TYPE_MAP')) { // overwrite if you need change
			$map = unserialize(BIBLIO_TIPOLOGIA_FROM_BIBLIO_TYPE_MAP);
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
	}//end get_tipologia_from_biblio_type



	/**
	* PROCESS_FILE 
	* @param array $file_data 
	* @param array $checkbox_values
	* @return array $ar_response (array of stdClass objects with tracking info about process)
	*/
	public static function process_file($file_data, $checkbox_values){
		$ar_response=array();

		$section_tipo 	= BIBLIO_SECTION_TIPO_VIRTUAL_BIBLIOGRAFIA;	# Bibliografía. Virtual section (real is rsc3)
		$data_map 		= self::get_data_map();

		#dump($checkbox_values, ' checkbox_values');die();
		$ar_excluded_proccess = array("raw","lines");

		foreach ( (array)$checkbox_values as $key => $checked) {
			
			if ($checked===(string)'false') continue; # Skip (note var $checked is NOT boolean, but string)

			#
			# Record
			$current_obj = (object)$file_data[$key];
				#dump($current_obj, ' current_obj ++ '.to_string()); continue;

			#
			# Section id get from biblio data
			# Behaviour : 
			if (!property_exists($current_obj, 'reference')) {
				trigger_error("Error Processing Request. reference is manadory. Ignored element $key");
				continue;
			}
			$section_id = tool_import_bibtex::get_section_id_from_bibtex_reference($current_obj->reference);		

			#
			# SECTION : Force create sectión record if not exits
			if ((int)$section_id>0) {
				$section = section::get_instance($section_id, $section_tipo);
				$parent  = $section->get_section_id();				
			}else{
				$section = section::get_instance(null, $section_tipo);
				$section->Save();
				$parent  = $section->get_section_id();

				# DEFAULT
				# Propiedades : if default dato is set in 'propiedades', save component here
				# Example: {"filtered_by":{"rsc235":[{"section_tipo":"rsc229","section_id":"2"}]}}
				$RecordObj_dd = new RecordObj_dd($section_tipo);
				$propiedades_current_setion = json_decode($RecordObj_dd->get_propiedades());
				if (isset($propiedades_current_setion->filtered_by)) {
					
					$component_tipo	 		= key($propiedades_current_setion->filtered_by);
						#dump($propiedades_current_setion," propiedades_current_setion - component_tipo: $component_tipo");					
					$component_dato 		= $propiedades_current_setion->filtered_by->$component_tipo;
					$component_modelo_name  = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$current_component 		= component_common::get_instance($component_modelo_name, $component_tipo, $parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
					$current_component->set_dato($component_dato);
					#$current_component->Save();
						#dump($current_component,"current_component section_tipo:$section_tipo");
				}
			}//end if ((int)$section_id>0) {
			if ($parent<1) throw new Exception("Error Processing Request. Section parent is empty", 1);

			# Response track
			$ar_response[$parent] = new stdClass();

			# Object foreach
			foreach ($current_obj as $name => $value) {
				
				#$component_tipo = array_search($name, $data_map);
				$component_tipo = isset($data_map[$name]) ? $data_map[$name] : null;
				/*
				if (empty($component_tipo)) {
					if(SHOW_DEBUG) {
						error_log("- Ignored $name from biblio import process");
					}
					continue; # Skip not accepted data
				}
				*/
				
				if ( array_search($name, $ar_excluded_proccess) ) {
					if(SHOW_DEBUG) {
						error_log("- Ignored $name from biblio import process (ar_excluded_proccess)");
					}
					continue; # Skip not accepted data
				}
				
				switch ($name) {

					// Reference correspond to field CODE and is used to test if record already exists. Must be unic
					case 'reference':
						$tipo 			 = BIBLIO_COMPONENT_TIPO_BIBLIOGRAFIA_CODIGO;
						$modelo_name 	 = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
						$component 		 = component_common::get_instance($modelo_name,
																		  $tipo,
																		  $parent,
																		  'edit',
																		  DEDALO_DATA_NOLAN,
																		  $section_tipo);
						$component->set_dato($value);
						$component->Save();
						$ar_response[$parent]->$name ="+ Saved $name value ($value) from bibtex import process";
						break;

					// Type correspond to component_select Bibliograph typlology and is fixed predefined list of values
					case 'type':

						$tipologia_id = self::get_tipologia_from_biblio_type( $current_obj->$name ); # !! OJO !! La tipología NO se calcula. Es una tabla fija con array de section_id
						if (empty($tipologia_id)) {
							$ar_response[$parent]->$name = "<span class=\"warning\">- Ignored type $name (".to_string($value).") from bibtex import process. This typology is not defined in Dedalo</span>";
							error_log("WARNING : - Ignored typology $name (".to_string($value).") from bibtex import process. This typology is not defined in Dedalo");						
						}else{
							$component = component_common::get_instance(null,
																		$component_tipo,
																		$parent,
																		'edit',
																		DEDALO_DATA_NOLAN,
																		$section_tipo);
							$tipologia_section_tipo = BIBLIO_SECTION_TIPO_LISTA_TIPOLOGIA_BIBLIOGRAFIA; # dd810 Lista valores privada tipologia de bibliografía
							$locator = new locator();
								$locator->set_section_id($tipologia_id);
								$locator->set_section_tipo($tipologia_section_tipo);

							$component->set_dato( $locator );
							$component->Save();							
							$ar_response[$parent]->$name ="+ Saved $name value $tipologia_id ($value) from bibtex import process";
						}
						break;

					// Author is a component_autocomplete with values from persons list. If current author is mathed in this list, this person is ussed. If not,
					// new person record is created in list and added the locator to current field.
					case 'author':
						$ar_response[$parent]->$name='';
						foreach ((array)$value as $current_author) {
							$name_obj 		= self::biblio_name_to_name_obj( $current_author );
							$author_name 	= isset($name_obj->name) ? $name_obj->name : null;
							$author_surname = isset($name_obj->surname) ? $name_obj->surname : null;		#dump($name_obj, "author_name:$author_name, author_surname:$author_surname ".to_string());
							$ar_person 		= (array)self::search_person( $author_name, $author_surname );	#dump($ar_person, ' $ar_person ++ '.to_string());
							if (empty($ar_person)) {
								// Author NOT exists
								# Create new person record and link with current component (autocomplete)
								self::add_person( $name_obj, $typology='author', $parent );
								$ar_response[$parent]->$name .="+ Added person $author_name $author_surname from bibtex import process";
							}else{
								// Author exits
								$tipo 		 		= BIBLIO_COMPONENT_TIPO_AUTORIA_RESPONSABILIDAD;
								$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
								$author_section_id  = reset($ar_person);
								$component 	 		= component_common::get_instance($modelo_name,
																					 $tipo,
																					 $parent,
																					 'edit',
																					 DEDALO_DATA_NOLAN,
																					 $section_tipo);
								$locator = new locator();
									$locator->set_section_tipo(BIBLIO_SECTION_TIPO_VIRTUAL_PERSONS);
									$locator->set_section_id($author_section_id);
								
								$dato 	= $component->get_dato();
								$dato[] = $locator;
								$component->set_dato( $dato );
								$component->Save();
								$ar_response[$parent]->$name .="+ Link existing author $author_name $author_surname from bibtex import process";
							}
						}				
						#$ar_response[$parent]->$name ="+ Saved $name value ".to_string($value)." (".to_string($value).") from bibtex import process";
						break;

					// Series is a component_autocomplete like authors. Get values from list 'Series'. If not is mathed current serie name, new record is created in
					// the list and added the locator to current field data
					case 'series':
						$section_id_list = self::search_serie($value);
						if ($section_id_list>0) {
							# Use existing record
						}else{
							# create a new record in list
							$section_tipo_colecciones_series = BIBLIO_SECTION_TIPO_SERIES_COLECCIONES; # 'rsc212';  # Lista de valores Series / colecciones
							$section_container_list   = section::get_instance(null,$section_tipo_colecciones_series); 
							$section_id_list 		  = (int)$section_container_list->Save();
							$component_container_list = component_common::get_instance('component_input_text',
																						BIBLIO_COMPONENT_TIPO_SERIES_COLECCIONES,
																						$section_id_list,
																						'edit',
																						DEDALO_DATA_LANG,
																						$section_tipo_colecciones_series); # Colección / Serie (component_input_text)
							$component_container_list->set_dato($value);
							$component_container_list->Save();
						}						
						if ($section_id_list<1){
							$ar_response[$parent]->$name = "! Error Processing Request. section_id_list not found ($value)";
							if(SHOW_DEBUG) throw new Exception("Error Processing Request", 1);
						}
						
						$component  = component_common::get_instance('component_autocomplete',
																	 $component_tipo,
																	 $parent,
																	 'edit',
																	 DEDALO_DATA_NOLAN,
																	 $section_tipo);
						$locator = new locator();
							$locator->set_section_id($section_id_list);
							$locator->set_section_tipo(BIBLIO_SECTION_TIPO_SERIES_COLECCIONES);
						$component->set_dato( $locator );
						$component->Save();					
						$ar_response[$parent]->$name ="+ Saved $name value ". json_encode($locator)." from biblio import process";
						break;					

					// Pages
					case 'pages':
						$page_value  = (string)self::format_pages($value);
						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
						$component 	 = component_common::get_instance($modelo_name,
																	  $component_tipo,
																	  $parent,
																	  'edit',
																	  DEDALO_DATA_NOLAN,
																	  $section_tipo);
						$component->set_dato( $page_value );
						$component->Save();
						$ar_response[$parent]->$name ="+ Saved $name value ".to_string($page_value)." from biblio import process";
						break;

					// Notes and other special info. All this fields are stored in 'Notes' component_text_area component togheter, separated by ,\n
					case 'annote':
					case 'mendeley-tags':
					case 'keywords':
					case 'address':
					case 'chapter':
					case 'language':
					case 'language':
					case 'urldate':	
					case 'file':

						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo(BIBLIO_COMPONENT_TIPO_NOTAS,true);
						$component 	 = component_common::get_instance($modelo_name,
																	  BIBLIO_COMPONENT_TIPO_NOTAS,
																	  $parent,
																	  'edit',
																	  DEDALO_DATA_LANG,
																	  $section_tipo);
						$dato  = $component->get_dato();
						if (!empty($dato)) {
							$dato .= "<br>";
						}
						$dato .= "<strong>$name</strong>: ".to_string($value);
						$component->set_dato( $dato );
						$component->Save();

						// ADDRESS CASE : Besides save address in notes, we try to resolve the toponym (sometimes is possible, sometimes not)
						if ($name=='address') {
							$topo_locator = self::get_toponym_from_address( $current_obj->$name );
							if (empty($topo_locator)) {
								$ar_response[$parent]->$name = "<span class=\"warning\">- Ignored type $name (".to_string($value).") from bibtex import process. This address is not defined in Dedalo toponyms</span>";
								error_log("WARNING : - Ignored typology $name (".to_string($value).") from bibtex import process. This address is not defined in Dedalo toponyms");			
							}else{
								$modelo_name = RecordObj_dd::get_modelo_name_by_tipo(BIBLIO_COMPONENT_TIPO_DATOS_DE_PUBLICACION,true);
								$component 	 = component_common::get_instance($modelo_name,
																			  BIBLIO_COMPONENT_TIPO_DATOS_DE_PUBLICACION,
																			  $parent,
																			  'edit',
																			  DEDALO_DATA_NOLAN,
																			  $section_tipo);
								$component->set_dato( $topo_locator );
								$component->Save();
								$locator_string=json_encode($topo_locator);
								if(SHOW_DEBUG) {
									#$locator_string = to_string($topo_locator);
								}
								$ar_response[$parent]->$name ="+ Saved $name value $locator_string ($value) from bibtex import process ";
							}
						}//end if ($name=='address') {
						break;
					
					// Year may be accompanied by month data. In this way component_date store 'year' and 'month' in field 'date' as dd_date object
					case 'year':
						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
						$component 	 = component_common::get_instance($modelo_name,
																	  $component_tipo,
																	  $parent,
																	  'edit',
																	  DEDALO_DATA_LANG,
																	  $section_tipo);
						$dd_date = new dd_date();
							$dd_date->set_year($value);
							if (!empty($current_obj->month)) {
								$dd_date->set_month($value);
							}
						
						$component->set_dato( $dd_date );
						$component->Save();
						$ar_response[$parent]->$name ="+ Saved $name value ".to_string($value)." from bibtex import process";
						break;

					case 'file':
						if (empty($value)) {
							$ar_response[$parent]->$name ="- Ignored $name empty file from bibtex import process";
							break;
						}

						$ar_response[$parent]->$name = '';

						$file_name = self::resolve_filename( $value );	// Like 'Document with gorgeus name 1 - 99.pdf'

						# 
						# 1 COMPONENT_PDF (BIBLIO_COMPONENT_TIPO_BIBLIOGRAFIA_DOCUMENTO rsc209)
						# Create component pdf to obtain target path of pdf file 
						$component_tipo = BIBLIO_COMPONENT_TIPO_BIBLIOGRAFIA_DOCUMENTO;
						$component_pdf 	= component_common::get_instance('component_pdf',
																		 $component_tipo,
																		 $parent,
																		 'edit',
																		 DEDALO_DATA_LANG,
																		 $section_tipo);	# Important: is translatable
						$component_pdf->Save();	# Force save to get counter !Important
						$target_pdf_path = $component_pdf->get_pdf_path();
						$ar_response[$parent]->$name .="+ Created component_pdf path $target_pdf_path <br>";

						#
						# 2 COPY PDF FILE FROM SOURCE TO TARGET
						# Working here..
						$source_pdf_path = TOOL_IMPORT_BIBTEX_UPLOAD_DIR . $file_name ;
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
						$component_pdf->Save();	# Force save again to update value list with moved file !Important
						$ar_response[$parent]->$name .="+ Moved pdf $source_pdf_path to $target_pdf_path <br>";

						#
						# 3 INDEX/TRANSCRIBE PDF FILE CONTENT TO TEXT AREA (BIBLIO_COMPONENT_TIPO_BIBLIOGRAFIA_DESCRIPCION_TRANSCRIPCION rsc210)
						# $value contain page number like 20-43. Using first value like '20' to start page number counter
						$page = isset($current_obj->page) ? (int)$current_obj->page : 1;
						$str_response = self::transcribe_pdf( $component_pdf, $page );
						$ar_response[$parent]->$name .= $str_response;

						/* PREVIOUS CODE
							$options = new stdClass();
								$options->path_pdf 	 = (string)$target_pdf_path;	# full source pdf file path
								$options->first_page = (int)self::biblio_page_to_first_page( $page );	# number of first page. default is 1
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

								$component_tipo = BIBLIO_COMPONENT_TIPO_BIBLIOGRAFIA_DESCRIPCION_TRANSCRIPCION_REVISION;
								$component 		= component_common::get_instance('component_radio_button', $component_tipo, $parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
								$locator = new locator();
									$locator->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
									$locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);

								$component->set_dato( $locator );
								$component->Save();
								$ar_response[$parent]->$name .="- Saved transcription for revision: yes.<br>";

								#dump($component,'$component');
							
							}else{						
							
								$component_tipo = BIBLIO_COMPONENT_TIPO_BIBLIOGRAFIA_DESCRIPCION_TRANSCRIPCION;
								$component 		= component_common::get_instance('component_text_area', $component_tipo, $parent, 'edit', DEDALO_DATA_LANG, $section_tipo);
								$component->set_dato( $pdf_file_text->result );
								$component->Save();
								$ar_response[$parent]->$name .="+ Saved pdf text ".substr($pdf_file_text->result,0,160).".. as pdf transcription.<br>";
							}
							*/
						break;

					case 'issn':
					case 'isbn':
						// Store too normalized number typology
						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo(BIBLIO_COMPONENT_TIPO_TYPE_OF_NUMERO_NORMALIZADO,true);
						$component 	 = component_common::get_instance($modelo_name,
																	  BIBLIO_COMPONENT_TIPO_TYPE_OF_NUMERO_NORMALIZADO,
																	  $parent,
																	  'edit',
																	  DEDALO_DATA_NOLAN,
																	  $section_tipo);
						$locator = new locator();
							$locator->set_section_tipo(BIBLIO_SECTION_TYPE_OF_NORMALIZED_NUMBER);
							if($name=='issn')
								$locator->set_section_id(BIBLIO_TYPE_OF_NORMALIZED_NUMBER_ISSN_SECTION_ID);
							if($name=='isbn')
								$locator->set_section_id(BIBLIO_TYPE_OF_NORMALIZED_NUMBER_ISBN_SECTION_ID);						
						 
						$component->set_dato( $locator );
						$component->Save();
						$ar_response[$parent]->name_type_of_normalized_number ="+ Saved name_type_of_normalized_number value ".json_encode($locator)." from biblio import process";
						# Note don't break exists here intentionally

					default:
						// Normally of modelo_name 'component_input_text' and direct allocation
						if ($component_tipo) {
							$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
							$component 	 = component_common::get_instance($modelo_name,
																		  $component_tipo,
																		  $parent,
																		  'edit',
																		  DEDALO_DATA_LANG,
																		  $section_tipo);
							$component->set_dato( $value );
							$component->Save();
							$ar_response[$parent]->$name ="+ Saved $name value ".to_string($value)." from biblio import process";
						}//end if ($component_tipo) {

						if ($name=='title') {
							$ar_response[$parent]->titulo = $current_obj->$name;
						}
						break;
				}#end switch


			}#end foreach ($current_obj as $name => $value)


		}#end foreach ( (array)$checkbox_values as $key => $checked)
		#dump($ar_response, ' ar_response');

		return (array)$ar_response;
	}//end process_file



	/**
	* FORMAT_PAGES
	* @return 
	*/
	public static function format_pages( $value ) {		
		$page_value='';

		if (is_array($value)) {
			$page_start = isset($value['start']) ? (int)$value['start'] : 1;
			$page_end 	= isset($value['end']) ? '-'.(int)$value['end'] : null;
			$page_value = $page_start.$page_end;
		}else if (is_string($value)) {
			$page_value = trim($value);
		}else{
			trigger_error("ERROR: format_pages value is in wrong format!!. Only array and string are accepted. Current: ".gettype($value));
		}

		return $page_value;
	}#end format_pages


	/**
	* TRANSCRIBE_PDF
	* @param object $component_pdf
	* @param string|null $page
	* @return string $str_response
	*/
	public static function transcribe_pdf( $component_pdf, $page=null ) {
		
		$str_response='';

		$pdf_path 		= $component_pdf->get_pdf_path();
		$pdf_file_url 	= $component_pdf->get_pdf_url();
		$parent 		= $component_pdf->get_parent();
		$section_tipo 	= $component_pdf->get_section_tipo();		

		$page = $page ? (int)$page : 1;
		$options = new stdClass();
			$options->path_pdf 	 = (string)$pdf_path;	# full source pdf file path
			$options->first_page = (int)self::biblio_page_to_first_page( $page );	# number of first page. default is 1
				#dump($options, ' options');
		$pdf_file_text = (object)tool_transcription::get_text_from_pdf( $options );

		$clean_pdf_file_text = trim($pdf_file_text->original);

		#dump($clean_pdf_file_text,'$clean_pdf_file_text '.strlen($clean_pdf_file_text));

		if (empty($pdf_file_text) || !isset($pdf_file_text->result) || $pdf_file_text->result=='error' || strlen($clean_pdf_file_text)<1 ) {
			
			$str_response .= "<span class=\"error\">";
			$str_response .= "- Error in pdf to text transcription. <br>".$pdf_file_text->msg ."<br>";
			$str_response .= " (There are probably a permissions/security restriction problem like with the pdf file).";
			$str_response .= " Please review Document Security Content Copying options in file: <a href=\"$pdf_file_url\" target=\"_blank\" >".pathinfo($source_pdf_path)['basename']."</a>";
			$str_response .= "</span><br>";

			$component_tipo = BIBLIO_COMPONENT_TIPO_BIBLIOGRAFIA_DESCRIPCION_TRANSCRIPCION_REVISION;
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
			$component 		= component_common::get_instance($modelo_name,	// 'component_radio_button'
															 $component_tipo,
															 $parent,
															 'edit',
															 DEDALO_DATA_NOLAN,
															 $section_tipo);
			$locator = new locator();
				$locator->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
				$locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);

			$component->set_dato( $locator );
			$component->Save();
			$str_response .="- Saved transcription for revision: yes.<br>";

			#dump($component,'$component');
		
		}else{						
		
			$component_tipo = BIBLIO_COMPONENT_TIPO_BIBLIOGRAFIA_DESCRIPCION_TRANSCRIPCION;
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
			$component 		= component_common::get_instance($modelo_name,	//'component_text_area',
															 $component_tipo,
															 $parent,
															 'edit',
															 DEDALO_DATA_LANG,
															 $section_tipo);
			$component->set_dato( $pdf_file_text->result );
			$component->Save();
			$str_response .="+ Saved pdf text ".substr($pdf_file_text->result,0,160).".. as pdf transcription.<br>";
		}

		return $str_response;
	}#end transcribe_pdf




	/**
	* get_section_id_from_bibtex_reference
	* Busca en la lista de valores pública 'Colecciones / Series' el nombre dado y devuelve el section_id del registro encontrado si lo hay
	* @param string $biblio_container_title
	* @return int $section_id
	*/
	public static function get_section_id_from_bibtex_reference( $reference ) {
		$section_id=0;

		$tipo 			= BIBLIO_COMPONENT_TIPO_BIBLIOGRAFIA_CODIGO;		# Colección / Serie (component_input_text)
		$section_tipo   = BIBLIO_SECTION_TIPO_VIRTUAL_BIBLIOGRAFIA;		# 'rsc212'; 	# Lista de valores Colecciones / Series 
		$lang 			= DEDALO_DATA_NOLAN;
		$value 			= $reference;
		$table 			= common::get_matrix_table_from_tipo($section_tipo); 
		
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
	}//end get_section_id_from_bibtex_reference



	/**
	* SEARCH_PERSON
	* @return 
	*/
	public static function search_person( $name=null, $surname=null ) {
		
		$section_tipo   = BIBLIO_SECTION_TIPO_VIRTUAL_PERSONS;			
		$lang 			= DEDALO_DATA_NOLAN;		
		$table 			= common::get_matrix_table_from_tipo($section_tipo);
		
		$sql_filter = null;
		if ($surname) {
			$tipo 		  = BIBLIO_PERSONS_COMPONENT_TIPO_SURNAME;
			$sql_filter  .= JSON_RecordObj_matrix::build_pg_filter('gin','datos',$tipo,$lang,$surname);
		}
		if ($name) {
			if( strlen($sql_filter) )  $sql_filter  .= " AND ";
			$tipo 		  = BIBLIO_PERSONS_COMPONENT_TIPO_NAME;
			$sql_filter  .= JSON_RecordObj_matrix::build_pg_filter('gin','datos',$tipo,$lang,$name);
		}		


		$strQuery   = "-- ".__METHOD__."
		SELECT section_id
		FROM \"$table\"
		WHERE
		section_tipo = '$section_tipo'
		AND \n $sql_filter
		";
		$strQuery=sanitize_query($strQuery);
		if(SHOW_DEBUG) {
			#dump($strQuery, ' strQuery');
		}
		$result		= JSON_RecordObj_matrix::search_free($strQuery);
		$ar_section_id = array();
		while ($rows = pg_fetch_assoc($result)) {
			$ar_section_id = $rows['section_id'];			
		}
		#dump($section_id, ' section_id '.utf8_decode($strQuery));

		return $ar_section_id;

	}#end search_person



	/**
	* ADD_PERSON
	* @return 
	*/
	public static function add_person( $person_obj, $typology=null, $parent ) {
		
		#dump($person_obj, ' person_obj ++ $typology: '.to_string($typology));
		#
		# SECTION PERSONS
		$section_tipo 	= BIBLIO_SECTION_TIPO_VIRTUAL_PERSONS;
		$section 		= section::get_instance(null, $section_tipo);
		$section->Save();
		$section_id = $section->get_section_id();

			#
			# NAME
			if ( property_exists($person_obj,'name') && !empty($person_obj->name) ) {
				$tipo 		 = BIBLIO_PERSONS_COMPONENT_TIPO_NAME;			#dump($person_obj->name, 'ADDED $person_obj->name ++ parent: '.to_string($section_id));
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				$component 	 = component_common::get_instance($modelo_name,
															  $tipo,
															  $section_id,
															  'edit',
															  DEDALO_DATA_NOLAN,
															  $section_tipo);
				$component->set_dato( $person_obj->name );
				$component->Save();
			}

			#
			# SURNAME
			if ( property_exists($person_obj,'surname') && !empty($person_obj->surname) ) {
				$tipo 		 = BIBLIO_PERSONS_COMPONENT_TIPO_SURNAME;		#dump($person_obj->surname, 'ADDED $person_obj->surname ++ parent: '.to_string($section_id));
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				$component 	 = component_common::get_instance($modelo_name,
															  $tipo,
															  $section_id,
															  'edit',
															  DEDALO_DATA_NOLAN,
															  $section_tipo);
				$component->set_dato( $person_obj->surname );
				$component->Save();
			}

			#
			# TYPOLOGY
			if ($typology) {
				switch ($typology) {
					case 'author':
						$locator = new locator();
							$locator->set_section_tipo('dd911');
							$locator->set_section_id('14');	// Author						
						break;
					
					default:
						$locator = null;
						break;
				}
				if ($locator) {
					$tipo 		 = BIBLIO_PERSONS_COMPONENT_TIPO_TYPOLOGY;
					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
					$component 	 = component_common::get_instance($modelo_name,
																  $tipo,
																  $section_id,
																  'edit',
																  DEDALO_DATA_NOLAN,
																  $section_tipo);					
					$component->set_dato( array($locator) );
					$component->Save();
				}			
			}//end if ($typology) {
			

		#
		# SECTION BIBLIOGRAPHY
		$section_tipo 	= BIBLIO_SECTION_TIPO_VIRTUAL_BIBLIOGRAFIA;

			#
			# AUTHOR			
				$tipo 		 = BIBLIO_COMPONENT_TIPO_AUTORIA_RESPONSABILIDAD;
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				$component 	 = component_common::get_instance($modelo_name,
															  $tipo,
															  $parent,
															  'edit',
															  DEDALO_DATA_NOLAN,
															  $section_tipo);
				$locator = new locator();
					$locator->set_section_tipo(BIBLIO_SECTION_TIPO_VIRTUAL_PERSONS);
					$locator->set_section_id($section_id);
				
				$dato 	= $component->get_dato();
				$dato[] = $locator;
				$component->set_dato( $dato );
				$component->Save();
			

		return true;

	}#end add_person




	/**
	* SEARCH_SERIE
	* @return 
	*/
	public static function search_serie( $serie ) {
		
		$section_id_list= 0;

		$section_tipo   = BIBLIO_SECTION_TIPO_SERIES_COLECCIONES;			
		$lang 			= DEDALO_DATA_NOLAN;		
		$table 			= common::get_matrix_table_from_tipo($section_tipo);		
		
		$tipo 		  	= BIBLIO_COMPONENT_TIPO_SERIES_COLECCIONES;
		$sql_filter   	= JSON_RecordObj_matrix::build_pg_filter('gin','datos',$tipo,$lang,$serie);
		

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
			$section_id_list = $rows['section_id'];
			break;
		}
		#dump($section_id, ' section_id '.utf8_decode($strQuery));

		return $section_id_list;

	}#end search_serie



	/**
	* GET_TOPONYM_FROM_ADDRESS
	* NOTE: This method result is an 'aproximation'. Is no safe because only return the first math name without consider model or duplicate names 
	* @return object|null
	*/
	public static function get_toponym_from_address( $address ) {
		
		if (empty($address)) return null;

		$ar_referenced_tipo = array('dz1', 'ad1', 'cu1', 'fr1', 'ma1', 'pt1', 'es1', 'us1');
		$string_to_search 	= trim($address);
		$ar_data = component_autocomplete_ts::autocomplete_ts_search($ar_referenced_tipo, $string_to_search, $max_results=1, $show_modelo_name=false);
			#dump($ar_data, ' $ar_data ++ address: '.to_string($address));
		if (!empty($ar_data)) {
			#$ar_termino = reset($ar_data);
			$old_dato = key($ar_data);
			if (!empty($old_dato)) {
				return component_autocomplete_ts::convert_dato_to_locator($old_dato);
			}			
		}

		return null;

	}#end get_toponym_from_address




	/**
	* BIBLIO_PAGE_TO_FIRST_PAGE
	* Get first page int from page data like '27-40' to '27'
	* @param string $biblio_page
	* @return int $first_page default is 1
	*/
	public static function biblio_page_to_first_page( $biblio_page ) {

		switch (true) {
			case (empty($biblio_page)):
				$first_page = 1;
				break;

			case ( strpos($biblio_page, '-')!==false ):
				$ar_parts 	= explode('-', $biblio_page);
				$first_page = $ar_parts[0];
				break;

			default:
				$first_page = 1;
				break;
		}

		if( (int)$first_page < 1 ) $first_page = 1;

		return (int)$first_page;

	}#end biblio_page_to_first_page




	
};#end class



# SET TOOL CONTANTS
tool_import_bibtex::set_up();


?>