<?php

class component_security_administrator extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	
	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set allways lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		$parent = $this->parent;

		##
		# SECURITY VERIFICATION
		# Si el usuario actual NO es global_admin o está editándose a si mismo, 
		# paramos la secuencia
		#
		$edited_user_id_matrix 	= $parent;																	#dump($edited_user_id_matrix,'edited_user_id_matrix');
		$logged_user_id_matrix 	= navigator::get_userID_matrix();											#dump($logged_user_id_matrix,'logged_user_id_matrix');
		$is_global_admin 		= component_security_administrator::is_global_admin($logged_user_id_matrix);#dump($is_global_admin,'is_global_admin');	

		if($is_global_admin!==true || $edited_user_id_matrix == $logged_user_id_matrix ) {
			throw new Exception("Error Processing Request. Security exception CCT1", 1); die();	
		}		

		#dump($this->get_dato());
		
		# reset session permisions table
		unset($_SESSION['auth4']['permissions_table']);

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
	* @param $userID_matrix
	*	Usuario id matrix int . Puede ser el logeado o no, según convenga en cada caso
	*/
	public static function is_global_admin($userID_matrix) {
		
		# STATIC CACHE
		static $ar_stat_data;		
		if(isset($ar_stat_data[$userID_matrix])) {
			return $ar_stat_data[$userID_matrix];
		}

		if(empty($userID_matrix)) return false;

		# SUPERUSER (Temporal... revisar seguridad aquí) <------------------- revisar seguridad aquí
		if($userID_matrix==DEDALO_SUPERUSER) return true;

		$users_matrix_table = 'matrix';

		# Busca el tipo de la sección 'Usuarios' (dd128)
			# Tenemos el id matrix del usuario pasado que es su matrix id section. A partir de el, buscamos el registro en matrix y 
			# despejamos su section tipo
			$matrix_table 			= $users_matrix_table;
			$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$userID_matrix);
			$tipo_user 				= $RecordObj_matrix->get_tipo();	#dump($RecordObj_matrix,'$RecordObj_matrix');	

			# Search tipo_user verify
			if(empty($tipo_user)) throw new Exception(__METHOD__ ." Error: tipo not found in matrix for id:$userID_matrix !");

		# Buscamos en estructura su hijo de tipo component_security_administrator
			$RecordObj_ts = new RecordObj_ts($tipo_user);
			$tipo_component_security_administrator = $RecordObj_ts->get_ar_terminoID_by_modelo_name_and_relation($tipo_user, $modelo_name='component_security_administrator', $relation_type='children_recursive');
				#dump($tipo_component_security_administrator,'tipo_component_security_administrator','actualmente dd244');

			# Search results verify If not matrix record found, current user is not admin global
			if(empty($tipo_component_security_administrator[0])) return false; #throw new Exception(__METHOD__ ." Error: Record $modelo_name not found in matrix! (tipo:$tipo_user)");
			# Search array to string conversion
			$tipo_component_security_administrator = $tipo_component_security_administrator[0];	
		

		# Buscamos su registro en matrix
			$arguments=array();
			$arguments['parent']			= $userID_matrix;
			$arguments['tipo']				= $tipo_component_security_administrator;
			$arguments['lang']				= DEDALO_DATA_NOLAN;
			$matrix_table 					= $users_matrix_table;
			$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
			$ar_records						= $RecordObj_matrix->search($arguments);

			# Search results verify. If not matrix record found, current user is not admin global
			if(empty($ar_records[0])) return false; # throw new Exception(__METHOD__ ." Error: Record for $userID_matrix - $tipo_component_security_administrator not found in matrix!");

			# Search array to string conversion
			$id = $ar_records[0];

				#dump($tipo_component_security_administrator,'$tipo_component_security_administrator');

			$component_security_administrator_obj	= new component_security_administrator($id, $tipo_component_security_administrator, 'edit',NULL,DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
			$dato 									= $component_security_administrator_obj->get_dato();

			$user_is_global_admin = false;			
			if( !empty($dato[$tipo_component_security_administrator]) && $dato[$tipo_component_security_administrator] == 2 ){
				$user_is_global_admin = true;
			}
			#dump( $user_is_global_admin,'user_is_global_admin',"Verifica si el usuario logeado es admin global bool(true/false)" );			
		
		# STORE CACHE DATA
		$ar_stat_data[$userID_matrix] = $user_is_global_admin;

		return (bool)$user_is_global_admin;
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