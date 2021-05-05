<?php
/*
* CLASS TOOL TIME MACHINE
*/
#require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
#require_once(DEDALO_LIB_BASE_PATH .'/db/class.RecordObj_time_machine.php');
class tool_time_machine extends tool_common {


	protected $source_component;

	protected $id;
	protected $tipo;
	protected $lang;


	# STRUCTURE DATA
	protected $RecordObj_dd ;
	protected $modelo;
	protected $norden;
	protected $label;

	public $id_time_machine;
	public $current_tipo_section;


	public static $preview_variant = 'preview_tm_';
	public static $actual_variant  = 'actual_tm_';


	public $section_tipo;
	public $user_name;

	public $limit;
	public $offset;


	const NOTES_TM_SECTION_TIPO		= 'rsc832';
	const NOTES_TM_CODE_TIPO		= 'rsc835';
	const NOTES_TM_ANNOTATION_TIPO	= 'rsc329';


	/*
	* Queda unificar el comportamiento con tool lang ... <-----------------------
	*/


	public function __construct($component_obj, $modo='button') {

		# Fix modo
		$this->modo = $modo;

		# Para unificar el acceso, se copia el componente a $this->component_obj
		$this->component_obj 	= $component_obj;

		# Fix component
		$this->source_component = $component_obj;
		#$this->source_component->set_modo('edit');
			#dump($component_obj,'component_obj');

		$this->section_tipo = $component_obj->get_section_tipo();
			#dump($this->section_tipo," section_tipo");
		#$this->load_data_from_component();
		#$this->load_structure_data();

		$this->lang = $component_obj->get_lang();
	
		
		return true;
	}//end __construct



	/**
	* RENDER COMPONENT TIME MACHINE
	* STATIC COMPOUND ARRAY OF TIME_MACHINE OBJTECTS (ONE FOR EVERY TIME_MACHINE RECORD)
	* @see Used by trigger.tool_time_machine.php
	*/
	public static function get_ar_component_time_machine($tipo, $parent, $lang=null, $section_tipo=null, $limit=10, $offset=0) {

		if (empty($section_tipo)) {
			throw new Exception("Error Processing Request", 1);			
		}

		# creamos un array con las coincidencias existentes
		$ar_time_machine_records = RecordObj_time_machine::get_ar_time_machine_of_this($tipo, $parent, $lang, $section_tipo, $limit, $offset);
			#dump($ar_time_machine_records,'ar_time_machine_records'); exit();

		$ar_time_machine_obj = array();

		# Create an array of objects corresponding to time_machine id's found
		if( is_array($ar_time_machine_records)) foreach($ar_time_machine_records as $id)  {

			# Build new time_machine object
			$RecordObj_time_machine	= new RecordObj_time_machine($id);

			# Add current TM object
			$ar_time_machine_obj[]	= $RecordObj_time_machine;
		}
		

		return $ar_time_machine_obj;
	}//end get_ar_component_time_machine



	/**
	* GET AR SECTIONS TIME MACHINE
	* @param $section_tipo (string section tipo like 'dd292')
	*/
	public static function get_ar_sections_time_machine($section_tipo) {

		if($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) return null;

		if(SHOW_DEBUG) $start_time = start_time();

		$ar_sections_time_machine = array();

		#if the section virtual have the section_tipo "real" in properties change the tipo of the section to the real
		$RecordObj_dd = new RecordObj_dd($section_tipo);
		$propiedades  = $RecordObj_dd->get_propiedades();
		$propiedades  = json_decode($propiedades);
		if(isset($propiedades->section_tipo) && $propiedades->section_tipo === "real"){
			$section_tipo = section::get_section_real_tipo_static($section_tipo);
		}

		#
		# MATRIX TIME MACHINE
		# Search all sections of current tipo in table matrix_time_machine
		$arguments=array();
		$arguments['strPrimaryKeyName']= 'section_id' ;
		$arguments['section_tipo']		= $section_tipo ;
		$arguments['tipo']				= $section_tipo ;
		$arguments['state']				= 'deleted';
		$arguments['order_by_asc']		= 'id';
		#$arguments['sql_limit']			= 5;
		$RecordObj_time_machine			= new RecordObj_time_machine(null);
		#$RecordObj_time_machine->set_use_cache(false);
		$ar_records_tm 					= (array)$RecordObj_time_machine->search($arguments);
			#dump($ar_records_tm,"ar_records_tm for tipo: $section_tipo ".print_r($arguments,true)); die();

		$ar_sections_time_machine = $ar_records_tm;
		/*
		foreach ($ar_records_tm as $current_id_tm) {
			# code...
			$arguments=array();
			$arguments['strPrimaryKeyName']= 'id_matrix' ;
			$arguments['id']				= $current_id_tm ;			
			$RecordObj_time_machine			= new RecordObj_time_machine(null);
			$RecordObj_time_machine->set_use_cache(false);
			$ar_records 					= $RecordObj_time_machine->search($arguments);
			$id_matrix = $ar_records[0];

			$ar_sections_time_machine[$current_id_tm] = $id_matrix;
		}
		#dump($ar_sections_time_machine,"ar_sections_time_machine");
		*/

		if(SHOW_DEBUG) {
			#$GLOBALS['log_messages'][] = exec_time($start_time, __METHOD__, $ar_sections_time_machine);
		}

		return $ar_sections_time_machine ;
	}//end get_ar_sections_time_machine



