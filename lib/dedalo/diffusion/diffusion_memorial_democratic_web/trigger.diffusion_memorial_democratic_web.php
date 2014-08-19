<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

# Disable log temporarily
	logger_backend_activity::$disable_log = true;
	


# set vars
	$vars = array('mode','vfcode','formFields');
	foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


#
# VOLCADO_DE_DATOS_A_WEB
if ($mode=='volcado_de_datos_a_web') {

	ob_implicit_flush(true);
	if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


	# VFCODE : Código de verificación de seguridad. Por implementar
	$correct_vfcode = NULL;
	if($vfcode!=$correct_vfcode) {
		if(SHOW_DEBUG) throw new Exception("Error Processing Request. bad vfcode", 1);
		die();
	}

	$diffusion_memorial_democratic_web = new diffusion_memorial_democratic_web();

	# AR_DIFFUSION_MAP
	$ar_diffusion_map 		= $diffusion_memorial_democratic_web->get_ar_diffusion_map();
		#dump($ar_diffusion_map,'$ar_diffusion_map');

	# AR_DATABASE
	$ar_database 	= diffusion_memorial_democratic_web::$ar_database;	
	$database_name 	= reset($ar_database);
		#dump($ar_database,'$ar_database');die();


	/**/
	# TABLES : Crea las tablas necesarias para la estructura en la base de datos (memorial_web)
	# Aunque sólo hay una base de datos, lo trabajamos como array para preparar el posible multi...
	foreach ($ar_database as $database_tipo => $database_name) {

		# Trigger resolution plain db_schema tables (lanzar sólo una vez por database)
		$diffusion_memorial_democratic_web->get_db_schema($database_tipo);

		# Cogemos el schema de esta database tipo
		$db_schema = (array)diffusion_memorial_democratic_web::$ar_table[$database_tipo];
			#dump($db_schema,'$db_schema');die();
			#ksort(diffusion_memorial_democratic_web::$ar_table);
			#dump($db_schema,'diffusion_memorial_democratic_web::$ar_table');
			#die();

		# Recorremos el ar schema desglosando tabla por tabla
		foreach ($db_schema as $ar_value) { 
			#dump($ar_value,'$ar_section . '.$database_tipo);die();
			
			# Build sql query for create table
			$query_create_table 	= diffusion_sql::generate_query_create_table($ar_value);
				#dump($query_create_table,'$query_create_table ');
			
			# Exec sql sentence
			#$result = diffusion_sql::exec_sql_query($query_create_table);
				#dump($result,'$result');

			$result = DBi::_getConnection()->multi_query( $query_create_table );
			#$result = DBi::_getConnection()->query( $query_create_table );
				#dump(DBi::_getConnection(),'$result - '.$database_name.' '.print_r($result,true));
			$msg = "INFO: Created SQL table : ". $database_name.'.'.$ar_value['table_name'];
			if (SHOW_DEBUG) {
				echo $msg."<br>";
				#error_log($msg);
			}else{

			}			
			

			#printf("Conjunto de caracteres actual: %s\n", DBi::_getConnection()->character_set_name());
			if(DBi::_getConnection()->more_results())
			DBi::_getConnection()->next_result(); # desbloquea la conexión para la siguiente petición
		}# foreach ($db_schema as $current_table_tipo => $ar_value)

	}#end foreach ($ar_database as $database_tipo => $database_name)
	
	
	/**/
	# INSERT : Introduce los datos de los campos 
	# Recorre tabla por tabla y crea / ejecuta el código sql para introducir los datos en la base de datos
	# Aunque sólo hay una base de datos, lo trabajamos como array para preparar el posible multi...
	foreach ($ar_database as $database_tipo => $database_name) {
		#dump($database_tipo,'database_tipo: '.$database_tipo);die();

		# Trigger resolution plain db_schema tables (lanzar sólo una vez por database)
		$diffusion_memorial_democratic_web->get_db_data($database_tipo);
			#dump(diffusion_memorial_democratic_web::$ar_table_data,'$ar_table_data database_tipo:'.$database_tipo);
			#die();


		$db_data = (array)diffusion_memorial_democratic_web::$ar_table_data[$database_tipo];
			#dump($db_data,'$db_data para database_tipo:'.$database_tipo);
			#die();


		foreach ($db_data as $ar_value) {
			#echo "<hr>";
			#dump($ar_value,'$ar_value');die();
			$query_insert_data = diffusion_sql::generate_query_insert_data($ar_value, $database_name);
				#dump($query_insert_data,'$query_insert_data');die();
				#dump($ar_table_data,'ar_table_data');

			# Exec sql sentence
			#$result = diffusion_sql::exec_sql_query($query_insert_data);

			#error_log($query_insert_data);

			$result = DBi::_getConnection()->multi_query( $query_insert_data );
			#$result = DBi::_getConnection()->query( $query_insert_data );
				#dump(DBi::_getConnection(),'$result - '.$database.' '.print_r($result2,true));
			$msg = "INFO: Data inserted in SQL table : ". $database_name .'.'.$ar_value['table_name'];
			if (SHOW_DEBUG) {
				echo $msg."<br>";
				#error_log($msg );
			}else{
				
			}

			if(DBi::_getConnection()->more_results())
			DBi::_getConnection()->next_result(); # desbloquea la conexión para la siguiente petición
		}
		
	}#end foreach ($ar_database as $database_name)
	

	
	echo "<br>Export completed";
	

	/* old
	# INSERT : Introduce los datos de los campos 
	# Recorre tabla por tabla y crea / ejecuta el código sql para introducir los datos en la base de datos
	# Aunque sólo hay una base de datos, lo trabajamos como array para preparar el posible multi...
	foreach ($ar_database as $key => $value) {

		$db_data = $diffusion_memorial_democratic_web->get_db_data($key);
			#dump($db_data,'$db_data');
		
		foreach ($db_data as $key => $db_data) {
			#echo "<hr>";
			#dump($db_data,'$db_data');die();
			$query_insert_data = diffusion_sql::generate_query_insert_data($db_data, $database_name);

			# Exec sql sentence
			#$result = diffusion_sql::exec_sql_query($query_insert_data);

			$result = DBi::_getConnection()->multi_query( $query_insert_data );
			#$result = DBi::_getConnection()->query( $query_insert_data );
				#dump(DBi::_getConnection(),'$result - '.$database.' '.print_r($result2,true));
			$msg = "INFO: Data inserted in SQL table : ". $database_name .'.'.reset($db_data)['table_name'];
			echo $msg."<br>";
			#error_log($msg );

			DBi::_getConnection()->next_result(); # desbloquea la conexión para la siguiente petición
		}
		
	}#end foreach ($ar_database as $key => $value)
	*/


	die();
	
}#end if ($mode=='volcado_de_datos_a_web') 


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
		case 'peticion_de_entrevista': 	$field_tipo_dato = 365; break;
		case 'donacion_de_entrevista': 	$field_tipo_dato = 370; break;
		case 'peticion_de_copia': 		$field_tipo_dato = 370; break;
	}
	if(empty($field_tipo_dato)) exit("No valid data for field tipo is received : ".$formFields['tipo']);

	# Set fixed userid forms : 4831
	$_SESSION['auth4']['userID_matrix']	= 4831;
	#echo 'userID2:'.$_SESSION['auth4']['userID_matrix'];	#die();
	$_SESSION['config4']['top_tipo'] = 'dd316';

		dump($formFields,"formFields");

	# SECTION
	$section_tipo = 'dd316'; # Peticiones
	$section 	= new section(null, $section_tipo, 'edit');	#$id=NULL, $tipo=false, $modo='edit'
	$section_id = $section->Save();

	# COMPONENTS
	$ar_components_tipo = array(
		'dd1284', # nombre
		'dd1285', # apellidos
		'dd1286', # entidad
		'dd1287', # email
		'dd1594', # ip (recogido en el trigger de la web)
		'dd1288', # telefono
		'dd1289', # tipo (de solicitud)
		'dd1291', # texto (descripción de la petición)
		'dd1292', # tipo de uso,
		'dd1293', # fecha de entrada		
		);
	# Verificamos si hay alguno traducible
	foreach ($ar_components_tipo as $current_tipo) {
		$RecordObj_ts 	= new RecordObj_ts($current_tipo);
		$traducible 	= $RecordObj_ts->get_traducible();
		if ($traducible!='no') exit("Error on store form data. Traducible components in forms are not alowed ($current_tipo). Please change component config to 'traducible=no' ");
	}
	


	# NOMBRE
	if(!empty($formFields['nombre'])) {
		$component_tipo = 'dd1284'; # Nombre
		$modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name(null, $component_tipo, 'edit', $section_id, DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$component->set_dato($formFields['nombre']);
		$component->Save();
	}
	# APELLIDOS
	if(!empty($formFields['apellidos'])) {
		$component_tipo = 'dd1285';
		$modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name(null, $component_tipo, 'edit', $section_id, DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$component->set_dato($formFields['apellidos']);
		$component->Save();
	}
	# ENTIDAD
	if(!empty($formFields['entidad'])) {
		$component_tipo = 'dd1286';
		$modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name(null, $component_tipo, 'edit', $section_id, DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$component->set_dato($formFields['entidad']);
		$component->Save();
	}
	# EMAIL
	if(!empty($formFields['email'])) {
		$component_tipo = 'dd1287';
		$modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name(null, $component_tipo, 'edit', $section_id, DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$component->set_dato($formFields['email']);
		$component->Save();
	}
	# IP
	if(!empty($formFields['ip'])) {
		$component_tipo = 'dd1594';
		$modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name(null, $component_tipo, 'edit', $section_id, DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$component->set_dato($formFields['ip']); error_log("Saved ip: ".$formFields['ip']);
		$component->Save();
	}
	# TELEFONO
	if(!empty($formFields['telefono'])) {
		$component_tipo = 'dd1288';
		$modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name(null, $component_tipo, 'edit', $section_id, DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$component->set_dato($formFields['telefono']);
		$component->Save();
	}
	# TIPO (DE SOLICITUD)
	if(!empty($formFields['tipo'])) {
		$component_tipo = 'dd1289';
		$modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name(null, $component_tipo, 'edit', $section_id, DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		# tipo dato
		# Como tipo (tipo de solicitud) se corresponde a una lista de valores, haremos la conversión al valor antes de salvar el dato (al principio del script)		
		$component->set_dato($field_tipo_dato);
		$component->Save();
	}
	# TEXTO (DESCRIPCIÓN DE LA PETICIÓN)
	if(!empty($formFields['descripcion'])) {
		$component_tipo = 'dd1291';
		$modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name(null, $component_tipo, 'edit', $section_id, DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$component->set_dato($formFields['descripcion']);
		$component->Save();
	}
	# TIPO DE USO
	if(!empty($formFields['uso'])) {
		$component_tipo = 'dd1292';
		$modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
		$component 		= new $modelo_name(null, $component_tipo, 'edit', $section_id, DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		$component->set_dato($formFields['uso']);
		$component->Save();
	}
	# FECHA DE ENTRADA : Es automática (get_timestamp_now_for_db)
	$component_tipo = 'dd1293';
	$component 		= new component_date(null, $component_tipo, 'edit', $section_id, DEDALO_DATA_NOLAN);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
	$fecha_entrada  = component_date::get_timestamp_now_for_db();
	$component->set_dato($fecha_entrada);
	$component->Save();
	

	print "ok";
	exit();
	#dump($_REQUEST,"_REQUEST (D4 trigger)");
	#echo "Hello world";
}#end if ($mode=='send_form') 

?>