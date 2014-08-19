<?php
/*
* CLASS TOOL TIME MACHINE
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once(DEDALO_LIB_BASE_PATH .'/db/class.RecordObj_time_machine.php');


class tool_time_machine extends tool_common {


	protected $source_component;

	protected $id;
	protected $tipo;
	protected $lang;


	# STRUCTURE DATA
	protected $RecordObj_ts ;
	protected $modelo;
	protected $norden;
	protected $label;

	public $id_time_machine;
	public $current_tipo_section;


	public static $preview_variant = 'preview_tm_';
	public static $actual_variant  = 'actual_tm_';

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


		#$this->load_data_from_component();
		#$this->load_structure_data();
	}


	/**
	* RENDER COMPONENT TIME MACHINE
	* STATIC COMPOUND ARRAY OF TIME_MACHINE OBJTECTS (ONE FOR EVERY TIME_MACHINE RECORD)
	* @see Used by trigger.tool_time_machine.php
	*/
	public static function get_ar_component_time_machine($id_matrix, $lang=NULL) {

		# Creamos un objeto time_machine con los datos recibidos
		$RecordObj_time_machine		= new RecordObj_time_machine(NULL);

		# creamos un array con las coincidencias existentes
		$ar_time_machine_records	= $RecordObj_time_machine->get_ar_time_machine_of_this($id_matrix, $lang);
			#dump($ar_time_machine_records,'ar_time_machine_records'); exit();

		$ar_time_machine_obj = array();

		# Crea un array con los objetos time_machine correspondientes a los id's hallados
		if( is_array($ar_time_machine_records)) foreach($ar_time_machine_records as $id)  {

			# Crea un nuevo objeto time_machine
			$RecordObj_time_machine	= new RecordObj_time_machine($id);

			# Lo añadimos al array de objetos
			$ar_time_machine_obj[]	= $RecordObj_time_machine;
		}

		return $ar_time_machine_obj;
	}



	/**
	* GET AR SECTIONS TIME MACHINE
	* Get time machine id array of sections that no exists in matrix now (deleted sections)
	* @param $tipo (string section tipo like 'dd292')
	* @return $ar_sections_time_machine (array of time machine id's of deleted sections)
	* 	POR DEPURAR...
	*/
	public function get_ar_sections_time_machine($tipo) {

		if($tipo == logger_backend_activity::$_SECTION_TIPO['tipo']) {
			#throw new Exception("Error Processing Request", 1);
			return NULL;
		}

		if(SHOW_DEBUG) $start_time = start_time();

		$ar_sections_time_machine = array();


		# Buscamos en time machine todos los registros de sección de este tipo
		$arguments=array();
		$arguments['strPrimaryKeyName']= 'id_matrix' ;
		#$arguments['parent']			= 0 ;
		$arguments['tipo']				= $tipo ;
		$RecordObj_time_machine			= new RecordObj_time_machine(NULL);
		$RecordObj_time_machine->set_use_cache(false);
		$ar_records_tm 					= $RecordObj_time_machine->search($arguments);
			#dump($ar_records_tm,"ar_records_tm for tipo: $tipo ".print_r($arguments,true));

		# Buscamos en matrix todos los registros de sección de este tipo
		$arguments=array();
		#$arguments['parent']			= 0 ;
		$arguments['tipo']				= $tipo ;
		$matrix_table 					= common::get_matrix_table_from_tipo($tipo);
		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_records_matrix 				= $RecordObj_matrix->search($arguments);
			#dump($ar_records_matrix,"ar_records_matrix for tipo: $tipo ".print_r($arguments,true) );


		# Recorremos los registros de time machine excluyendo los existentes en matrix
		/* OLD MODE
		foreach ($ar_records_tm as $id_tm) {

			#$RecordObj_time_machine = new RecordObj_time_machine($id_tm);
			#$id_matrix 				= $RecordObj_time_machine->get_id_matrix();

			# Por velocidad, usamos search directamente para calcular el id
			$arguments=array();
			$arguments['strPrimaryKeyName']= 'id_matrix' ;
			$arguments['id']				= $id_tm ;
			$RecordObj_time_machine			= new RecordObj_time_machine(NULL);
			$id_matrix 						= $RecordObj_time_machine->search($arguments)[0];

			if ( !in_array($id_matrix, $ar_records_matrix) && $id_tm>0 ) {
				$ar_sections_time_machine[$id_tm] = $id_matrix;
			}
			$i++;
			if($i>=10000) break;
		}
		*/
		foreach ($ar_records_tm as $id_matrix) {

			if ( !in_array($id_matrix, $ar_records_matrix) ) {

				# Por velocidad, usamos search directamente para calcular el id_tm
				$arguments=array();
				$arguments['id_matrix']			= $id_matrix ;
				#$RecordObj_time_machine		= new RecordObj_time_machine(NULL);
				$id_tm 							= $RecordObj_time_machine->search($arguments)[0];

				$ar_sections_time_machine[$id_tm] = $id_matrix;
			}
		}
		#dump($ar_sections_time_machine,'ar_sections_time_machine');

		#dump( exec_time($start_time, __METHOD__, $ar_sections_time_machine), 'exec_time' );
		#return array();

		if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $ar_sections_time_machine);

		return $ar_sections_time_machine ;
	}


	/**
	* GET AR SECTIONS TIME MACHINE
	* Get time machine id array of sections that no exists in matrix now (deleted sections)
	* @param $tipo (string section tipo like 'dd292')
	* @return $ar_sections_time_machine (array of time machine id's of deleted sections)
	*/
	public function recover_section_from_time_machine($id_time_machine) {

		# RECORDOBJ_TIME_MACHINE
		$RecordObj_time_machine		= new RecordObj_time_machine($id_time_machine);

			# Get vars from time machine record
			$id_matrix 	= $RecordObj_time_machine->get_id_matrix();
			$parent 	= $RecordObj_time_machine->get_parent();
			$dato 		= $RecordObj_time_machine->get_dato();
			$tipo 		= $RecordObj_time_machine->get_tipo();
			$lang 		= $RecordObj_time_machine->get_lang();


		# RECORDOBJ_MATRIX
		$matrix_table 		= 'matrix';
		$RecordObj_matrix 	= new RecordObj_matrix($matrix_table,NULL,$parent,$tipo,$lang);	#($id=NULL, $parent=NULL, $tipo=NULL, $lang=NULL)

			# Set vars (all for avoid confussions and force save to db)
			$RecordObj_matrix->set_ID($id_matrix);	# Require 'set_force_insert_on_save' to true
			$RecordObj_matrix->set_parent($parent);
			$RecordObj_matrix->set_dato($dato);
			$RecordObj_matrix->set_tipo($tipo);
			$RecordObj_matrix->set_lang($lang);

			# Prevent re-save in time machine
			$RecordObj_matrix->set_save_time_machine_version(false);

			# Force insert record with self id (not auto_increment)
			$RecordObj_matrix->set_force_insert_on_save(true);

			# Save section record cloned of time machine version maintain original matrix id
			$RecordObj_matrix->Save();
				#dump($RecordObj_matrix,"RecordObj_matrix after save for id_time_machine: $id_time_machine");

			# Fix section vars
			$section_tipo 		= $tipo;
			$section_id_matrix 	= $id_matrix;

		# COMPONENTS

			# Structure. Despejamos todos los componentes de esta sección
			#$section 			= new section(NULL, $tipo);
			$ar_components_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, array('component_') );
				#dump($ar_components_tipo,'$ar_components_tipo');

			foreach($ar_components_tipo as $component_tipo) {

				unset($ar_id);
				unset($ar_results_grouped_by_lang);

				# Search time machine commponents records by current parent / tipo
				$arguments=array();
				$arguments['parent'] 	= $section_id_matrix;
				$arguments['tipo'] 		= $component_tipo;
				# all langs
				$RecordObj_time_machine	= new RecordObj_time_machine(NULL);
				$ar_id					= $RecordObj_time_machine->search($arguments);
					#dump($ar_id,"registros del component_tipo:$component_tipo, section_id_matrix:$section_id_matrix ");

				if(!empty($ar_id)) {

					# Iterate results to separate different langs
					$ar_results_grouped_by_lang = array();
					if (is_array($ar_id)) foreach($ar_id as $current_id_tm) {

						$RecordObj_time_machine	= new RecordObj_time_machine($current_id_tm);
						$current_lang 			= $RecordObj_time_machine->get_lang();

						$ar_results_grouped_by_lang[$current_lang][] = $current_id_tm;
					}
					#dump($ar_results_grouped_by_lang,"ar_results_grouped_by_lang for component_tipo:$component_tipo, current_id_tm:$current_id_tm ");

					# Iterate grouped results by lang to get last record for every lang
					foreach ($ar_results_grouped_by_lang as $current_lang => $ar_id_tm) {

						$last_record_id = max($ar_id_tm);

						# RECORDOBJ_TIME_MACHINE
						$RecordObj_time_machine		= new RecordObj_time_machine($last_record_id);

							# Get vars from time machine record
							$id_matrix 	= $RecordObj_time_machine->get_id_matrix();
							$parent 	= $RecordObj_time_machine->get_parent();
							$dato 		= $RecordObj_time_machine->get_dato();
							$tipo 		= $RecordObj_time_machine->get_tipo();
							$lang 		= $RecordObj_time_machine->get_lang();

						# RECORDOBJ_MATRIX
						$matrix_table 		= 'matrix';
						$RecordObj_matrix 	= new RecordObj_matrix($matrix_table,NULL,$parent,$tipo,$lang);	#($id=NULL, $parent=NULL, $tipo=NULL, $lang=NULL)

							# Set vars (all for avoid confussions and force save to db)
							$RecordObj_matrix->set_ID($id_matrix);	# Require 'set_force_insert_on_save' to true
							$RecordObj_matrix->set_parent($parent);
							$RecordObj_matrix->set_dato($dato);
							$RecordObj_matrix->set_tipo($tipo);
							$RecordObj_matrix->set_lang($lang);

							# Prevent re-save in time machine
							$RecordObj_matrix->set_save_time_machine_version(false);

							# Force insert record with self id (not auto_increment)
							$RecordObj_matrix->set_force_insert_on_save(true);

							# Save section record cloned of time machine version maintain original matrix id
							$RecordObj_matrix->Save();
								#dump($RecordObj_matrix,"RecordObj_matrix after save for id_time_machine: $id_time_machine");

							# COMPONENT NAME
							$component_name = RecordObj_ts::get_modelo_name_by_tipo($tipo);

							$top_tipo 		= $_SESSION['config4']['top_tipo'];
							$top_id 		= $_SESSION['config4']['top_id'];

							# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
							logger::$obj['activity']->log_message(
								'RECOVER COMPONENT',
								logger::INFO,
								$tipo,
								NULL,
								array(	"msg"			=> "Recovered component data from time machine",
										"id" 			=> $id_matrix,
										"tipo"			=> $component_tipo,
										"parent"		=> $parent,
										"lang"			=> $lang,
										"top_id"		=> $top_id,
										"top_tipo"		=> $top_tipo,
										"component_name"=> $component_name,
										"table"			=> $matrix_table,
										"tm_id"			=> $last_record_id
									 )
							);
							/**/
					}#end foreach ($ar_results_grouped_by_lang as $current_lang => $ar_id_tm)

				}#end if(!empty($ar_id))

			}#end foreach($ar_components_tipo as $component_tipo)



		# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
		logger::$obj['activity']->log_message(
			'RECOVER SECTION',
			logger::INFO,
			$section_tipo,
			NULL,
			#array("msg"=>"Saved recovered section record id:$section_id_matrix, tipo:$section_tipo in table:matrix from ".__METHOD__)
			array(	"msg"			=> "Recovered section record from time machine",
					"id" 			=> $section_id_matrix,
					"tipo"			=> $section_tipo,
					"top_id"		=> $section_id_matrix,
					"top_tipo"		=> $section_tipo,
					"table"			=> $matrix_table,
					"tm_id"			=> $id_time_machine
				 )
		);

		return true;
	}




}
?>
