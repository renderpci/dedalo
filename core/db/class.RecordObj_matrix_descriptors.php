<?php declare(strict_types=1);
/**
* RecordObj_matrix_descriptors
* Handles matrix_descriptors_dd table records
*/
class RecordObj_matrix_descriptors extends RecordDataBoundObject {



	// (!) CALL ONLY USED BY RecordObj_descriptors_dd



	// matrix vars
	protected $parent;
	protected $tipo;
	protected $lang;

	public $dato;

	// specific vars
	protected $ar_matrix_childrens_of_this;
	protected $caller_obj; 	// optional

	// table  matrix_table
	protected $matrix_table ;

	// time machine last id
	public $time_machine_last_id;

	public $save_time_machine_version = true;



	/**
	* CONSTRUCT
	*/
	public function __construct( ?string $matrix_table=null, ?int $id=null, ?string $parent=null, ?string $tipo=null, ?string $lang=null ) {

		// matrix table check
			if(empty($matrix_table)) {
				debug_log(__METHOD__." Error Processing Request. matrix_table is mandatory ", logger::ERROR);
				if(SHOW_DEBUG===true) {
					dump($matrix_table, "id:$id - parent:$parent - tipo:$tipo - lang:$lang");
				}
				return;
			}

		// table set always before construct recordataboundobject
			$this->matrix_table = $matrix_table;


		if ( (int)$id>0 ) {

			// Ignore other vars
			parent::__construct( (string)$id );

		}else{

			// Sets the known variables
			if(!empty($parent))	$this->set_parent($parent);
			if(!empty($tipo))	$this->set_tipo($tipo);
			if(!empty($lang))	$this->set_lang($lang);

			parent::__construct( null );
		}
	}//end __construct



	# define current table (tr for this obj)
	protected function defineTableName() : string {
		return $this->matrix_table;
	}
	# define PrimaryKeyName (id)
	protected function definePrimaryKeyName() : string {
		return 'id';
	}
	# array of pairs db field name, obj property name like fieldName => propertyName
	protected function defineRelationMap() : array {
		# db fieldname => # property name
		return [
			'id'		=> 'ID',
			'parent'	=> 'parent',
			'dato'		=> 'dato',
			'tipo'		=> 'tipo',
			'lang'		=> 'lang'
		];
	}//end defineRelationMap



	/**
	* CHANGE TABLE . Set another matrix table (default is 'matrix')
	*/
	public function set_matrix_table(string $table_name) {
		throw new Exception("Error Processing Request. Current function is deprecated. Use __construct(table, ...)", 1);

		#dump($table_name,"called table_name: $table_name");
		# Update local var matrix_table
		$this->matrix_table = $table_name;
		# Change RDBO var strTableName
		$this->strTableName = $table_name;
	}
	/*
	public function get_lang() {
		if(isset($this->lang)) return $this->lang;

		# Si no se ha fijado lang pero si el id, extraemos de la db el lang
		if(isset($this->id)) {
			# Forzamos la carga
			$dato = $this->get_dato();
			$lang = parent::get_lang();
			return $lang;
		}
	}
	*/



	/**
	* GET_ID
	* @return int|null $ID
	*/
	public function get_id() : ?int {

		$ID = ($this->ID===null)
			? $this->calculate_ID()
			: parent::get_ID();

		return !is_null($ID)
			? (int)$ID
			: null;
	}//end get_ID



	/**
	* CALCULATE ID
	* resolve ID from $parent, $tipo and $lang
	* @param $this->tipo
	* @param $this->parent
	* @param $this->lang (optional)
	*/
	protected function calculate_ID() {

		# RECORDOBJ_MATRIX_DESCRIPTORS : IMPORTANT ! Set use cache to false
		#$this->use_cache = false;

		if($this->ID!==null) {
			return (int)$this->ID;
		}

		$id = null;

		$parent = $this->get_parent();
		if (strlen($parent)===0) {
			$parent = intval(0);
		}
		$tipo 	= $this->get_tipo();
		$lang 	= $this->get_lang();

		$matrix_table = $this->matrix_table;

		if ($matrix_table==='matrix_descriptors_dd') {
			debug_log(__METHOD__
				. " Error. Invalid call to unsupported table 'matrix_descriptors_dd' " . PHP_EOL
				, logger::ERROR
			);
			$bt = debug_backtrace();
			dump($bt, ' debug_backtrace ++ '.to_string($matrix_table));
		}

		$arguments = array();

		# PARENT (optional)
		if(!empty($parent))
		$arguments['parent'] = $parent;

		# TIPO
		$arguments['tipo'] = $tipo;

		# LANG (optional)
		if(!empty($lang))
		$arguments['lang'] = $lang;

		# SEARCH IN MATRIX
			$ar_id = $this->search($arguments, $matrix_table);
			#dump($arguments,"called calculate_ID result in $this->matrix_table:".print_r($ar_id,true));

		if( !empty($ar_id[0]) && $ar_id[0]>0 ) {
			$id = $ar_id[0];
		}

		if(!empty($id)) {
			$this->set_ID($id);
			#if($tipo!=DEDALO_ACTIVITY_SECTION_TIPO) $_SESSION['dedalo']['config']['calculate_ID'][$idu] = $id;
		}

		#if(SHOW_DEBUG===true) error_log("calculado id:$id from parent:$parent, tipo:$tipo, lang:$lang, table:$this->matrix_table");

		return $id ;
	}//end calculate_ID



