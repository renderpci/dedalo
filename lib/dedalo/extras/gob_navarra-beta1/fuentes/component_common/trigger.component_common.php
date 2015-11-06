<?php
require_once( dirname(dirname(__FILE__)).'/config/config4.php');

require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_matrix.php');
require_once(DEDALO_LIB_BASE_PATH . '/common/class.TR.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

	#dump($_REQUEST);

# set vars
	$vars = array('mode','id','id_matrix','parent','dato','tipo','lang','flag','modo','current_tipo_section','caller_tipo','tag','rel_locator','context');	
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);		
	}

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* SAVE 
*/
if($mode=='Save') {

	# DATA VERIFY
	if(!$id && empty($dato)) exit("Trigger Error: Nothing to save.. (id:$id, dato:$dato)");
	if( $id<1 && (!strlen($parent) || empty($tipo) || empty($lang)) ) die("Trigger Need more data! id:$id, parent:$parent, tipo:$tipo, lang:$lang");

	if(empty($tipo) || strlen($tipo)<3) exit("Trigger Error: tipo is mandatory (id:$id, dato:$dato, tipo:$dato)");

		#dump($dato, "SAVE VARS: id:$id, tipo:$tipo, modo:$modo, parent:$parent, flag:$flag, caller_tipo:$caller_tipo"); exit();
	
	# CALLER_TIPO override tipo
	# En casos como 'component_security_access' el valor recibido es el estado de un checkbox (por ejemplo [0]=>2) y el tipo es el del componente 
	# al que hace referencia (como haría cualquier checkbox). Pero el valor ha de guardarse en un componente de tipo distinto (caller_tipo) por lo
	# preparamos el dato para unificar el comportamiento de trigger:Save
	# dump($dato,'dato - $caller_tipo: '.$caller_tipo);
	if (!empty($caller_tipo)) {

		# Formateamos el dato para procesarlo luego dentro del componente y no interferir
		
		# CASO DATO ES ARRAY (CHECKBOXES...)
		if (is_array($dato) && isset($dato[0])) {
			$ar_dato[$tipo]	= intval($dato[0]);
			# Overwrite dato (from something like array([0]=>2) to array(dd285=>2))
			$dato = $ar_dato;
		
		# CASO DATO ES VALOR (RADIO BUTTONS..)
		# A tener en cuenta que '0' es un valor utilizado en casos como 'component_security_access'
		}else{
			$ar_dato[$tipo]	= intval($dato);
			# Overwrite dato (from something like 0 to array(dd285=>0))
			$dato = $ar_dato;
		}


		# Cambiamos el tipo (ya no lo necesitamos pues lo hemos añadido al dato), por el caller_tipo
		# que es el tipo del componente real que guarda la información
		$tipo = $caller_tipo;							
	}#end if (!empty($caller_tipo)) {


	# Verificamos que no hay inconsistencia	entre el tipo recibido y el que hay en matrix	
	if (!empty($id) && !empty($tipo)) {
		$matrix_table 	= common::get_matrix_table_from_tipo($tipo);
		$tipo_test		= common::get_tipo_by_id($id, $matrix_table);
		if($tipo_test != $tipo)
			throw new Exception("Trigger Error: An inconsistency was found in 'tipo' tipo_test:$tipo_test - tipo:$tipo", 1);				
	}
	
	# ELIMINADO : Se elimina este tets ya que comporta usar siempre la tabla matrix 
	/*
	# Si no se ha pasado tipo pero si 'id', lo calcularemos dentro de lo posible (usando la tabla por defecto) y notificando el hecho
	if (empty($tipo) && !empty($id)) {
		trigger_error("Calculated tipo on save with default table. Please prevent table errors passing tipo to this method (trigger.save)");
		$tipo = common::get_tipo_by_id($id, $table='matrix');
	}
	*/

    #Inicio - DCA 2015/03/13
    #Compruebo que el valor introducido en Registro no esté duplicado
    if( $tipo == 'dd376' && !empty($id) ){
        $host=DEDALO_HOSTNAME_CONN;
        $user=DEDALO_USERNAME_CONN;
        $password=DEDALO_PASSWORD_CONN;
        $database=DEDALO_DATABASE_CONN;
        try
        {
            $mysqli = new mysqli($host, $user, $password, $database);
            if ($mysqli->connect_errno) {
                throw new Exception("Falló la conexión a MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error);
            }
            $datoformat = '"' . $dato . '"';
            $select = $mysqli->query("SELECT IFNULL(COUNT(*),0) as result FROM `matrix` WHERE `id`<>" . $id . " AND `tipo`='dd376' AND `dato` = '" . $datoformat . "' ");
            $fechresult = $select->fetch_assoc();
            $resultcount = $fechresult["result"];
            if ( $resultcount > 0 ){
                throw new Exception("Ya existe una ficha con el Registro Indicado",1);
            };

        } catch (Exception $e) {
            throw new Exception($e->getMessage(),1);
        } finally {
            if ($mysqli != NULL) {
                mysqli_close($mysqli);
            }
        };
    };
    #Fin - DCA 2015/03/13
	
	$component_name = RecordObj_ts::get_modelo_name_by_tipo($tipo);

	# CALLABLE : Verify component name is callable
	if (!class_exists($component_name))
		throw new Exception("Trigger Error: class: $component_name not found", 1);

	
	# COMPONENT : Build component as construct ($id=NULL, $tipo=false, $modo='edit', $parent=NULL)	
	if (!empty($id)) {
		$component_obj = new $component_name($id, $tipo);
	}else{
		$component_obj = new $component_name(NULL, $tipo, $modo, $parent, $lang);
	}
	# Force to load matrix data
	#$component_obj->get_dato();

	#dump($component_obj,'$component_obj que llega al trigger'); die();

	#dump($dato,'dato');
	# Force json encode to null dato [IMPORTANT]
	if (empty($dato)) {
		#$dato = json_handler::encode(NULL);
		$dato = '';
	}

	# Assign dato
	$component_obj->set_dato($dato);
		#dump($component_obj,'$component_obj');	#die();	


	
	# Llama a la función específica del componente actual que se encarga de salvar los datos
	# con su preprocesado específico de idioma, etc..
	$id = $component_obj->Save();


	# Return id
	print $id;
	exit();

}#end Save




# SAVE_RELATED
if($mode=='Save_related') {

	# DATA VERIFY
	if(!$id && empty($dato)) exit("Error: Trigger Nothing to save.. (id:$id, dato:$dato)");
	if( empty($tipo) ) die("Error: Trigger Need more data! tipo:$tipo");

	#
	# DUPLICATES
	#	
		$dato_already_exists = component_common::dato_already_exists($dato, $tipo);
		if ($dato_already_exists) {
			die("");
			throw new Exception("Error Processing Request. Current dato already exists ($dato)", 1);
			die("Warning: Current dato already exists ($dato)");
		}
		

	#
	# SECTION : Create a new section before
	#
		# Calculate section tipo from component tipo
		$section_tipo = component_common::get_section_tipo_from_component_tipo($tipo);
			#dump($section_tipo,'$section_tipo'); die();

		$section 	= new section(NULL, $section_tipo);
		$id_section = $section->Save();
			#dump($id_section,'$id_section');


	#
	# COMPONENT
	#
		# Create new component record dependent of current new section
		$component_name = RecordObj_ts::get_modelo_name_by_tipo($tipo);

		# Verify component name is callable
		if (!class_exists($component_name))
			throw new Exception("Error: Trigger class: $component_name not found", 1);
		
		# Build component as construct ($id=NULL, $tipo=false, $modo='edit', $parent=NULL)		
		$component_obj = new $component_name(NULL, $tipo, 'edit', $id_section, DEDALO_DATA_LANG);
		
		# Assign dato
		$component_obj->set_dato($dato);
			#dump($component_obj);	die();
		
		# Llama a la función específica del componente actual que se encarga de salvar los datos
		# con su preprocesado específico de idioma, etc..
		$id = $component_obj->Save();


	# Return $id_section
	print $id_section;
	exit();

}#end Save_related





# UPDATE INSPECTOR INFO
if($mode=='update_inspector_info') {
	
	if(empty($tipo)) {
		echo "Info not available ";
		echo '<br>';
		exit();
	}

	if (empty($parent)) {		
		exit("Parent not defined!");
	}

	if (empty($id)) {
		$id = NULL;
	}

	if (empty($lang)) {
		$lang = NULL;
	}
	
	$modo = 'edit';
	
	$component		= component_common::load_component($id, $tipo, $modo, $parent, $lang);	
		#dump($lang,'lang pasado al trigger');
	
	$label				= $component->get_label();
	$mod_date			= $component->get_mod_date();
	$mod_by_user_name	= $component->get_mod_by_user_name();	#dump($RecordObj_matrix);

	#dump($component,'component');
	
	echo "<div class=\"key capitalize\">".label::get_label("seleccionado")."</div><div class=\"value\"><b style=\"color:#333\">$label</b> <span class=\"debug_info\">($lang)</span></div><br>";	
	echo "<div class=\"key capitalize\">".label::get_label("modificado")."</div><div class=\"value\">$mod_date</div><br>";	
	echo "<div class=\"key\">".label::get_label("por_usuario")."</div><div class=\"value\">$mod_by_user_name</div><br>";
	
	if(SHOW_DEBUG) {
		$propipedades = $component->get_propiedades();
		if(!empty($propipedades)) {
			echo "<div class=\"key\">Propipedades</div><div class=\"value\">".to_string($propipedades)."</div><br>";
		}		
	}
	exit();
}


# LOAD INSPECTOR TOOLS
if($mode=='load_inspector_tools') {
	
	if(!$tipo) {
		echo "Info not available /n";
		exit();
	}

	if (empty($id)) {
		$id = NULL;
	}

	$modo = 'edit';
	
	$component		= component_common::load_component($id, $tipo, $modo, $parent, $lang);

	# Configure component
	# In case relation, set current_tipo_section as received value
	if (!empty($current_tipo_section)) {
		$component->set_current_tipo_section($current_tipo_section);
	}

	# GET ARRAY OF CURRENT COMPONENT TOOLS AS TOOL_OBJECTS
	$ar_tools_obj	= $component->get_ar_tools_obj();
	
	#echo "load_inspector_tools: <br>";
	#dump(get_class($ar_tools_obj));
	#dump($component,'$component');
	
	$html_tools = NULL;
	if(is_array($ar_tools_obj))	foreach($ar_tools_obj as $tool_obj) {
		#$tool_obj->set_modo('button');
		$html_tools .= $tool_obj->get_html();
	}
	
	print $html_tools;		
	exit();
}


/**
* DELETE_TAG
*
*/
if($mode=='delete_tag') {
	
	if(empty($tag)) {
		trigger_error("Empty tag");
		exit();
	}
	if(empty($rel_locator)) {
		trigger_error("Empty rel_locator");
		exit();
	}
	if(empty($id_matrix)) {
		trigger_error("Empty id_matrix");
		exit();
	}
	if(empty($tipo)) {
		trigger_error("Empty tipo");
		exit();
	}

	$component_text_area	= new component_text_area($id_matrix,$tipo);		#($id, $tipo, $modo, $parent, $lang);	
	$parent 				= $component_text_area->get_parent();

	# DELETE ALL MATRIX RELATIONS
	$delete_rel_locator_from_all_relations 	= component_relation::delete_rel_locator_from_all_relations($rel_locator, $tipo);
		#dump($component_text_area,"component_text_area - rel_locator:$rel_locator"); exit();
			
	# DELETE ALL INDEXES	
	$remove_rel_locator_in_all_indexes 		= RecordObj_descriptors::delete_rel_locator_from_all_indexes($rel_locator, $tipo);

	# DELETE TAG IN ALL LANGS
	$component_text_area->delete_tag_from_all_langs($tag, $tipo);

	print 'ok';
	exit();
}


/*
# LOAD RELATIONS LIST
if($mode=='ajax_load_relations_list') {
	
	if(!$id_matrix) {
		echo "Info not available /n";
		exit();
	}

	$component			= component_common::load_component($id_matrix, $tipo);
	$ar_relation_tags	= $component->get_ar_relation_tags();
	
	$html = dump($ar_relation_tags,'$ar_relation_tags');

	exit();
}
*/







# INDEX TERMINO
/*
	DEFINDA EN TRIGGER.COMPONENT RELATION
if($mode=='index_termino') {

	# set vars
	$arguments = array();
	$vars = array('terminoID','section_id','component_tipo','tag_id');	
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
		$arguments[] = $$name;
	}

	component_text_area::process_index_termino($arguments);
	exit();
}
*/

# NEW
/*
if($mode=='New') {
	
	require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_matrix.php');
	
	if(!$tipo && empty($tipo)) exit("<span class='error'> Trigger: Error Need tipo..</span>");
	
	$html 	= '';	
	$parent	= "0";
	
	# buscamos el último registro de esta sección y sacamos su dato, que será el último 'seccion_id'
	$matrix_table 			= common::get_matrix_table_from_tipo($tipo);
	$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
	$arguments=array();		
	$arguments['tipo']		= $tipo;
	$arguments['parent']	= $parent;
	$ar_result				= $RecordObj_matrix->search($arguments);	#var_dump($ar_result);
	if(is_array($ar_result) && count($ar_result)>0) {
		
		$id_matrix			= max($ar_result);	# selecciona el valor mayor en el array 
		$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
		$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$id_matrix);
		$dato				= $RecordObj_matrix->get_dato();
	}	
	
	//print_r( $dato );		//die();
	
	$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
	$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL);
	
	$RecordObj_matrix->set_dato(intval($dato+1));	
	$RecordObj_matrix->set_parent($parent);
	$RecordObj_matrix->set_tipo($tipo);
	$RecordObj_matrix->set_lang(DEDALO_DATA_LANG);		
		
	
	$saved 	= $RecordObj_matrix->Save();			
	$id 	= $RecordObj_matrix->get_ID();			#var_dump($RecordObj_matrix);	echo "\n ++++  saved: $saved , get_ID(): $id  ++++ \n";
	
	
	
	
	exit($id);
}
*/



/**
* LOAD COMPONENT BY AJAX
* load ajax html component
* Cargador genérico de componentes. Devuelve el html costruido del componente resuelto y en el modo recibido.
*/
if ($mode=='load_component_by_ajax') {

	if (empty($id)) {		
	
		if(empty($tipo)) {
			$msg = "Error Processing Request. tipo is not defined!";
			error_log($msg);
			throw new Exception($msg, 1);	
		}
			
		if(empty($parent)) {
			$msg = "Error Processing Request. parent is not defined!";
			error_log($msg);
			throw new Exception($msg, 1);
		} 
			
		if(empty($modo)) {
			$msg = "Error Processing Request. modo is not defined!";
			error_log($msg);
			throw new Exception($msg, 1);
		}
				
	}
	#$component_obj = component_common::load_component($id, $tipo, $modo, $parent);	#__construct($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=false)
		#dump($component_obj,'$component_obj');

	$modelo_name = RecordObj_ts::get_modelo_name_by_tipo($tipo);
	$component_obj = new $modelo_name($id,$tipo,$modo,$parent);	#$id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) 

	# CURRENT TIPO SECTION
	# Si se recibe section_tipo, configuramos el objeto para que tenga ese parámeto asignado
	# Por ejemplo, en relaciones, se requiere para discriminar qué seccion querenmos actualizar
	if (!empty($current_tipo_section)) {
		$component_obj->current_tipo_section = $current_tipo_section;
	}
	#dump($current_tipo_section,'$current_tipo_section');

	# CONTEXT OF COMPONENT
	$component_obj->set_context($context);
	
	# Get component html
	$html = $component_obj->get_html();
	
	exit($html);

}//load_component_by_ajax


/**
* LOAD SECTION BY AJAX
* load ajax html component
* Cargador genérico de secciones. Devuelve el html costruido del componente resuelto y en el modo recibido.
*/
if ($mode=='load_section_by_ajax') {
	
	if(empty($id)) {
		$msg = "Error Processing Request. id is not defined!";
		error_log($msg);
		throw new Exception($msg, 1);	
	}		
	if(empty($tipo)) {
		$msg = "Error Processing Request. tipo is not defined!";
		error_log($msg);
		throw new Exception($msg, 1);
	}	
	if(empty($modo)) {
		$msg = "Error Processing Request. modo is not defined!";
		error_log($msg);
		throw new Exception($msg, 1);
	}
	if(empty($context)) {
		#$msg = "Error Processing Request. context is not defined!";
		#error_log($msg);
		#throw new Exception($msg, 1);
	}		
	
	$section_obj = new section($id, $tipo);
		#dump($section_obj,'$section_obj');

	#$section_obj->set_caller_id($caller_id);
	$section_obj->set_show_inspector(false);
	$section_obj->set_context($context);
		#dump($section_obj,'$section_obj in trigger');
		#error_log('context:'.$context);
	
	# Get component html
	$html = $section_obj->get_html();
	exit($html);

}//load_section_by_ajax






?>