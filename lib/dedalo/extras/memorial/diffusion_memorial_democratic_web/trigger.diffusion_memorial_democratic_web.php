<?php
require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config4.php');
$diffusion_class_name = 'diffusion_memorial_democratic_web';
require_once( 'class.'.$diffusion_class_name.'.php' );


# set vars
	$vars = array('mode','vfcode','formFields');
	foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");




#
# VOLCADO_DE_DATOS_A_WEB
/*
if ($mode=='volcado_de_datos_a_web__DES') {

	ob_implicit_flush(true);
	if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


	# Disable logging activity and time machine # !IMPORTANT
	logger_backend_activity::$enable_log = false;
	RecordObj_time_machine::$save_time_machine_version = false;


	# VFCODE : Código de verificación de seguridad. Por implementar
	$correct_vfcode = NULL;
	if($vfcode!=$correct_vfcode) {
		if(SHOW_DEBUG) throw new Exception("Error Processing Request. bad vfcode", 1);
		die();
	}

	$diffusion_class = new $diffusion_class_name();

	# AR_DIFFUSION_MAP
	$ar_diffusion_map = $diffusion_class->get_ar_diffusion_map();
		#dump($ar_diffusion_map,'$ar_diffusion_map');

	#
	# AR_DATABASE
	$ar_database 	= (array)$diffusion_class_name::$ar_database;	
	$database_name 	= reset($ar_database);
		#dump($ar_database,'$ar_database');die();


	
	#
	# TABLES : Crea las tablas necesarias para la estructura en la base de datos (memorial_web)
	# Aunque sólo hay una base de datos, lo trabajamos como array para preparar el posible multi...
	foreach ($ar_database as $database_tipo => $database_name) {

		# Trigger resolution plain db_schema tables (lanzar sólo una vez por database)
		$diffusion_class->get_db_schema($database_tipo);

		# Cogemos el schema de esta database tipo
		$db_schema = (array)$diffusion_class_name::$ar_table[$database_tipo];
			#dump($db_schema,'$db_schema');die();
			#ksort($diffusion_class_name::$ar_table);
			#dump($db_schema,'$diffusion_class_name::$ar_table');
			#die();

		# Recorremos el ar schema desglosando tabla por tabla
		foreach ($db_schema as $ar_value) {			
			# Build sql query for create table
			diffusion_mysql::create_table($ar_value);		
		}# foreach ($db_schema as $current_table_tipo => $ar_value)

	}#end foreach ($ar_database as $database_tipo => $database_name)	


	
	#
	# INSERT : Introduce los datos de los campos 
	# Recorre tabla por tabla y crea / ejecuta el código sql para introducir los datos en la base de datos
	# Aunque sólo hay una base de datos, lo trabajamos como array para preparar el posible multi...
	foreach ($ar_database as $database_tipo => $database_name) {
		#dump($database_tipo,'database_tipo: '.$database_tipo);die();

		# Trigger resolution plain db_schema tables (lanzar sólo una vez por database)
		$diffusion_class->get_db_data($database_tipo);
			#dump(diffusion_class::$ar_table_data,'$ar_table_data database_tipo:'.$database_tipo);die();			

		# SORT ARRAY (By custom core function build_sorter)
		#usort($db_data, build_sorter('table_name'));

		$db_data = (array)$diffusion_class_name::$ar_table_data[$database_tipo];
			#dump($db_data,'$db_data para database_tipo:'.$database_tipo);		

		foreach ($db_data as $ar_value) {			
			diffusion_mysql::insert_data($ar_value, $database_name);			
		}
		
	}#end foreach ($ar_database as $database_name)

	
	echo "<br>Export completed";
	
	printf (" in %s seconds<br>", round( microtime(TRUE) - $_SERVER['REQUEST_TIME_FLOAT'] ,4) );
	

	# Disable logging activity and time machine # !IMPORTANT
	logger_backend_activity::$enable_log = true;
	RecordObj_time_machine::$save_time_machine_version = true;

	exit();
	
}#end if ($mode=='volcado_de_datos_a_web') 
*/