	/**
	* GET AR SECTIONS TIME MACHINE
	* Get time machine id array of sections that no exists in matrix now (deleted sections)
	* @param $id_time_machine int
	* @return bool true
	*/
	public static function recover_section_from_time_machine($id_time_machine) {

		/*
		# db fieldn ame			# property name
			"id" 					=> "ID",		# integer
			# "id_matrix" 			=> "id_matrix",	# integer
			"section_id" 			=> "section_id",# integer
			"tipo" 					=> "tipo",		# string charvar 32
			"lang" 					=> "lang", 		# string 16
			"timestamp" 			=> "timestamp", # timestamp standar db format
			"userID" 				=> "userID", 	# integer
			"state" 				=> "state",		# string char 32
			"dato" 					=> "dato",		# jsonb format			
		*/

		# RecordObj_time_machine
		$RecordObj_time_machine	= new RecordObj_time_machine($id_time_machine);
			#$id_matrix 			= $RecordObj_time_machine->get_id_matrix();
			$section_id 		= $RecordObj_time_machine->get_section_id();// section_id
			$section_tipo 		= $RecordObj_time_machine->get_tipo(); 		// is section_tipo
			$dato 				= $RecordObj_time_machine->get_dato();		


		# JSON_RecordObj_matrix
		$matrix_table = common::get_matrix_table_from_tipo($section_tipo);
		$JSON_RecordObj_matrix 	= new JSON_RecordObj_matrix($matrix_table, $section_id, $section_tipo);
			#$JSON_RecordObj_matrix->set_ID($id_matrix);
			#$JSON_RecordObj_matrix->set_section_id($section_id);
			$JSON_RecordObj_matrix->set_datos($dato);
			$JSON_RecordObj_matrix->set_save_time_machine_version( (bool)false );
			$JSON_RecordObj_matrix->set_force_insert_on_save( (bool)true );	

			#dump($JSON_RecordObj_matrix,"JSON_RecordObj_matrix");
			#dump($JSON_RecordObj_matrix,"JSON_RecordObj_matrix->get_id()");
			#die();		

			$save_options = new stdClass();
				$save_options->new_record = true;

			$result = $JSON_RecordObj_matrix->Save($save_options);
				#dump($result,"result");

		# Set state 'recovered' at matrix_time_machine record (to avoid be showed for recover later)
		$RecordObj_time_machine->set_state('recovered');
		$RecordObj_time_machine->Save();


		#
		# Section recover media files
		$section = section::get_instance($section_id, $section_tipo);
		$section->restore_deleted_section_media_files();
		if(SHOW_DEBUG) {
			#dump($section, ' section');
		}		


		# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
		logger::$obj['activity']->log_message(
			'RECOVER SECTION',
			logger::INFO,
			$section_tipo,
			NULL,
			array(	"msg"			=> "Recovered section record from time machine",
					"section_id" 	=> $section_id,
					"section_tipo"	=> $section_tipo,
					"top_id"		=> $section_id,
					"top_tipo"		=> $section_tipo,
					"table"			=> $matrix_table,
					"tm_id"			=> $id_time_machine
				 )
		);

		return true;
	}//end recover_section_from_time_machine