	/**
	* TEST CAN SAVE
	* Test data before save to avoid write malformed matrix data
	* @return bool
	*/
	private function test_can_save() : bool {

		# CURRENT OBJ TEST COPY
		if (!empty($this->ID) ) {
			# Load dummy copy to test data (Avoid overwrite current object edited data)
			$RecordObj_matrix_descriptors_test 	= new RecordObj_matrix_descriptors($this->matrix_table, (int)$this->ID);
		}

		# TEST VALID TIPO
		if ( empty($this->tipo) ) {
			# Si no está definido, lo intentamos cargar del matrix test
			if (isset($RecordObj_matrix_descriptors_test))	$this->tipo	= $RecordObj_matrix_descriptors_test->get_tipo();
			# Si no existe o no existe en matrix test, lanzamos una excepción
			if (empty($this->tipo) || strlen($this->tipo)<3 ) {
				dump($RecordObj_matrix_descriptors_test,'this en matrix RecordObj_matrix_descriptors id:'.$this->ID );
				$msg = "Save matrix: valid 'tipo' value is mandatory! (tipo:$this->tipo) No data is saved!";
				debug_log(__METHOD__.$msg);
				// $GLOBALS['log_messages'][] = $msg;
				throw new Exception($msg, 1);
				return false;
			}
		}

		# TEST VALID LANG
		if ( empty($this->lang) ) {
			# Si no está definido, lo intentamos cargar del matrix test
			if (isset($RecordObj_matrix_descriptors_test))	$this->lang	= $RecordObj_matrix_descriptors_test->get_lang();
			# Si no existe o no existe en matrix test, lanzamos una excepción
			if (empty($this->lang) || strlen($this->lang)<5) {
				$msg = "Save matrix: valid 'lang' value is mandatory! (lang:$this->lang) No data is saved! <br>";
				debug_log(__METHOD__.$msg);
				// $GLOBALS['log_messages'][] = $msg;
				throw new Exception($msg, 1);
				return false;
			}
		}

		# TEST VALID PARENT
		if ( strpos($this->matrix_table, 'counter')===false && !strlen($this->parent) ) {
			# Si no está definido, lo intentamos cargar del matrix test
			if (isset($RecordObj_matrix_descriptors_test))	$this->parent	= $RecordObj_matrix_descriptors_test->get_parent();
			# Si no existe o no existe en matrix test, lanzamos una excepción
			if (strlen($this->parent)<1) {
				$msg = "Save matrix: valid 'parent' value is mandatory! (parent:$this->parent) No data is saved! ($this->tipo)";
				debug_log(__METHOD__.$msg);
				// $GLOBALS['log_messages'][] = $msg;
				throw new Exception($msg, 1);
				return false;
			}
		}

		# TEST VALID USER
		$userID	= logged_user_id(); // from session
		if (
			empty($userID)
			&& $this->matrix_table != 'matrix_activity' && $this->matrix_table != 'matrix_counter' && $this->matrix_table != 'matrix_stats'
			) {
			$msg = "Save matrix: valid 'userID' value is mandatory. No data is saved! ";
			#if(SHOW_DEBUG===true) {
				#dump($this," matrix_table: $this->matrix_table ");
			#}
			#error_log($msg);
			#$GLOBALS['log_messages'][] = $msg;
			throw new Exception($msg, 1);
			return false;
		}

		return true;
	}//end test_can_save



