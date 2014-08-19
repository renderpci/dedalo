<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','id','dato','tipo');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}
	
# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


# NEW	
if ($mode=='New') {
	
	$section = new section( NULL, $tipo );
	$id 	 = $section->Save();
	
	# RETURN CREATED RECORD IN MATRIX
	print $id;
	die();
}



		
	/**
	* @see OJO! Cuando estén mas acabadas las relaciones, relacionar aquí este nuevo usuario con el usuario sque lo creó
	*	y usar ese vínculo para luego filtrar los registros en listados y demás.
	*	Así un nuevo usuario no se perderá apra su administrador en caso de no tener asignada area en su ficha como pasa ahora
	*	Esto pasa poruq elos usuarios se filtran por áreas. Lo de abajo era un intento de clonar las áreas del administrador al nuevo
	*	usuario pero es bastante inconsistente en algunos casos. Recuerda: Hacerlo por relaciones nuevo usuario <-> admin que lo crea
	*/
	/**
	* @see Desestimar este código cuando esté lo de las relaciones del punto anterior
	*/
	/*
	# POR DEFECTO Y PARA QUE NO PIERDA POR ERROR UN NUEVO USUARIO QUE NO TIENE ASIGNADA NINGÚN AREA,
	# AL IGUAL QUE HACEMOS CON PROYECTOS, AQUÍ FILTRAMOS POR ÁREAS Y LE ASIGNAMOS LA PRIMERA AREA DEL ADMIN			

	# Buscamos en estructura el tipo de modelo_name = 'component_security_areas' hijo de tipo user
	$tipo_user 		= $tipo;
	$RecordObj_ts 	= new RecordObj_ts($tipo_user);
	$tipo_component_security_areas = $RecordObj_ts->get_ar_terminoID_by_modelo_name_and_relation($tipo_user, $modelo_name='component_security_areas', $relation_type='children_recursive');
		#dump($tipo_component_security_areas,'tipo_component_security_areas',"tipo de 'Usuarios->Acceso a áreas' modelo component_security_areas usualmente dd240");
	
	# Buscamos registros de este usuario (parent='userID_matrix') con el tipo hayado ('tipo_component_security_areas')
	# Eso no da el registro de matrix donde hayar los datos de las areas del usuario actual
	$userID_matrix = navigator::get_userID_matrix();	

	$arguments=array();
	$arguments['parent']			= $userID_matrix;
	$arguments['tipo']				= $tipo_component_security_areas[0];
	$matrix_table 					= common::get_matrix_table_from_tipo($tipo_component_security_areas[0]);
	$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
	$ar_records						= $RecordObj_matrix->search($arguments);

	if(!empty($ar_records[0])) {
		
		$matrix_table 		= common::get_matrix_table_from_tipo($tipo_component_security_areas[0]);
		$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$ar_records[0]);
		$dato_areas 		= $RecordObj_matrix->get_dato();

		if(!empty($dato_areas)) {

			# Seleccionamos la primera area de este usuario y la asignamos al nuevo usuario por defecto
			#$first_area = array_slice($dato_areas, 0, 1);

			$matrix_table 		= common::get_matrix_table_from_tipo($tipo_component_security_areas[0]);
			$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL);
			$RecordObj_matrix->set_parent($id);
			$RecordObj_matrix->set_tipo($tipo_component_security_areas[0]);	
			$RecordObj_matrix->set_lang(DEDALO_DATA_LANG);
			$RecordObj_matrix->set_dato($dato_areas);

			$saved_area 		= $RecordObj_matrix->Save();
		}				
	}
	*/
	

	








	
	
		
?>