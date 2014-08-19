<?php
/*
* CLASS DIFFUSION_MEMORIAL_DEMOCRATIC_WEB
* 
*/


class diffusion_memorial_democratic_web extends diffusion {
	
	public $ar_diffusion_map;
	public static $ar_database;
	public static $ar_table;
	public static $ar_table_data;

	/**
	* CONSTRUCT
	*/
	function __construct($options=null) {

		$this->ar_diffusion_map = $this->get_ar_diffusion_map();
		self::$ar_database 		= $this->get_ar_database();

		self::$ar_table_data = array();
	}


	# GET_AR_DIFFUSION_MAP
	public function get_ar_diffusion_map() {
		
		#if(SHOW_DEBUG) $start_time = start_time();

		$ar_diffusion_map = array();

		# DIFFUSION STRUCTURE

			# DIFFUSION_DOMAIN : Get structure tipo of current diffuision domain name
			$diffusion_domain = diffusion::get_my_diffusion_domain('memorial_democratic',get_called_class());
				#dump($diffusion_domain,'$diffusion_domain');

			# DATABASE :
			$ar_diffusion_database = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($diffusion_domain, $modelo_name='database', $relation_type='children');
				#dump($ar_diffusion_database,'$ar_diffusion_database');
			
			# DIFFUSION_SECTIONS : Recorremos las secciones de difusión para localizar las coincidencias con los tipos de sección de las indexaciones
			foreach ($ar_diffusion_database as $diffusion_database_tipo) {

				# diffusion_section_tipo ar_relateds_terms
				$current_database_tipo = $diffusion_database_tipo;
					#dump($current_database_tipo,'$current_database_tipo');
				
				# current_database_tipo : Verify
				if (empty($current_database_tipo)) {
					throw new Exception("Error Processing Request get_ar_diffusion_map: diffusion_database_tipo is empty. Please configure structure with one diffusion_database_tipo related", 1);
				}

				$ar_diffusion_map[] = $current_database_tipo;		
				
			}#end foreach ($ar_diffusion_database as $diffusion_section_tipo

		#if(SHOW_DEBUG) dump( exec_time($start_time, __METHOD__) );

		return $ar_diffusion_map;
	}


	public function get_ar_database() {

		foreach ($this->ar_diffusion_map as $value) {
			$ar_dabatase_name[$value] = RecordObj_ts::get_termino_by_tipo($value);
		}
		#self::$ar_database =$ar_dabatase_name;
			#dump(self::$ar_database);
		return $ar_dabatase_name;
	}


	/**
	* GET_DB_SCHEMA
	*/
	public function get_db_schema($database_tipo) {

		$ar_data=array();		

		# Tablas en el primer nivel
		$ar_diffusion_table = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($database_tipo, $modelo_name='table', $relation_type='children');
			#dump($ar_diffusion_table,'$ar_diffusion_table');die();

		# Recorremos hijos de la primera/as tabla/s
		foreach ($ar_diffusion_table as $key => $current_table_tipo) {
			
			$ar_section = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($current_table_tipo, $modelo_name='section', $relation_type='termino_relacionado');
				#dump($ar_section,'ar_section : '.$database_tipo);

			if(!empty($ar_section)) {

				#$ar_data[] = self::build_table_recursive($current_table_tipo);
				self::build_table_recursive($current_table_tipo, $database_tipo);

			}#if(!empty($ar_section))
		}
		#dump($ar_data,'$ar_data');

		#return $ar_data;

	}#end get_db_schema



	/**
	* BUILD_TABLE_RECURSIVE
	*/
	
	public static function build_table_recursive($table_tipo, $database_tipo) {
		
		$ar_data=array();

		$ar_data[$table_tipo]['database_name']	= reset(self::$ar_database);
		$ar_data[$table_tipo]['table_name']		= RecordObj_ts::get_termino_by_tipo($table_tipo);

		$ar_section = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($table_tipo, $modelo_name='section', $relation_type='termino_relacionado');
			#dump($ar_section,'$ar_section');
		
		if(!empty($ar_section)) {
		# ID FIELD		
			$ar_data[$table_tipo]['ar_fields'][] = self::create_field($ar_section[0], true);				
		}else{
		# ID PORTAL
			$portal_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($table_tipo, $modelo_name='component_portal', $relation_type='termino_relacionado')[0];
				#dump($portal_tipo,'portal_tipo');
			$component_portal = new component_portal(NULL,$portal_tipo,'dummy',0); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=NULL) 
			$target_section_tipo = $component_portal->get_target_section_tipo();
				#dump($target_section_tipo,'$target_section_tipo - '.$portal_tipo.' '.RecordObj_ts::get_termino_by_tipo($portal_tipo));
			$ar_data[$table_tipo]['ar_fields'][] = self::create_field($target_section_tipo, true);
		}