#
# ENVIO DE FORMULARIOS DESDE LA WEB DEL MEMORIAL
# Al enviar un formulario, se envía un correo al responsable, otro al administrador y se guarda un
# registro en D4 para almacenar el histórico de peticiones
# La llamada se realiza mediante http (file_get_contents()) y no es necesario estar registrado en d4
# NOTA: Los componentes deben ser 'NO TRADUCIBLE'
if ($mode=='send_form') {

	if (empty($formFields) || empty($formFields['tipo'])) {
		exit("No data is received");
	}
	switch ($formFields['tipo']) {
		# ID matrix delos registros listas de valores privada
		case 'peticion_de_entrevista': 	$field_tipo_dato = 147; break;
		case 'donacion_de_entrevista': 	$field_tipo_dato = 148; break;
		case 'peticion_de_copia': 		$field_tipo_dato = 149; break;
	}
	if(empty($field_tipo_dato)) exit("No valid data for field tipo is received : ".$formFields['tipo']);


	# 
	# TEMP LOGIN AS ADMIN
	$_SESSION['dedalo4']['auth']['user_id']			= 1;
	$_SESSION['dedalo4']['auth']['username']		= 'admin';
	$_SESSION['dedalo4']['auth']['is_logged']		= 1;
	$_SESSION['dedalo4']['auth']['salt_secure']		= dedalo_encrypt_openssl(DEDALO_SALT_STRING);



	# Set fixed userid forms : 2
	#$_SESSION['dedalo4']['auth']['user_id']	= 2;
	#echo 'userID2:'.$_SESSION['dedalo4']['auth']['user_id'];	#die();
	$_SESSION['dedalo4']['config']['top_tipo'] = 'mdcat181';

		#dump($formFields,"formFields");

	# SECTION
	$section_tipo = 'mdcat181'; # Peticiones
	$section 	= section::get_instance(null, $section_tipo, 'edit');	#$id=NULL, $tipo=false, $modo='edit'
	$section_id = $section->Save();

	# COMPONENTS
	$ar_components_tipo = array(
		'mdcat189', # nombre
		'mdcat190', # apellidos
		'mdcat191', # entidad
		'mdcat192', # email
		'mdcat193', # ip (recogido en el trigger de la web)
		'mdcat194', # telefono
		'mdcat195', # tipo (de solicitud)
		'mdcat197', # texto (descripción de la petición)
		'mdcat198', # tipo de uso,
		'mdcat184', # fecha de entrada		
		);
	# Verificamos si hay alguno traducible
	foreach ($ar_components_tipo as $current_tipo) {
		$RecordObj_dd 	= new RecordObj_dd($current_tipo);
		$traducible 	= $RecordObj_dd->get_traducible();
		if ($traducible!='no') exit("Error on store form data. Traducible components in forms are not alowed ($current_tipo). Please change component config to 'traducible=no' ");
	}
	


	# NOMBRE
	if(!empty($formFields['nombre'])) {
		$component_tipo = 'mdcat189'; # Nombre
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name($component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$component->set_dato($formFields['nombre']);
		$component->Save();
	}
	# APELLIDOS
	if(!empty($formFields['apellidos'])) {
		$component_tipo = 'mdcat190';
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name($component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$component->set_dato($formFields['apellidos']);
		$component->Save();
	}
	# ENTIDAD
	if(!empty($formFields['entidad'])) {
		$component_tipo = 'mdcat191';
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name($component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$component->set_dato($formFields['entidad']);
		$component->Save();
	}
	# EMAIL
	if(!empty($formFields['email'])) {
		$component_tipo = 'mdcat192';
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name($component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$component->set_dato($formFields['email']);
		$component->Save();
	}
	# IP
	if(!empty($formFields['ip'])) {
		$component_tipo = 'mdcat193';
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name($component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$component->set_dato($formFields['ip']); error_log("Saved ip: ".$formFields['ip']);
		$component->Save();
	}
	# TELEFONO
	if(!empty($formFields['telefono'])) {
		$component_tipo = 'mdcat194';
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name($component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$component->set_dato($formFields['telefono']);
		$component->Save();
	}
	# TIPO (DE SOLICITUD)
	if(!empty($formFields['tipo'])) {
		$component_tipo = 'mdcat195';
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name($component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		# tipo dato
		# Como tipo (tipo de solicitud) se corresponde a una lista de valores, haremos la conversión al valor antes de salvar el dato (al principio del script)		
		$component->set_dato($field_tipo_dato);
		$component->Save();
	}
	# TEXTO (DESCRIPCIÓN DE LA PETICIÓN)
	if(!empty($formFields['descripcion'])) {
		$component_tipo = 'mdcat197';
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name($component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$component->set_dato($formFields['descripcion']);
		$component->Save();
	}
	# TIPO DE USO
	if(!empty($formFields['uso'])) {
		$component_tipo = 'mdcat198';
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name($component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$component->set_dato($formFields['uso']);
		$component->Save();
	}
	# FECHA DE ENTRADA : Es automática (get_timestamp_now_for_db)
	$component_tipo = 'mdcat184';
	$component 		= new component_date($component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN);
	$fecha_entrada  = component_date::get_timestamp_now_for_db();
	$component->set_dato($fecha_entrada);
	$component->Save();
	

	print "ok";


	# UNLOG ADMIN USER
	unset($_SESSION['dedalo4']);

	exit();
}#end if ($mode=='send_form') 




?>