	/**
	* USER_CAN_RECOVER_SECTIONS
	*/
	public static function user_can_recover_sections( $tipo, $userID ) {
		
		# RECOVER RESTRICTIONS
		# Only area administrators can recover sections		

		#
		# Gloabal admin		
		$is_global_admin = (bool)component_security_administrator::is_global_admin($userID);
		if ($is_global_admin===true) {
			return true;
		}

		#
		# Admin of current area
		$is_admin_of_current_area		= (bool)false;
		$ar_authorized_areas_for_user 	= component_security_areas::get_ar_authorized_areas_for_user($userID, $mode_result='full');
			#dump($ar_authorized_areas_for_user, 'ar_authorized_areas_for_user - tipo: '. $tipo);
		foreach ((array)$ar_authorized_areas_for_user as $key => $value) {
			#if ($key == $tipo.'-admin' && $value == 2) {
			if ($key === $tipo && (int)$value === 3) {
				return true;				
			}
			#
			# USERS / GROUPS / PROJECTS CASE 
			# This areas don't have '-admin' parameter, so we accept only type as administrable (with state '2')
			switch (true) {
				case ($key===$tipo && $tipo===DEDALO_SECTION_USERS_TIPO && $value >= 2):
					return (bool)true;
					break;
				case ($key===$tipo && $tipo===DEDALO_SECTION_PROFILES_TIPO && $value >= 2):
					return (bool)true;
					break;	
				case ($key===$tipo && $tipo===DEDALO_SECTION_PROJECTS_TIPO && $value >= 2):
					return (bool)true;
					break;
			}
		}

		return false;
	}//end user_can_recover_sections



	/**
	* UPDATE_RECORDS_IN_TIME_MACHINE
	* @return array $ar_time_machine_obj
	*/
	public static function update_records_in_time_machine($tipo, $parent, $lang=null, $section_tipo=null) {

		if (empty($section_tipo)) {
			throw new Exception("Error Processing Request", 1);			
		}

		# Creamos un objeto time_machine con los datos recibidos
		$RecordObj_time_machine		= new RecordObj_time_machine(NULL);

		# creamos un array con las coincidencias existentes
		$ar_time_machine_records	= $RecordObj_time_machine->get_ar_time_machine_of_this($tipo, $parent, $lang, $section_tipo);
			#dump($ar_time_machine_records,'ar_time_machine_records'); exit();

		$ar_time_machine_obj = array();

		# Create an array of objects corresponding to time_machine id's found
		if( is_array($ar_time_machine_records)) foreach($ar_time_machine_records as $id)  {

			# Build new time_machine object
			$RecordObj_time_machine	= new RecordObj_time_machine($id);

			# Add current TM object
			$ar_time_machine_obj[]	= $RecordObj_time_machine;
		}
		#dump($ar_time_machine_obj,"ar_time_machine_obj");exit();

		return $ar_time_machine_obj;		
	}//end update_records_in_time_machine



	/**
	* GET SOURCE LANGS
	* @return array $ar_source_langs
	*/
	public function get_source_langs() {
		
		$component_ar_langs = (array)$this->source_component->get_component_ar_langs();
	
		$ar_source_langs=array();
		foreach ($component_ar_langs as $current_lang) {

			$name = lang::get_name_from_code($current_lang);

			if (empty($name)) {
				$name = $current_lang;
			}

			$ar_source_langs[$current_lang] = $name;
		}

		// add project langs always
			$DEDALO_PROJECTS_DEFAULT_LANGS = unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
			foreach ($DEDALO_PROJECTS_DEFAULT_LANGS as $current_lang) {
				
				if (!isset($ar_source_langs[$current_lang])) {

					$name = lang::get_name_from_code($current_lang);

					$ar_source_langs[$current_lang] = $name;
				}
			}
	
		return $ar_source_langs;
	}//end get_source_langs