		# LANG
		$ar_data[$table_tipo]['ar_fields'][] = self::create_field('lang');

		# NORMAL TABLE FIELDS
		$ar_children = RecordObj_ts::get_ar_childrens($table_tipo);
		foreach ($ar_children as $curent_children_tipo) {
			$modelo_name = RecordObj_ts::get_modelo_name_by_tipo($curent_children_tipo);
			if (strpos($modelo_name, 'field_')===0) {
				$ar_data[$table_tipo]['ar_fields'][] = self::create_field($curent_children_tipo, false);
				
			}elseif ($modelo_name=='table') {
				# code...
				$ar_data[$table_tipo]['ar_fields'][] = self::create_field($curent_children_tipo, false, true);

					#dump($curent_children_tipo,$table_tipo);
				# Recursion (portal)
				self::build_table_recursive($curent_children_tipo, $database_tipo);
					#dump($a);
				#$ar_temp = self::build_table_recursive($curent_children_tipo);
				#$ar_data[$curent_children_tipo] = $ar_temp;
					#dump($ar_data,'$ar_data '.$table_tipo);		
			}
		}
		self::$ar_table[$database_tipo][] = $ar_data[$table_tipo];
	}


	/**
	* CREATE_FIELD
	*//*
	$ar_data['field_name'];
	$ar_data['field_type'];
	$ar_data['field_coment'];
	$ar_data['field_options'];
	*/
	public static function create_field($tipo, $is_id_matrix=false, $is_relation=false) {

		$ar_field_data=array();

		switch (true) {

			case ($is_id_matrix==true):
				$ar_field_data['field_name'] 	= 'id_matrix';
				$ar_field_data['field_type'] 	= 'field_int';
				$ar_field_data['field_coment'] 	= '';#RecordObj_ts::get_termino_by_tipo($tipo)." - $tipo";
				$ar_field_data['field_options']	= 12;				
				break;

			case ($tipo=='lang'):
				$ar_field_data['field_name'] 	= 'lang';
				$ar_field_data['field_type'] 	= 'field_varchar';
				$ar_field_data['field_coment'] 	= "Campo creado automáticamente para guardar el idioma (sin correspondencia en estructura)";
				$ar_field_data['field_options']  = 8;
				break;

			case ($is_relation==true):
				$ar_field_data['field_name'] 	= RecordObj_ts::get_termino_by_tipo($tipo);
				$ar_field_data['field_type'] 	= 'field_text';
				$termino_relacionado 			= RecordObj_ts::get_ar_terminos_relacionados($tipo, $cache=false, $simple=true)[0];
				$ar_field_data['field_coment'] 	= RecordObj_ts::get_termino_by_tipo($termino_relacionado)." - $termino_relacionado";
				$ar_field_data['field_options'] = null;
				break;


			default:
				$ar_field_data['field_name'] 	= RecordObj_ts::get_termino_by_tipo($tipo);
				$ar_field_data['field_type'] 	= RecordObj_ts::get_modelo_name_by_tipo($tipo);

				$termino_relacionado 			= RecordObj_ts::get_ar_terminos_relacionados($tipo, $cache=false, $simple=true)[0];
				$ar_field_data['field_coment'] 	= RecordObj_ts::get_termino_by_tipo($termino_relacionado)." - $termino_relacionado";
				
				$RecordObj_ts 		 			= new RecordObj_ts($tipo);
				$propiedades 				 	= $RecordObj_ts->get_propiedades();
				$ar_field_data['field_options'] = json_decode($propiedades);
				break;
		}

		return $ar_field_data;
	}







	/**
	* GET_DB_DATA
	*/
	public function get_db_data($database_tipo) {

		$ar_data=array();		

		# Tablas en el primer nivel
		$ar_diffusion_table = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($database_tipo, $modelo_name='table', $relation_type='children');
			#dump($ar_diffusion_table,'$ar_diffusion_table');die();

		# Recorremos hijos de la primera/as tabla/s
		foreach ($ar_diffusion_table as $current_table_tipo) {
			
			$ar_section = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($current_table_tipo, $modelo_name='section', $relation_type='termino_relacionado');
				#dump($ar_section,'ar_section : '.$database_tipo);

			if(!empty($ar_section)) {

				#$ar_data[] = self::build_table_data_recursive($current_table_tipo, null, $database_tipo);
				self::build_table_data_recursive($current_table_tipo, null, $database_tipo);

			}#if(!empty($ar_section))
		}#end foreach
		#dump($ar_data,'$ar_data');

		#return $ar_data;

	}#end get_db_schema



	/**
	* BUILD_TABLE_DATA_RECURSIVE
	*/
	/*
	INSERT INTO `dedalo3_demo`.`descriptors` (`id`, `terminoID`, `termino`, `def`, `lang`) VALUES (NULL, 'dd50', 'termino50', 'nota 50', 'lg-spa');
	*/
	public static function build_table_data_recursive($table_tipo, $ar_id_matrix_portal=null, $database_tipo) {

		$ar_data=array();

		$ar_data[$table_tipo]['database_name']	= reset(self::$ar_database);
		$ar_data[$table_tipo]['table_name'] 	= RecordObj_ts::get_termino_by_tipo($table_tipo);

		$ar_section_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($table_tipo, $modelo_name='section', $relation_type='termino_relacionado');
		if(isset($ar_section_tipo[0])) {
			$section_tipo = $ar_section_tipo[0];
		}else{
			$section_tipo = null;
		}		
		#dump($section_tipo,'$section_tipo');
		
		
		if(!empty($section_tipo)) {
			$is_true = true;
		}else{
			$section_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($table_tipo, $modelo_name='component_portal', $relation_type='termino_relacionado')[0];
			$is_true = true;
		}


		if($is_true) {	
		# ID FIELD

			if(!empty($ar_id_matrix_portal)) {
				$ar_result				= $ar_id_matrix_portal;
			}else{
				# Buscamos id matrix
				$arguments=array();
				$arguments['tipo']		= $section_tipo;
				$RecordObj_matrix		= new RecordObj_matrix('matrix',NULL);
				$ar_result				= $RecordObj_matrix->search($arguments);
			}
			

			$section = new section(NULL,$section_tipo,'list');
				#dump($section,'$section');
			$ar_all_project_langs = $section->get_ar_all_project_langs();
				#dump($ar_all_project_langs,'$ar_all_project_langs');
			#dump($ar_result,'$ar_result');die();
			foreach ($ar_result as $current_id_matrix) {	# iteramos por registros
				$i=0;
				foreach ($ar_all_project_langs as $current_lang) {	# iteramos por idioma
						
						# ID_MATRIX
						$ar_data[$table_tipo]['ar_fields'][$current_id_matrix][$current_lang][] = self::create_data_field($section_tipo, $current_id_matrix, true);		
							#dump($ar_data,'$ar_data');						

						# LANG
						$ar_data[$table_tipo]['ar_fields'][$current_id_matrix][$current_lang][] = self::create_data_field('lang',$current_lang);
							#dump($ar_data,'$ar_data');


						# NORMAL TABLE FIELDS
						$ar_children = RecordObj_ts::get_ar_childrens($table_tipo);
						foreach ($ar_children as $curent_children_tipo) {
							
							# Obtenemos el modelo de lo hijos de la tabla para identificar los campos y las tablas relacionadas
							$modelo_name = RecordObj_ts::get_modelo_name_by_tipo($curent_children_tipo);
							
							#Si el modelo es "field" es un campo directo
							#Si el modelo es "tabla" es un puntero a un portal, se convertira este hijo en un campo que relacionará las dos tablas
							if ( strpos($modelo_name, 'field_')!==false ) {
								$ar_data[$table_tipo]['ar_fields'][$current_id_matrix][$current_lang][] = self::create_data_field($curent_children_tipo, false, false, $current_id_matrix, $current_lang);
									#dump($ar_data,'$ar_data');

							}elseif ($modelo_name=='table') {

								# Tabla = portal, obtenemos del elemeto 'tabla', su portal (es el término relacionado)
								# El término 'tabla' se convierte en un campo que apunta a la tabla relacionada que se creará
								$portal_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($curent_children_tipo, $modelo_name='component_portal', $relation_type='termino_relacionado')[0];
								if (SHOW_DEBUG) {
									if (empty($portal_tipo)) {
										throw new Exception("Error Processing Request. 
											component_portal not found as 'termino_relacionado' by get_ar_terminoID_by_modelo_name_and_relation children_tipo:$curent_children_tipo ,component_portal, termino_relacionado
											Please verify structure for this element, is possible that related term is not portal (maybe section?)", 1);										
									}
								}
									#dump($portal_tipo,'portal_tipo - '.$table_tipo);
								
								# CAMPO TABLA : Generamos el campo con los datos del porta que vienen de Matrix
								$ar_portal_data = self::create_data_field($curent_children_tipo, false, false, $current_id_matrix, $current_lang, true);
									#dump($ar_portal_data,'$ar_portal_data');

								#Añade el resultado de la generación del campo al array de campos generados
								$ar_data[$table_tipo]['ar_fields'][$current_id_matrix][$current_lang][] = $ar_portal_data;
									#dump($ar_portal_data,'$ar_portal_data');


								$ar_portal_id_matrix_unique=array();
								#Obetenos el "locator" del portal para identificar los enlaces directos en la posición del "tipo ("0") y los enlaces a etiquetas ("dd341")
								foreach ($ar_portal_data['field_value'] as $current_locator) {
									#dump($current_locator,'$current_locator ');
									# buscamos el número Matrix para aunar los mismos locators en un sólo y generar los rows de la tabla realacionada sin dupilicades innecesarias 
									$locator_relation_as_obj = component_common::get_locator_relation_as_obj($current_locator);
									if(!in_array($locator_relation_as_obj->section_id_matrix, $ar_portal_id_matrix_unique))
										$ar_portal_id_matrix_unique[] = $locator_relation_as_obj->section_id_matrix;
								}
								#dump($ar_portal_id_matrix_unique,'$ar_portal_id_matrix_unique ');
									
								# Recursion (portal)
								#$ar_data[$curent_children_tipo] = self::build_table_data_recursive($curent_children_tipo, $ar_portal_id_matrix_unique)[$curent_children_tipo];
								# RECURSION : Ojo! sólo una por idioma. Resetear el contador $i a 0 en cada pasada de id_matrix
								if($i<1) {
									self::build_table_data_recursive($curent_children_tipo, $ar_portal_id_matrix_unique, $database_tipo);	
								}																																		
							}
						}#end foreach ($ar_children as $curent_children_tipo)
					$i++;							
				}#end foreach ($ar_all_project_langs as $current_lang)
				

			}#end foreach ($ar_result as $current_id_matrix)
			#self::build_table_data_recursive($section_tipo, $ar_portal_id_matrix_unique, $database_tipo);

			#$ar_data[$table_tipo]['ar_fields'][] = self::create_data_field($ar_section[0], $matrix_id_section, 'true');
		
		
		}#end if(!empty($section_tipo)) {

		self::$ar_table_data[$database_tipo][] = $ar_data[$table_tipo];
	
		#return $ar_data;
	}


	/**
	* CREATE_DATA_FIELD
	*//*
	$ar_data['field_name'];
	$ar_data['field_type'];
	$ar_data['field_coment'];
	$ar_data['field_options'];
	*/
	public static function create_data_field($tipo, $value, $is_id_matrix=false, $parent=null, $lang=null, $is_portal=false) {

		$ar_field_data=array();

		switch (true) {

			case ($is_id_matrix==true):
				$ar_field_data['field_name'] 	= 'id_matrix';
				$ar_field_data['field_value'] 	= $value;						
				break;

			case ($tipo=='lang'):
				$ar_field_data['field_name'] 	= 'lang';
				$ar_field_data['field_value'] 	= $value;
				break;

			case ($is_portal==true):
				$ar_field_data['field_name'] 	= RecordObj_ts::get_termino_by_tipo($tipo);				

				$termino_relacionado 			= RecordObj_ts::get_ar_terminos_relacionados($tipo, $cache=false, $simple=true)[0];
				$modelo_name 					= RecordObj_ts::get_modelo_name_by_tipo($termino_relacionado);

				$current_component 				= new $modelo_name(NULL, $termino_relacionado, 'dummy', $parent, $lang);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
					#dump($current_component,'$current_component');

				$valor 							= $current_component->get_valor($lang);
					#dump($valor,'$valor');
				if(is_array($valor)) foreach ($valor as $current_locator) {

					#dump($current_locator,'$current_locator');
					$locator_relation_as_obj = component_common::get_locator_relation_as_obj($current_locator);
					$component_tipo 		 = $locator_relation_as_obj->component_tipo;
						#dump($component_tipo,'$component_tipo');
					if($component_tipo==(string)'0') {
						
						$ar_field_data['field_value'] 	= $valor;
							#dump($valor,'$valor');
					
					}else{

						#dump($current_locator,'current_locator');

						$locator_relation_as_obj = component_common::get_locator_relation_as_obj($current_locator);
							#dump($valor,'$valor');


						# Difussion: Hijos del término (campos / tablas)
						$ar_childrens			= RecordObj_ts::get_ar_childrens($tipo);
							#dump($ar_childrens,'$ar_childrens '.$tipo);
						foreach ($ar_childrens as $current_children) {

							# Referencias a los campos reales en la estructura
							$termino_relacionado = RecordObj_ts::get_ar_terminos_relacionados($current_children, $cache=false, $simple=true)[0];
								#dump($ar_terminos_relacionados,'$ar_terminos_relacionados '.$tipo);

							# Si concuerda el tipo del término
							#dump($termino_relacionado,'$termino_relacionado '.$component_tipo);					
							if ($termino_relacionado == $component_tipo) {
								#dump("CONCUERDA!!!!");
								$termino = RecordObj_ts::get_termino_by_tipo($current_children);
							}

						}#end foreach ($ar_childrens as $current_children) {


						$nombre_del_campo = $termino;
						$current_locator  = component_common::build_locator_relation($locator_relation_as_obj->section_id_matrix, $nombre_del_campo, $locator_relation_as_obj->tag_id);

						$new_valor[] = $current_locator;
							#dump($new_valor,'new_valor');						

						$ar_field_data['field_value'] = $new_valor;
					}
				}
				if(empty($ar_field_data['field_value'])) $ar_field_data['field_value'] = array();

				#dump($ar_field_data['field_value'],'$ar_field_data[field_value] '. print_r($valor,true)." - $tipo ");
				break;

			default:
				$ar_field_data['field_name'] 	= RecordObj_ts::get_termino_by_tipo($tipo);				

				$termino_relacionado 			= RecordObj_ts::get_ar_terminos_relacionados($tipo, $cache=false, $simple=true)[0];
				$modelo_name 					= RecordObj_ts::get_modelo_name_by_tipo($termino_relacionado);

				$current_component 				= new $modelo_name(NULL, $termino_relacionado, 'dummy', $parent, $lang);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
					#dump($current_component,'$current_component');
				
				$ar_field_data['field_value'] 	= $current_component->get_valor($lang);

				# 
				# Temporal fix
				# Soluciona el problema del si/no traducible ya que este campo es de tipo 'enum' y sólo acepta los valores 'si','no' (no acepta yes, oui, etc..)
				# dd62 es el tipo de la lista de valores privada de donde se extrae el dato de 'Publicable' en el radio button de las fichas de difusión
				$termino_relacionado2 			= RecordObj_ts::get_ar_terminos_relacionados($termino_relacionado, $cache=false, $simple=true);
				if(isset($termino_relacionado2[0]) && $termino_relacionado2[0]==DEDALO_CAMPO_SI_NO_TIPO) {
					$dato = $current_component->get_dato();
					switch ($dato) {
						case NUMERICAL_MATRIX_VALUE_YES:
							$valor = 'si'; # 1
							break;
						case NUMERICAL_MATRIX_VALUE_NO:
							$valor = 'no'; # 3
							break;
						default:
							$valor = 'no';
					}
					$ar_field_data['field_value'] = $valor;
					#error_log('->ar_field_data: '.$valor);
				}

				break;

		}#end switch (true) 

		#dump($ar_field_data,'$ar_field_data');
		return $ar_field_data;
	}



	
}
?>