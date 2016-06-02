<?php
/*
* CLASS COMPONENT TEXT AREA
*/


class component_text_area extends component_common {

	public $arguments;


	function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_LANG, $section_tipo=null) {

		// Overwrite lang when component_select_lang is present
		if ($modo=='edit' && !empty($parent) && !empty($section_tipo)) {
			$lang = self::force_change_lang($tipo, $parent, $modo, $lang, $section_tipo);			
		}

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);
		

	}//end __construct



	/**
	* FORCE_CHANGE_LANG
	* If defined component_select_lang as related term of current component, the lag of the component
	* gets from component_select_lang value. Else, received lag is used normally
	* @return string $lang
	*/
	public static function force_change_lang($tipo, $parent, $modo, $lang, $section_tipo) {
		
		$ar_related_by_model = common::get_ar_related_by_model('component_select_lang',$tipo);
			#dump($ar_related_by_model, ' $ar_related_by_model ++ '.to_string());
		if (!empty($ar_related_by_model)) {
			switch (true) {
				case count($ar_related_by_model)==1 :
					$related_component_select_lang = reset($ar_related_by_model);
					break;
				case count($ar_related_by_model)>1 :
					debug_log(__METHOD__." More than one ar_related_by_model are found. Please fix this ASAP ".to_string(), logger::ERROR);
					break;
				default:
					debug_log(__METHOD__." Var ar_related_by_model value is invalid. Please fix this ASAP ".to_string($ar_related_by_model), logger::ERROR);
					break;
			}
			if (isset($related_component_select_lang)) {				
				$component_select_lang = component_common::get_instance('component_select_lang',
																	    $related_component_select_lang,
																	    $parent,
																	    $modo,
																	    DEDALO_DATA_NOLAN,
																	    $section_tipo);
				$component_select_lang_dato = $component_select_lang->get_dato();
					#dump($component_select_lang_dato, ' component_select_lang_dato ++ '.to_string());
				if (!empty($component_select_lang_dato) && strpos($component_select_lang_dato, 'lg-')!==false && $component_select_lang_dato!=$lang) {
					debug_log(__METHOD__." Changed lang: $lang to $component_select_lang_dato ", logger::DEBUG);
					$lang = $component_select_lang_dato;
				}
			}
		}

		return $lang;

	}#end force_change_lang

	


	
	# GET DATO : Format "lg-spa"
	public function get_dato() {
		$dato = parent::get_dato();

		#$dato = TR::addTagImgOnTheFly($dato);	#dump($dato,'dato2');
		#$dato = self::decode_dato_html($dato);

		# Compatibility old dedalo3 instalations		
		if ( strpos($dato, '[index_')!==false || strpos($dato, '[out_index_')!==false ) {
			$this->dato = $this->convert_tr_v3_v4( $dato );	// Update index tags format
			$this->Save();
			$dato = parent::get_dato();
		}

		return (string)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		if($dato=='""') $dato = ''; // empty dato json encoded
		parent::set_dato( (string)$dato );
	}


	/**
	* CONVERT_TR_V3_V4
	* @return 
	*/
	public function convert_tr_v3_v4( $dato ) {
		
		$dato_source = $dato;
		
		#
		# INDEX IN		
		$dato_final = preg_replace("/\[index_[0]*([0-9]+)_in\]/", "[index-n-$1]", $dato_source, -1 , $count_index_in);

		#
		# INDEX OUT		
		$dato_final = preg_replace("/\[out_index_[0]*([0-9]+)\]/", "[/index-n-$1]", $dato_final, -1 , $count_index_out);

		debug_log(__METHOD__." Replaced index_in:$count_index_in and index_out:$count_index_out matches in dato".to_string(), logger::DEBUG);

		return (string)$dato_final;

	}#end convert_tr_v3_v4



	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save( $update_all_langs_tags_state=false, $cleant_text=true ) {
		
		# revisamos las etiquetas para actualizar el estado de las mismas en los demás idiomas
		# para evitar un bucle infinito, en la orden 'Save' de las actualizaciones, pasaremos '$update_all_langs_tags_state=false'
		if ($update_all_langs_tags_state===true) {
			$this->update_all_langs_tags_state();
		}

		# Dato current assigned
		$dato_current 	= $this->dato;
			#dump($dato_current, ' dato_current');
			
		# Clean dato 
		if ($cleant_text) {
			$dato_current 	= TR::limpiezaPOSTtr($dato_current);
		}		

		#$dato_clean 	= mb_convert_encoding($dato_clean, "UTF-8", "auto");

		# Set dato again (cleaned)
		$this->dato 	= $dato_current;
		if(SHOW_DEBUG) {			
			#dump($this->dato,"salvando desde el componente text area");
		}		


		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}

	# OVERRIDE COMPONENT_COMMON METHOD
	public function get_ar_tools_obj() {
		# Add tool_indexation
		$this->ar_tools_name[] = 'tool_indexation';
		
		return parent::get_ar_tools_obj();
	}	
	

	

	public function get_html(){

		switch ($this->modo) {
			case 'list':
				$max_char 		 = 256;
				$obj_fragmentos	 = new stdClass();
				$valor = (string)$this->get_valor();

				# 
				# First fragment (key 'full') always is a substring of whole text
				if (strlen($valor)>$max_char) {
					#$fragmento_text = mb_substr($valor,0,$max_char). '..';
					$fragmento_text = tools::truncate_text($valor,$max_char);
				}else{
					$fragmento_text = $valor;
				}
				
								
				#$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/' . get_class($this) . '.php';
				#ob_start();
				#include ( $page_html);
				#$html =  ob_get_clean();
				$key=0;
				$obj_fragmentos->$key = $fragmento_text;
				
				#
				# Next fragments keys(1,2,..) (if tags exists)
				$tags_en_texto	= (array)$this->get_ar_relation_tags();
					#dump($tags_en_texto,"tags_en_texto");
				if (!empty($tags_en_texto[0]) && count($tags_en_texto[0])>0) {

					foreach ($tags_en_texto[0] as $key => $tag) {

						$ar_fragmento = (array)component_text_area::get_fragment_text_from_tag($tag, $this->dato);
								#dump($ar_fragmento,"ar_fragmento");
						
						if(isset($ar_fragmento[0]) && strlen($ar_fragmento[0])>$max_char) {
							$fragmento_text = mb_substr($ar_fragmento[0],0,$max_char);
							if (strlen($ar_fragmento[0])>$max_char) {
								$fragmento_text .= '..';
							}
						} else{
							$fragmento_text = isset($ar_fragmento[0]) ? $ar_fragmento[0] : '';
						}
						#dump ($fragmento_text); die();
						$tag_id = $tags_en_texto[3][$key];
							#dump ($tag_id); #die();						
						
						#$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/' . get_class($this) . '.php';
						#ob_start();
						#include ( $page_html);
						#$html =  ob_get_clean();

						$obj_fragmentos->$tag_id = $fragmento_text;
					}
					#dump ($obj_fragmentos);
				}
				#dump(json_handler::encode($obj_fragmentos),"obj_fragmentos");
				#$html_final = json_handler::encode($obj_fragmentos);

				return $obj_fragmentos;	

				/*
				$file_name 		= $this->modo;
				$max_char 		= 256;
				$tags_en_texto	= array();
				$obj_fragmentos	 = new stdClass();
					
				$tags_en_texto	= $this->get_ar_relation_tags();
					
					foreach ($tags_en_texto[0] as $key => $tag) {

						$fragmento = component_text_area::get_fragment_text_from_tag($tag, $this->dato);
						
						if(strlen($fragmento[0])>$max_char)
						{
							$fragmento_text = substr($fragmento[0],0,$max_char).'..';
						} else{
							$fragmento_text = $fragmento[0];
						}
						#dump ($fragmento_text); die();
						$tag_id = $tags_en_texto[3][$key];
						//dump ($tag_id); die();
						
						$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/' . get_class($this) . '.php';
						ob_start();
						include ( $page_html);
						$html =  ob_get_clean();
						#$html = htmlentities($html);

						$obj_fragmentos->$tag_id = $html;
					}
					#dump ($obj_fragmentos);
					return $obj_fragmentos;
					*/
					/*
					$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/' . get_class($this) . '.php';
					ob_start();
					include ( $page_html);
					$str_obj_fragmentos =  ob_get_clean();
						dump($str_obj_fragmentos,"str_obj_fragmentos");

					return $str_obj_fragmentos;				
					*/
				break;
			
			default:
				return parent::get_html();
				break;
}
						



	}

	/**
	* GET DATO DEFAULT 
	* Overwrite common_function
	*/
	public function get_dato_default_lang() {

		$dato = parent::get_dato_default_lang();
		$dato = TR::addTagImgOnTheFly($dato);
		#$dato = self::decode_dato_html($dato);

		return $dato;
	}

	/**
	* GET VALOR
	* Overwrite common_function
	*/
	public function get_valor() {			
		
		switch ($this->modo) {
			case 'dummy':
			case 'diffusion':
				#$dato = $this->get_dato();
				$dato = parent::get_dato();		
				break;
			
			default:

				$dato = parent::get_dato();	
				#dump($dato,'dato');

				$dato = TR::deleteMarks($dato, $deleteTC=true, $deleteIndex=true, $deleteIndex=true);
				$dato = self::decode_dato_html($dato);
				#$dato = addslashes($dato);					

				# Desactivo porque elimina el '<mar>'
				$dato = filter_var($dato, FILTER_UNSAFE_RAW );	# FILTER_SANITIZE_STRING
				break;
		}		

		return $dato;
	}


	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG ) {
		
		if (is_null($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( $valor );	// Use parsed json string as dato
		}

		$valor_export = $this->get_valor($lang);
		#$valor_export = br2nl($valor_export);


		if(SHOW_DEBUG) {
			#return "TEXT_AREA: ".$valor_export;
		}
		return $valor_export;

	}#end get_valor_export
	

	/*
	* DECODE DATO HTML
	*/
	protected static function decode_dato_html($dato) {
		return htmlspecialchars_decode($dato);
	}



	/**
	* UPDATE ALL LANGS TAGS STATE 
	* Actualiza el estado de las etiquetas:
	* Revisa el texto completo, comparando fragmento a fragmento, y si detecta que algún fragmento ha cambiado
	* cambia sus etiquetas a estado 'r'
	* @return $ar_changed_tags (key by lang)
	*/
	protected function update_all_langs_tags_state() {
die(__METHOD__." EN PROCESO");
		$ar_changed_tags 	= array();
		$ar_changed_records = array();

		if (!$this->id) return $ar_changed_tags;

		# Previous dato
		# re-creamos este objeto para obtener el dato previo a las modificaciones		
		$previous_obj 		= new component_text_area($this->id, $this->tipo);
		$previous_raw_text	= $previous_obj->get_dato_real();
		
		# Current dato
		$current_text 		= $this->dato;
		# Clean current dato 
		$current_raw_text 	= TR::limpiezaPOSTtr($current_text);

		# Search tags
		$matches 		= $this->get_ar_relation_tags();
		$key 	 		= 0;		
			#dump(max($matches[$key]),'max($matches[$key])');		
		if (empty($matches[$key])) {
			return $ar_changed_tags ;
		}

		# Eliminamos duplicados (las etiquetas in/out se devuelven igual, como [index-n-1],[index-n-1])
		$ar_tags = array_unique($matches[$key]); 
			#dump($ar_tags,'ar_tags');

		# iterate all tags comparing fragments
		if(is_array($ar_tags)) foreach ($ar_tags as $tag) {			
			
			# Source fragment
			$source_fragment_text = component_text_area::get_fragment_text_from_tag( $tag, $previous_raw_text )[0];
			# Target fragment
			$target_fragment_text = component_text_area::get_fragment_text_from_tag( $tag, $current_raw_text )[0];

			if ($source_fragment_text != $target_fragment_text) {
				$ar_changed_tags[] = $tag;
			}
					
			#dump($source_fragment_text,'$source_fragment_text');
			#dump($target_fragment_text,'$target_fragment_text');
		}
		#dump($ar_changed_tags,'$ar_changed_tags');
		$ar_final['changed_tags']	= $ar_changed_tags;

		# Ya tenemos calculadas las etiquetas de los fragmentos que han cambiado		
		if (count($ar_changed_tags)==0) {
			# no hay etiquetas a cambiar
			$ar_final['changed_records'] = NULL;
		}else{
			# Recorremos los registros del resto de idiomas actualizando el estado de las etiquetas coincidentes a 'r' (para revisar)
			$arguments=array();
			$arguments['parent']	= $this->get_parent();
			$arguments['tipo']		= $this->get_tipo();			
			$matrix_table 			= common::get_matrix_table_from_tipo($this->get_tipo());		
			$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
			$ar_result				= $RecordObj_matrix->search($arguments);

			foreach ($ar_result as $id_matrix) {
				
				$component_text_area= new component_text_area($id_matrix, $this->get_tipo() );
				$current_lang 		= $component_text_area->get_lang();
				if ($current_lang != $this->lang) {
					
					$text_raw 			= $component_text_area->get_dato_real();
					$text_raw_updated 	= self::change_tag_state( $ar_changed_tags, $state='r', $text_raw );
					$component_text_area->set_dato($text_raw_updated);	
						#dump($text_raw_updated,'$text_raw_updated',"for id: $id_matrix");
					$component_text_area->Save(false);	# Important: arg 'false' is mandatory for avoid infinite loop
					$ar_changed_records[] = $id_matrix;
				}
			}
			$ar_final['changed_records']= $ar_changed_records;			
		}		
		#dump($ar_final,'ar_final');

		return $ar_final;
	}

	/**
	* CHANGE TAG STATE
	* Cambia el estado de la etiqueta dada dentro del texto.
	* Ejemplo: [index-n-1] -> [index-r-1]
	* @param $ar_tag (formated as tag in, like [index-n-1]. Can be string or array)
	* @param $state (default 'r')
	* @param $text_raw
	* @return $text_raw_updated
	*/
	public static function change_tag_state( $ar_tag, $state='r', $text_raw ) {

		# Force array
		if (is_string($ar_tag)) $ar_tag = array($ar_tag);

		# Default no change text
		$text_raw_updated = $text_raw;		

		if(is_array($ar_tag)) foreach ($ar_tag as $tag) {

			#$pattern 			= TR::get_mark_pattern($mark='index');	# is: "\[\/{0,1}(index)-([a-z])-([0-9]{1,6})\]"
			$id 				= TR::tag2value($tag);		#dump($tag,'tag');

			# patrón válido tanto para 'in' como para 'out' tags
			$pattern 			= "/(\[\/{0,1}index-)([a-z])(-$id\])/";
			# reemplazamos sólo la letra correspondiente al estado de la etiqueta
			$replacement		= "$1".$state."$3";
			$text_raw_updated 	= preg_replace($pattern, $replacement, $text_raw);
		}		

		return $text_raw_updated ;
	}


	/**
	* DELETE TAG FROM TEXT
	* !!!!
	* @param array $ar_tag (formated as tag in, like [index-n-1]. Can be string (will be converted to array))	
	* @param string $text_raw
	* @return string $text_raw_updated
	*/
	public static function delete_tag_from_text($ar_tag, $text_raw) {

		foreach ((array)$ar_tag as $tag) {

			#$pattern 			= TR::get_mark_pattern($mark='index');	# is: "\[\/{0,1}(index)-([a-z])-([0-9]{1,6})\]"
			$id 				= TR::tag2value($tag);		#dump($tag,'tag');

			# patrón válido tanto para 'in' como para 'out' tags
			$pattern 			= "/(\[\/{0,1}index-[a-z]-$id\])/";
			# reemplazamos la etiqueta por un string vacío
			$replacement		= "";
			$text_raw_updated 	= preg_replace($pattern, $replacement, $text_raw);
		}		

		return $text_raw_updated ;

	}#end delete_tag_from_text


	/**
	* GET AR REALATION TAGS
	* Buscamos apariciones del patron de etiqueta indexIn (definido en class TR)
	* @return $matches Array()
	* Devuelve un array con todas las apariciones, del tipo: 'indexIn' formateadas
	* Like:
	*/
	/*
	pattern: /([index-([a-z])-([0-9]{1,6})])/ 
	result :
	[0] => Array
        (
            [0] => [index-n-5]
            [1] => [index-n-4]
            [2] => [index-n-3]
        )
    [1] => Array
        (
            [0] => [index-n-5]
            [1] => [index-n-4]
            [2] => [index-n-3]
        )
    [2] => Array
        (
            [0] => n
            [1] => n
            [2] => n
        )
    [3] => Array
        (
            [0] => 5
            [1] => 4
            [2] => 3
        )
	*/
	public function get_ar_relation_tags() {

		# Cogemos los datos raw de la base de datos
		$dato = $this->get_dato_real();

		if (empty($dato))
			return NULL;

		$matches = NULL;				

		# Buscamos apariciones del patrón de etiqueta indexIn (definido en class TR)
		$pattern = TR::get_mark_pattern($mark='indexIn',$standalone=true);

		# Search math patern tags
		preg_match_all($pattern,  $dato,  $matches, PREG_PATTERN_ORDER);
			#dump($matches,'$matches',"matches to patern: $pattern");

		return $matches;
	}

	/**
	* GET LAST TAG REL ID
	* @return Int max tag id value
	*/
	public function get_last_tag_index_id() {

		$matches = $this->get_ar_relation_tags();
		$key 	 = 3;		
			#dump(max($matches[$key]),'max($matches[$key])');
		
		if (empty($matches[$key])) {
			return intval(0);
		}else{
			return intval(max($matches[$key]));	
		}
	}


	/**
	* GET FRAGMENT TEXT FROM TAG
	* @param $tag (String like '[index-n-5]' or '[/index-n-5]' or [index-r-5]...)
	* @return $fragment_text (String like 'texto englobado por las etiquetas xxx a /xxx')
	*/
	public static function get_fragment_text_from_tag( $tag, $raw_text ) {
		
		$id 	= TR::tag2value($tag);		#dump($tag,'tag');
		$type 	= TR::tag2type($tag);		#dump($type);		

		# la etiqueta no está bien formada
		if(empty($id) || empty($type)) {
			$msg = "Warning: tag '$tag' is not valid! (get_fragment_text_from_tag tag:$tag - raw_text:$raw_text)";
			trigger_error($msg);
			if(SHOW_DEBUG) {
				error_log( 'get_fragment_text_from_tag : '.print_r(debug_backtrace(),true) );
			}
			return NULL;
		}

		# El estado nos es indiferente
		$state = '[a-z]';

		# Build in and out tags			
		$tag_in  	= '\['.$type.'-'.$state.'-'.$id.'\]';	
		$tag_out 	= '\[\/'.$type.'-'.$state.'-'.$id.'\]';

		# Build in/out regex pattern to search
		$regexp = $tag_in ."(.*)". $tag_out;
			#dump($regexp,'regexp',"regexp for $tag : $regexp");		

		# Search fragment_text
			# Dato raw from matrix db				
			$dato = $raw_text ;	#parent::get_dato();

			#if( preg_match_all("/$regexp/", $dato, $matches, PREG_SET_ORDER) ) {
			if( preg_match_all("/$regexp/", $dato, $matches, PREG_SET_ORDER|PREG_OFFSET_CAPTURE) ) {
				#dump($matches,'$matches');
			    foreach($matches as $match) {
			        #dump($match,'$match',"regexp: $regexp for id:$id");
			        if (isset($match[1][0])) {

			        	$fragment_text = $match[1][0];	#dump($fragment_text,'$fragment_text',"regexp: $regexp for id:$id");#

			        	# Clean fragment_text
			        	$fragment_text = TR::deleteMarks($fragment_text, $deleteTC=true, $deleteIndex=true);
			        	$fragment_text = self::decode_dato_html($fragment_text);


			        	# tag in position
			        	$tag_in_pos = $match[0][1];

			        	# tag out position
			        	$tag_out_pos = $tag_in_pos + strlen($match[0][0]);

			        	return array( $fragment_text, $tag_in_pos, $tag_out_pos );
			        }
			    }
			}

		return NULL;
	}
	

	/**
	* GET FRAGMENT TEXT FROM REL LOCATOR
	* Despeja el tag a partir de rel_locator y llama a component_text_area::get_fragment_text_from_tag($tag, $raw_text)
	* para devolver el fragmento buscado
	* Ojo : Se puede llamar a un fragmento, tanto desde un locator de relación cómo desde uno de indexación.
	* @param $rel_locator (Object like '{rel_locator:{section_id : "55"}, {section_id : "oh1"},{component_tipo:"oh25"} }')
	* @return $fragment
	* @see static component_text_area::get_fragment_text_from_tag($tag, $raw_text)
	* Usado por section_records/rows/rows.php para mostrar el fragmento en los listados
	*/
	public static function get_fragment_text_from_rel_locator( $rel_locator ) {


		#throw new Exception("SORRY. DEACTIVATED FUNCTION: get_fragment_text_from_rel_locator", 1); // 6-4-2015
		
				
		/*
		# INDEXATION TAG
		if ( preg_match("/dd.{1,32}\.[0-9]{1,32}\.[0-9]{1,32}\.dd.{1,32}\.[0-9]{1,32}/", $rel_locator) ) {
			$tag_obj = component_common::get_locator_as_obj($rel_locator);		
		}
		# RELATION TAG
		else if ( preg_match("/[0-9]{1,32}\.dd.{1,32}\.[0-9]{1,32}/", $rel_locator) ) {
			$tag_obj = component_common::get_locator_relation_as_obj($rel_locator);
		}	
		# INVALID LOCATOR
		else{
		*/
		if (empty($rel_locator)) {
			if(SHOW_DEBUG) {
				dump($rel_locator,'$rel_locator');
			}			
			$msg = "rel_locator $rel_locator is not valid!";
			trigger_error($msg);
			#throw new Exception("Error Processing Request : $msg", 1);			
			return NULL;
		}
		
		#$section_id 		= $rel_locator->section_id;
		
		$section_tipo 			= $rel_locator->section_tipo;
		$section_id 			= $rel_locator->section_id;
		$component_tipo			= $rel_locator->component_tipo;
		$tag_id					= $rel_locator->tag_id;

		# state : le pasamos 'n' por defecto, pero es indistinto para encontrar el fragmento
		$state 			= 'n';

		$tag 			= '[index-' . $state . '-' . $tag_id.']';
			#dump($tag,'tag',"from rel_locator: $rel_locator");

		#$component_text_area= new component_text_area($component_tipo, $section_id, $modo='edit', DEDALO_DATA_LANG);
		$component_text_area= component_common::get_instance('component_text_area',
															 $component_tipo,
															 $section_id,
															 $modo='edit',
															 DEDALO_DATA_LANG,
															 $section_tipo);
		$raw_text 			= $component_text_area->get_dato_real();

		return component_text_area::get_fragment_text_from_tag($tag, $raw_text);
		/*
		$fragment_text 		= component_text_area::get_fragment_text_from_tag($tag, $raw_text)[0];

		return $fragment_text;
		*/
	}


	




	/**
	* DELETE_TAG_FROM_ALL_LANGS
	* Search all component data langs and delete tag an update (save) dato on every lang 
	* @param string $tag like '[index-n-2]'
	* @return array $ar_langs_changed (langs afected)
	* @see trigger.tool_indexation mode 'delete_tag'
	*/
	public function delete_tag_from_all_langs($tag) {

		$component_ar_langs = (array)$this->get_component_ar_langs();
			#dump($component_ar_langs, ' component_ar_langs');			

		$ar_langs_changed=array();
		foreach ($component_ar_langs as $current_lang) {
			$component_text_area 	= component_common::get_instance('component_text_area', $this->tipo, $this->parent, $this->modo, $current_lang, $this->section_tipo);
			$text_raw 				= $component_text_area->get_dato_real();
			$text_raw_updated 		= self::delete_tag_from_text($tag, $text_raw);
			$component_text_area->set_dato($text_raw_updated);			
			if (!$component_text_area->Save()) {
			 	throw new Exception("Error Processing Request. Error saving component_text_area lang ($current_lang)", 1);			 	
			}
			$ar_langs_changed[] = $current_lang;
		}
		
		return (array)$ar_langs_changed;
	}


	/**
	* FIX_BROKEN_INDEX_TAGS
	* @return 
	*/
	public function fix_broken_index_tags( $save=false ) {

		$start_time = start_time();

		$response = new stdClass();
			$response->result = false;
			$response->msg 	  = null;

		$changed_tags = 0;

		$raw_text = $this->get_dato();

		# INDEX IN
		$pattern = TR::get_mark_pattern($mark='indexIn',$standalone=false);
		preg_match_all($pattern,  $raw_text,  $matches_indexIn, PREG_PATTERN_ORDER);
			#dump($matches_indexIn,"matches_indexIn ".to_string($pattern));		

		# INDEX OUT
		$pattern = TR::get_mark_pattern($mark='indexOut',$standalone=false);
		preg_match_all($pattern,  $raw_text,  $matches_indexOut, PREG_PATTERN_ORDER);
			#dump($matches_indexOut,"matches_indexOut ".to_string($pattern));
		
		# INDEX IN MISSING
		$ar_missing_indexIn=array();
		foreach ($matches_indexOut[2] as $key => $value) {
			if (!in_array($value, $matches_indexIn[2])) {
				$tag_out = $matches_indexOut[0][$key];		
				$tag_in  = str_replace('[/', '[', $tag_out);
				$ar_missing_indexIn[] = $tag_in;										

				# Add deleted tag
				$tag_in   = self::change_tag_state( $tag_in, $state='d', $tag_in );	// Change state to 'd'
				$pair 	  = $tag_in.''.$tag_out;	// concatenate in-out
				$raw_text = str_replace($tag_out, $pair, $raw_text);
					#dump($raw_text, ' raw_text ++** '.$pair .to_string($tag_in));	
				$changed_tags++;				
			}
		}
		#dump($ar_missing_indexIn, ' ar_missing_indexIn ++ '.to_string());


		# INDEX MISSING OUT
		$ar_missing_indexOut=array();
		foreach ($matches_indexIn[2] as $key => $value) {
			if (!in_array($value, $matches_indexOut[2])) {
				$tag_in  = $matches_indexIn[0][$key];	// As we only have the in tag, we create out tag
				$tag_out = str_replace('[', '[/', $tag_in);
				$ar_missing_indexOut[] = $tag_out;

				# Add deleted tag
				$tag_out   = self::change_tag_state( $tag_out, $state='d', $tag_out );	// Change state to 'd'
				$pair 	  = $tag_in.''.$tag_out;	// concatenate in-out
				$raw_text = str_replace($tag_in, $pair, $raw_text);
					#dump($raw_text, ' raw_text ++** '.$pair .to_string($tag_in));
				$changed_tags++;
			}
		}
		#dump($ar_missing_indexOut, ' ar_missing_indexOut ++ '.to_string());


		# TESAURUS INDEXATIONS INTEGRITY VERIFY
		$ar_indexations = $this->get_component_indexations();
		$ar_indexations_tag_id = array();
		foreach ($ar_indexations as $current_index) {
			#dump($current_index, ' $current_index ++ '.to_string());

			$ar_locator = json_decode($current_index);
			foreach ($ar_locator as $locator) {
				#dump($locator, ' locator ++ '.to_string());
				if(!property_exists($locator,'tag_id')) continue;
				
				$l_section_tipo 	= $locator->section_tipo;
				$l_section_id 		= $locator->section_id;
				$l_component_tipo 	= $locator->component_tipo;
				if ($l_section_tipo  == $this->section_tipo && 
					$l_section_id    == $this->parent &&
					$l_component_tipo== $this->tipo
					) {
					# code...
					$tag_id = $locator->tag_id;
						#dump($tag_id, ' $tag_id ++ '.to_string());
					$ar_indexations_tag_id[] = $tag_id;

				}
			}//end foreach ($ar_locator as $locator) {				
		}
		$ar_indexations_tag_id = array_unique($ar_indexations_tag_id);
		#dump($ar_indexations_tag_id, ' $ar_indexations_tag_id ++ '.to_string());

		$added_tags = 0;
		if (!empty($ar_indexations_tag_id)) {

			$all_text_tags = array_unique(array_merge($matches_indexIn[2], $matches_indexOut[2]));
				#dump($all_text_tags, ' $all_text_tags ++ '.to_string());

			foreach ($ar_indexations_tag_id as $current_tag) {
				if (!in_array($current_tag, $all_text_tags)) {
					#dump($current_tag, ' current_tag +++++++++ '.to_string());
					$new_pair = "[index-d-{$current_tag}][/index-d-{$current_tag}] ";					

					$raw_text = $new_pair . $raw_text;
					$added_tags++;
				}
			}
		}//end if (!empty($ar_indexations_tag_id)) {
						


		if ($added_tags>0 || $changed_tags>0) {

			$response->result = true;
			$response->msg 	  = strtoupper(label::get_label('atencion')).": ";	// WARNING
			
			if($added_tags>0)
			$response->msg .= sprintf(" %s ".label::get_label('etiquetas_index_borradas'),$added_tags);	// deleted index tags was created at beginning of text.

			if($changed_tags>0)
			$response->msg .= sprintf(" %s ".label::get_label('etiquetas_index_fijadas'),$changed_tags); // broken index tags was fixed.

			$response->msg .= " ".label::get_label('etiquetas_revisar');	// Please review position of blue tags
			
			# UPDATE MAIN DATO
			$this->set_dato($raw_text);

			# SAVE
			if($save===true) {
				$this->Save();
				#$response->msg .= ". Text repaired, has been saved.";
			}else{
				$response->msg .= " ".label::get_label('etiqueta_salvar_texto'); // and saved text
			}

			$response->total = round(microtime(1)-$start_time,4)*1000 ." ms";
		}	
			
		return $response;
		
	}#end fix_broken_index_tags



	/**
	* GET_RELATED_COMPONENT_AV_TIPO
	* @return 
	*/
	public function get_related_component_av_tipo() {
		$current_elated_component_av = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, $modelo_name='component_av', $relation_type='termino_relacionado');
		if (isset($current_elated_component_av[0])) {
			return $current_elated_component_av[0];
		}else{
			return null;
		}
	}#end get_related_component_av_tipo


	/**
	* GET_COMPONENT_INDEXATIONS
	* @return 
	*/
	protected function get_component_indexations() {
		
		# Format: 	"section_tipo":"rsc167","section_id":"2","component_tipo":"rsc36","tag_id"
		$section_tipo 	= $this->section_tipo;
		$section_id 	= $this->parent;
		$component_tipo = $this->tipo;

		#$arguments['strPrimaryKeyName']	= 'dato';
		$arguments['strPrimaryKeyName']	= 'parent';
		$arguments['tipo']				= 'index';
		$arguments['dato:%like%']		= "\"section_tipo\":\"$section_tipo\",\"section_id\":\"$section_id\",\"component_tipo\":\"$component_tipo\",\"tag_id\"";
		$RecordObj_descriptors			= new RecordObj_descriptors('matrix_descriptors');
		$ar_indexations					= $RecordObj_descriptors->search($arguments);
			#dump($ar_indexations, ' ar_indexations ++ '.to_string($arguments));

		# VERIFY . Verify term exists (not only index)
		$ar_final = array();
		foreach ($ar_indexations as $parent) {
			
			$arguments=array();
			$arguments['strPrimaryKeyName']	= 'parent';
			$arguments['tipo']				= 'termino';
			$arguments['parent']			= $parent;
			$RecordObj_descriptors			= new RecordObj_descriptors('matrix_descriptors');
			$ar_indexations_verify			= $RecordObj_descriptors->search($arguments);
				#dump($ar_indexations_verify, ' ar_indexations_verify ++ '.to_string($arguments));
			
			if (empty($ar_indexations_verify)) {
				if(SHOW_DEBUG) {
					dump($ar_indexations_verify, ' ar_indexations_verify empty ++ '.to_string());
				}			
			}else{

				$arguments=array();
				$arguments['strPrimaryKeyName']	= 'dato';				
				$arguments['tipo']				= 'index';
				$arguments['parent']			= $parent;
				$RecordObj_descriptors			= new RecordObj_descriptors('matrix_descriptors');
				$ar_indexations_ok				= $RecordObj_descriptors->search($arguments);
					#dump($ar_indexations, ' ar_indexations ++ '.to_string($arguments));
				$ar_final[] = reset($ar_indexations_ok);
			}

		}//end foreach ($ar_indexations as $parent) {
		#dump($ar_final, ' $ar_final ++ '.to_string());

		return $ar_final;

	}#end get_component_indexations


	
	/**
	* GET_DIFFUSION_OBJ
	*/
	public function get_diffusion_obj( $propiedades ) {
		#dump($propiedades,'$propiedades');
		$diffusion_obj = parent::get_diffusion_obj( $propiedades );
		/*
		$diffusion_obj->component_name		= get_class($this);
		$diffusion_obj->parent 				= $this->get_parent();
		$diffusion_obj->tipo 				= $this->get_tipo();
		$diffusion_obj->lang 				= $this->get_lang();
		$diffusion_obj->label 				= $this->get_label();		
		$diffusion_obj->columns['valor']	= $this->get_valor();
		*/

		
		$section_tipo = $this->section_tipo; 

		if(isset($propiedades['rel_locator'])) {

			#dump($propiedades['rel_locator'],"propiedades rel_locator");
			$rel_locator_obj= $propiedades['rel_locator'];
			#$rel_locator 	= component_common::build_locator_from_obj( $rel_locator_obj );
			$fragment_info	= component_text_area::get_fragment_text_from_rel_locator( $rel_locator_obj );
			$texto 			= $this->get_dato_real();

			# FRAGMENT
			$diffusion_obj->columns['fragment']	= $fragment_info[0];

			# RELATED
			$current_related_tipo 	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($rel_locator_obj->component_tipo, $modelo_name='component_', $relation_type='termino_relacionado');

			# No related term is present
			if(empty($current_related_tipo[0])) return $diffusion_obj;

			$current_related_tipo = $current_related_tipo[0];
			$related_modelo_name  = RecordObj_dd::get_modelo_name_by_tipo($current_related_tipo,true);

			switch ($related_modelo_name) {

				case 'component_av':

					# TC
					$tag_in_pos  	= $fragment_info[1];
					$tag_out_pos 	= $fragment_info[2];
					$tc_in 		 	= OptimizeTC::optimize_tcIN($texto, false, $tag_in_pos, $in_margin=0);
					$tc_out 	 	= OptimizeTC::optimize_tcOUT($texto, false, $tag_out_pos, $in_margin=100);
						#dump($tc_in ,"tc_in - tc_out:$tc_out, tag_in_pos:$tag_in_pos - tag_out_pos:$tag_out_pos ");

					$tcin_secs		= OptimizeTC::TC2seg($tc_in);
			        $tcout_secs		= OptimizeTC::TC2seg($tc_out);
			        $duracion_secs	= $tcout_secs - $tcin_secs;
			        $duracion_tc	= OptimizeTC::seg2tc($duracion_secs);

			        $diffusion_obj->columns['related_tipo']	= $current_related_tipo;
			        $diffusion_obj->columns['related']		= $related_modelo_name;
			        $diffusion_obj->columns['tc_in']		= $tc_in;
			        $diffusion_obj->columns['tc_out']		= $tc_out;
			        $diffusion_obj->columns['duracion_tc']	= $duracion_tc;
			        $diffusion_obj->columns['tcin_secs']	= $tcin_secs;
			        $diffusion_obj->columns['tcout_secs']	= $tcout_secs;		        	
					
					#$component_av   = new component_av($current_related_tipo, $this->get_parent(), 'edit');
					$component_av   = component_common::get_instance($related_modelo_name,
																	 $current_related_tipo,
																	 $this->get_parent(),
																	 'list',
																	 DEDALO_DATA_LANG,
																	 $section_tipo);
					$video_id 		= $component_av->get_video_id();

					$diffusion_obj->columns['video_id']	= $video_id;
			        #$diffusion_obj->columns['video_url']	= $duracion_tc;

			        #dump($diffusion_obj, ' diffusion_obj ++ '.to_string());

					break;

				case 'component_image':

					break;

				case 'component_geolocation':
					
					break;

				default:
					throw new Exception("Error Processing Request. Current related $related_modelo_name is not valid. Please configure textarea for this media ", 1);					
			}
			#dump($diffusion_obj,'$diffusion_obj');
		}		
		
		return $diffusion_obj;

	}//end get_diffusion_obj 



	/**
	* RENDER_LIST_VALUE
	* Overwrite for non default behaviour
	* Receive value from section list and return proper value to show in list
	* Sometimes is the same value (eg. component_input_text), sometimes is calculated (e.g component_portal)
	* @param string $value
	* @param string $tipo
	* @param int $parent
	* @param string $modo
	* @param string $lang
	* @param string $section_tipo
	* @param int $section_id
	*
	* @return string $list_value
	*/
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id, $locator=null) {
		#dump($value, ' value ++ '.$tipo.' - '.to_string($locator)); //get_fragment_text_from_tag( $tag, $raw_text ) {

		$obj_value = json_decode($value); # Evitamos los errores del handler accediendo directamente al json_decode de php

		# value from database is always an array of strings. default we select first element (complete text)
		# other array index are fragments of complete text
		$current_tag = 0;

		#
		# Portal tables can reference fragments of text inside components (tags). In this cases
		# we verify current required text is from correct component and tag		
		if ( isset($locator->component_tipo) && isset($locator->tag_id) ) {
			$locator_component_tipo = $locator->component_tipo;
			$locator_tag_id 		= $locator->tag_id;
			if ($locator_component_tipo==$tipo) {
				$current_tag = (int)$locator_tag_id;
			}
		}
		
		if (is_object($obj_value) && isset($obj_value->$current_tag)) {
			$list_value = $obj_value->$current_tag;
		}else{
			$list_value = $value;
		}		

		# TRUNCATE ALL FRAGMENTS		
		TR::limpiezaFragmentoEnListados($list_value,160);

		return $list_value;
		
	}#end render_list_value



	/**
	* GET_RELATED_COMPONENT_select_lang
	* @return string $tipo | null
	*/
	public function get_related_component_select_lang() {

		$tipo = null;
		$related_terms = $this->get_ar_related_by_model('component_select_lang');
			#dump($related_terms, ' related_terms ++ '.to_string());

		switch (true) {
			case count($related_terms)==1 :
				$tipo = reset($related_terms);
				break;
			case count($related_terms)>1 :
				debug_log(__METHOD__." More than one related component_select_lang are found. Please fix this ASAP ".to_string(), logger::ERROR);
				break;
			default:
				break;
		}	

		return $tipo;
		
	}#end get_related_component_select_lang




	
};
?>