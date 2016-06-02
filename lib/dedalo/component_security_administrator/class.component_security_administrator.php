<?php

class component_security_administrator extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	# GET DATO : Format {"dd244":"2"}
	public function get_dato() {
		$dato = parent::get_dato();
		return (int)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		$dato = (int)$dato;
		switch (true) {
			case $dato>1 :
				$dato = 1;
				break;
			case $dato<0 :
				$dato = 0;
		}
		parent::set_dato( (int)$dato );
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
		$edited_user_id 	= $parent;															#dump($edited_user_id,'edited_user_id');
		$logged_user_id 	= navigator::get_user_id();											#dump($logged_user_id,'logged_user_id');
		$is_global_admin 	= component_security_administrator::is_global_admin($logged_user_id);#dump($is_global_admin,'is_global_admin');	

		if($is_global_admin!==true || $edited_user_id == $logged_user_id ) {
			debug_log(__METHOD__." UNSECURE SAVE TRY. Only a global admin can edit this dato.".to_string(), logger::ERROR);
			return false;
		}
		
		# reset session permisions table
		# unset($_SESSION['dedalo4']['auth']['permissions_table']);

		# From here, we saved as standard
		return parent::Save();
	}



	/**
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {		
		
		$dato = $this->get_dato();
		
		if((int)$dato===1) {
			$valor = label::get_label('si');
		}else{
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
		
		#static $ar_is_global_admin;
		#if (isset($ar_is_global_admin[$user_id])) {
		#	return $ar_is_global_admin[$user_id];
		#}

		$user_id = (int)$user_id;

		# Dedalo superuser case
		if ($user_id===DEDALO_SUPERUSER) return true;
	
		# Empty user_id
		if ($user_id<1) return false;		

		# If request user_id is the same as current logged user, return session value, without acces to component
		if ( isset($_SESSION['dedalo4']['auth']['user_id']) && $user_id==$_SESSION['dedalo4']['auth']['user_id'] ) {
			return (bool)$_SESSION['dedalo4']['auth']['is_global_admin'];
		}		

		# Resolve from component
		$component_security_administrator = component_common::get_instance('component_security_administrator',
																		   DEDALO_SECURITY_ADMINISTRATOR_TIPO,
																		   $user_id,
																		   'edit',
																		   DEDALO_DATA_NOLAN,
																		   DEDALO_SECTION_USERS_TIPO);
		$dato = $component_security_administrator->get_dato();

		if ((int)$dato===1) {
			$is_global_admin = true;
		}else{
			$is_global_admin = false;
		}

		#$ar_is_global_admin[$user_id] = $is_global_admin;

		return $is_global_admin;
	}

	


	
}
?>