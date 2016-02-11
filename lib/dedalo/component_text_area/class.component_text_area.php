<?php
/*
* CLASS COMPONENT TEXT AREA
*/


class component_text_area extends component_common {

	public $arguments;
	
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
						
						if(strlen($ar_fragmento[0])>$max_char) {
							$fragmento_text = mb_substr($ar_fragmento[0],0,$max_char);
							if (strlen($ar_fragmento[0])>$max_char) {
								$fragmento_text .= '..';
							}
						} else{
							$fragmento_text = $ar_fragmento[0];
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
					#dump($dato ,'$dato ');

				# Desactivo porque elimina el '<mar>'
				$dato = filter_var($dato, FILTER_UNSAFE_RAW );	# FILTER_SANITIZE_STRING
				break;
		}		

		return $dato;
	}
	

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

		# Buscamos apariciones del patron de etiqueta indexIn (definido en class TR)
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
	}


	
};
?>