	/**
	* SAVE MATRIX
	* Call RecordDataBounceObject->Save() and RecordObj_time_machine->Save()
	* @return int|null $id
	*/
	public function Save() : ?int {
		$start_time=start_time();

		// test_can_save
			$test_can_save = $this->test_can_save();
			if($test_can_save!==true) {
				$msg = " Error (test_can_save). No matrix data is saved! ";
				// trigger_error($msg, E_USER_ERROR);
				// exit($msg);
				debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
				return null;
			}

		# Si el objeto a salvar no tiene id pero si tiene parent, tipo y lang, calculamos su id para evitar crear un registro nuevo de un componente que ya tiene dato
		# Esto pasa por jemplo con los checkboxes sin dato: si guardamos y no recargamos la página, se salva un registro por cada cambio pues no está definido el id_matrix en
		# el componente todavía.
		# NOTA:  Revisar el funcionamiento de este script al trabajar con lenguajes
			if (empty($this->ID) && !empty($this->parent) && !empty($this->tipo) && !empty($this->lang)) {
				$this->calculate_ID();

				// test_can_save run again, after calculate id
					$test_can_save = $this->test_can_save();
					if($test_can_save!==true) {
						$msg = " Error (test_can_save 2). No matrix data is saved! ";
						trigger_error($msg, E_USER_ERROR);
						exit($msg);
					}
			}

		# MATRIX SAVE (with parent RecordDataBoundObject)
		$id = parent::Save();


		# AUTOLOG STOP TIME MACHINE COPY SAVE
		# Prevent time machine saving activity (if current tipo is a component logger, stop save)
		if (in_array($this->tipo, logger_backend_activity::$ar_elements_activity_tipo)) {
			$this->save_time_machine_version = false;
			return (int)$id;
		}


		# TIME MACHINE COPY SAVE (Return assigned id on save)
		# Every record saved in matrix is saved as copy in 'matrix_time_machine' except logger and TM recover section
		if($this->save_time_machine_version===true)	{

			$this->time_machine_last_id = $this->save_time_machine();	// Está desactiva de momento
			if(SHOW_DEBUG===true) {
				#error_log("time_machine_last_id: ".$this->time_machine_last_id);
				#$total_time   = round(start_time()-$start_time,4);
				#error_log("Save $this->tipo : $total_time sec");
			}
		}

		return (int)$id;
	}//end Save



	/**
	* SAVE TIME MACHINE
	* @return int $id
	*/
	protected function save_time_machine() {

		if(true!==self::test_can_save()) {
			trigger_error(__METHOD__.' Error. No tm data is saved! (test_can_save returns false)');
			return false;
		}

		// dato. Get actual dato (!) Important: get dato before call RecordObj_time_machine
			$dato = $this->dato;

		// user_id
			$user_id = logged_user_id();

		// RecordObj_time_machine
			$RecordObj_time_machine = new RecordObj_time_machine();
				$RecordObj_time_machine->set_dato($dato, true); // Set dato RAW
				$RecordObj_time_machine->set_id_matrix($this->get_ID());
				$RecordObj_time_machine->set_parent($this->get_parent());
				$RecordObj_time_machine->set_tipo($this->get_tipo());
				$RecordObj_time_machine->set_lang($this->get_lang());
				$RecordObj_time_machine->set_userID($user_id);

		/*
		# dato EN PRUEBAS LA CODIFICACIÓN JSON... VERIFICAR CON VARIOS TIPOS DE CONTENIDO
		#$dato	= $this->get_dato();
		$dato	= stripslashes($this->dato);
		$dato_decoded = json_handler::decode($dato,true);
		# Case IS JSON encoded
		if($dato_decoded != NULL) $dato = $dato_decoded;

		#$dato	= gzcompress($dato, 9);	#die($dato_compressed);
		$RecordObj_time_machine->set_dato($dato);
		*/
			#dump($this,'$this->dato en save_time_machine');
			#dump($this->get_dato(true),'$this->get_dato(true)');
			#dump($RecordObj_time_machine->dato,'$RecordObj_time_machine->dato');
			#dump($RecordObj_time_machine->get_dato(true),'$RecordObj_time_machine->get_dato(true)');

		// Save obj
			$RecordObj_time_machine->Save();

		// id. Get auto assigned matrix id after save object
			$id = $RecordObj_time_machine->get_ID();


		return $id;
	}//end save_time_machine



}//end class RecordObj_matrix_descriptors