	/**
	* GET_TM_NOTES
	* @param array $id_time_machine
	* @return array $tm_notes
	*/
	public static function get_tm_notes($id_time_machine, $lang=DEDALO_DATA_LANG) {
		
		$tm_notes = $id_time_machine;

		// NOTES_TM_SECTION_TIPO	= 'rsc832';
		// NOTES_TM_CODE_TIPO		= 'rsc835';
		// NOTES_TM_ANNOTATION_TIPO	= 'rsc329';

		$q = implode(';',(array)$id_time_machine);
	
		// sqo -- 1565586
			$sqo = json_decode('
				{
				  "id": "rtm_notes",
				  "section_tipo": "'.self::NOTES_TM_SECTION_TIPO.'",
				  "limit": 0,
				  "filter": {
				    "$and": [
				      {
				        "q": "'.$q.'",
				        "q_operator": null,
				        "path": [
				          {
				            "section_tipo": "'.self::NOTES_TM_SECTION_TIPO.'",
				            "component_tipo": "'.self::NOTES_TM_CODE_TIPO.'",
				            "modelo": "component_number",
				            "name": "Code"
				          }
				        ]
				      }
				    ]
				  },
				  "select": [
				  	{
			            "path": [
			                {
			                    "name": "Annotation",
			                    "modelo": "component_text_area",
			                    "section_tipo": "'.self::NOTES_TM_SECTION_TIPO.'",
			                    "component_tipo": "'.self::NOTES_TM_ANNOTATION_TIPO.'"
			                }
			            ],
			            "component_path": [
			                "components",
			                "'.self::NOTES_TM_ANNOTATION_TIPO.'",
			                "dato",
			                "'.$lang.'"
			            ],
			            "type": "string"
			        },
			        {
			            "path": [
			                {
			                    "name": "Code",
			                    "modelo": "component_number",
			                    "section_tipo": "'.self::NOTES_TM_SECTION_TIPO.'",
			                    "component_tipo": "'.self::NOTES_TM_CODE_TIPO.'"
			                }
			            ],
			            "component_path": [
			                "components",
			                "'.self::NOTES_TM_CODE_TIPO.'",
			                "dato",
			                "lg-nolan"
			            ],
			            "type": "number"
			        }			        
				  ]
				}
			');
			# Search records
			$search_development2	= new search_development2($sqo);
			$search_result			= $search_development2->search();
			$ar_records				= $search_result->ar_records;
				// dump($ar_records, ' ar_records ++ '.to_string());

		// data
			$data = [];
			foreach ($ar_records as $key => $row) {

				// $user_data	= json_decode($row->dd200);
				// $date_data	= json_decode($row->dd199);
				// $date		= reset($date_data)->start;
				// $user_id		= reset($user_data)->section_id;

				$section = section::get_instance($row->section_id, $row->section_tipo);
				// $modified_by_userID 	= $section->get_modified_by_userID();
				// $modified_date 			= $section->get_modified_date();
				$created_by_userID 		= $section->get_created_by_userID();
				$created_by_user_name 	= $section->get_created_by_user_name();
				$created_date 			= $section->get_created_date();

				$data[] = (object)[
					'section_id'		=> $row->section_id,
					'section_tipo'		=> $row->section_tipo,
					'note'				=> $row->{self::NOTES_TM_ANNOTATION_TIPO},
					'id_time_machine'	=> $row->{self::NOTES_TM_CODE_TIPO},
					'date'				=> $created_date,
					'user_id'			=> $created_by_userID,
					'user_name'			=> $created_by_user_name
				];
			}

		return $data;
	}//end get_tm_notes



	/**
	* ADD_TM_NOTE
	* Creates a new toime machine notes section and set code data as received id_time_machine
	* to link created record with time machine record
	* @param int $id_time_machine
	* @param string $lang
	* @return int $section_id
	*/
	public static function add_tm_note($id_time_machine, $lang=DEDALO_DATA_LANG) {

		if (empty($id_time_machine)) {
			return false;
		}
		
		$section = section::get_instance( null, self::NOTES_TM_SECTION_TIPO );

		$options = new stdClass();
			$options->top_tipo = self::NOTES_TM_SECTION_TIPO;

		// Section save returs the section_id created
			$section_id = $section->Save($options);

		// add current id_time_machine as code value
			$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo(self::NOTES_TM_CODE_TIPO,true);
			$component		= component_common::get_instance($modelo_name,
															 self::NOTES_TM_CODE_TIPO,
															 $section_id,
															 'edit',
															 $lang,
															 self::NOTES_TM_SECTION_TIPO);
			$dato = (int)$id_time_machine;
			$component->set_dato($dato);
			$component->Save();


		return $section_id;
	}//end add_tm_note



}//end class