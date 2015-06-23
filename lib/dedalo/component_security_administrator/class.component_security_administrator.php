<?php

class component_security_administrator extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	# GET DATO : Format {"dd244":"2"}
	public function get_dato() {
		$dato = parent::get_dato();
		return (array)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (object)$dato );
	}
	
	
	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		$parent = $this->parent;

		##
		# SECURITY VERIFICATION
		# Si el usuario actual NO es global_admin o está editándose a si mismo, 
		# paramos la secuencia
		#
		$edited_user_id_matrix 	= $parent;																	#dump($edited_user_id_matrix,'edited_user_id_matrix');
		$logged_user_id_matrix 	= navigator::get_user_id();											#dump($logged_user_id_matrix,'logged_user_id_matrix');
		$is_global_admin 		= component_security_administrator::is_global_admin($logged_user_id_matrix);#dump($is_global_admin,'is_global_admin');	

		if($is_global_admin!==true || $edited_user_id_matrix == $logged_user_id_matrix ) {
			throw new Exception("Error Processing Request. Security exception CCT1", 1); die();	
		}		

		#dump($this->get_dato());
		
		# reset session permisions table
		# unset($_SESSION['dedalo4']['auth']['permissions_table']);

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}

	/**
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {
		
		$tipo 	= $this->get_tipo();	
		$dato	= $this->get_dato();	#dump($dato[$tipo]); 
		
		if(!empty($dato[$tipo]) && $dato[$tipo]==2) {
			#$valor = 'yes';
			$valor = label::get_label('si');
		}else{
			#$valor = 'no';
			$valor = label::get_label('no');
		}
		return $valor;		
	}
	

	/**
	* TEST IF RECEIVED USER IS GLOBAL ADMIN
	* bool()
	* @param $user_id
	*	Usuario id matrix int . Puede ser el logeado o no, según convenga en cada caso
	*/
	public static function is_global_admin($user_id) {
		
		# STATIC CACHE
		static $ar_stat_data;		
		if(isset($ar_stat_data[$user_id])) {
			return $ar_stat_data[$user_id];
		}

		if(empty($user_id)) return false;

		# SUPERUSER (Temporal... revisar seguridad aquí) <------------------- revisar seguridad aquí
		if($user_id==DEDALO_SUPERUSER) {
			return true;
		}else{
			return false;
		}
		/*
		$users_matrix_table = 'matrix';

		# Busca el tipo de la sección 'Usuarios' (dd128)			
			$tipo_user	= DEDALO_SECTION_USERS_TIPO;

		# Buscamos en estructura su hijo de tipo component_security_administrator
			$tipo_component_security_administrator = DEDALO_SECURITY_ADMINISTRATOR_TIPO;	
		

		# Buscamos su registro en matrix
			$component_security_administrator = new component_security_administrator(DEDALO_SECURITY_ADMINISTRATOR_TIPO, $user_id,'edit',DEDALO_DATA_NOLAN);
			$dato = $component_security_administrator->get_dato();
				#dump($dato,"dato $tipo_component_security_administrato -  $user_id");die();

			if (empty($dato)) {
				return false;
			}else if (condition) {
				# code...
			}

			# SECTION : DIRECT SEARCH
			$arguments=array();
			$arguments["datos#>>'{section_tipo}'"]	= DEDALO_SECTION_USERS_TIPO;
			$arguments["id"]						= $user_id;	
			$matrix_table 							= common::get_matrix_table_from_tipo($tipo_component_security_administrator);		
			$JSON_RecordObj_matrix					= new JSON_RecordObj_matrix($matrix_table,NULL,DEDALO_SECTION_USERS_TIPO);
			$ar_result								= $JSON_RecordObj_matrix->search($arguments);
				dump($ar_result,"ar_result $tipo - $matrix_table",$arguments);die();

			$arguments=array();
			$arguments['parent']			= $user_id;
			$arguments['tipo']				= $tipo_component_security_administrator;
			$arguments['lang']				= DEDALO_DATA_NOLAN;
			$matrix_table 					= $users_matrix_table;
			$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
			$ar_records						= $RecordObj_matrix->search($arguments);

			# Search results verify. If not matrix record found, current user is not admin global
			if(empty($ar_records[0])) return false; # throw new Exception(__METHOD__ ." Error: Record for $user_id - $tipo_component_security_administrator not found in matrix!");

			# Search array to string conversion
			$id = $ar_records[0];

				#dump($tipo_component_security_administrator,'$tipo_component_security_administrator');

			$component_security_administrator_obj	= new component_security_administrator($tipo_component_security_administrator, NULL, 'edit', DEDALO_DATA_NOLAN);
			$dato 									= $component_security_administrator_obj->get_dato();

			$user_is_global_admin = false;			
			if( !empty($dato[$tipo_component_security_administrator]) && $dato[$tipo_component_security_administrator] == 2 ){
				$user_is_global_admin = true;
			}
			#dump( $user_is_global_admin,'user_is_global_admin',"Verifica si el usuario logeado es admin global bool(true/false)" );			
		
		# STORE CACHE DATA
		$ar_stat_data[$user_id] = $user_is_global_admin;

		return (bool)$user_is_global_admin;
		*/
	}



	/**
	* CURRENT EDITED USER ID MATRIX
	* Is $this->parent	*
	*/
	protected function get_edited_user_id_matrix() {
		$edited_user_id_matrix = $this->get_parent();		
		return $edited_user_id_matrix;
	}


	
}

?>