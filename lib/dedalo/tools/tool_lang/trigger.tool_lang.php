<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# set vars
	$vars = array('mode','id','parent','section_tipo','dato','tipo','lang','source_lang','target_lang','caller_component_tipo','caller_element','tool_name','tool_locator');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


if (empty($section_tipo)) {
	exit("<span class='error'> Trigger: Error Need section_tipo..</span>");
}


/**
* PROPAGATE MARKS
*
*/
if($mode=='propagate_marks') {
	die(" NO ACABADA !!");
	if(!$sourceID || !$targetID) die("propagateMarks: Need more vars ! (sourceID:$sourceID , targetID:$targetID, $texto:$texto");
	if(!isset($texto)) exit();
	
	$html = '';	
	
	# Set and save (save post text)
	$RecordObj_trans	= new RecordObj_trans($targetID);	
	$texto				= TR::limpiezaPOSTtr($texto);
	
	# before save, remove changes in log index /**/	
	if($ar_indexID_click || $confirmAllIndexReview) {	
	require_once( DEDALO_ROOT . '/ind/class.IndexToReview.php');
	
		$RecordObj_ind 		= new RecordObj_ind_tr($targetID);
		
		if($confirmAllIndexReview==1) {
			# delete all indexTo review
			$indexToReviewObj	= new indexToReview($RecordObj_ind,$ar_indexID_click,$texto);			
			$ar_indexID_db		= $indexToReviewObj->get_ar_indexID_db();	 						#$html.= $ar_indexID_db; die($html);#print_r($ar_indexID_db);
			if(is_array($ar_indexID_db)) foreach($ar_indexID_db as $indexID) {
				if($indexID!=$ar_indexID_click)			
				$ar_indexID_click .= 	",$indexID";			
			}
		}
		# delete current array of indexTo review		
		$indexToReviewObj	= new indexToReview($RecordObj_ind,$ar_indexID_click,$texto);			#$html .= " ar_indexID_click: $ar_indexID_click \n";	die($html); #confirmAllIndexReview
		$indexToReviewObj->remove_indexTag_in_current_trans();			
	}
	$RecordObj_trans->set_texto($texto);		
	$save 				 = $RecordObj_trans->Save(); 	#var_dump($save);	
	
	# save confirm msg
	if($save!==true)	 die("Error on propagateMarks save ! [$save] Text is NOT saved");
	$html 				.= "\n\n $propagar_title $marcas_title OK \n\n";
	
	# Propagate tc (get saved text, propagate tcs and save text again)
	# if two texts source and translated have the same  number of paragraphs
	$TransPropagatorObj	 = new TransPropagator($RecordObj_trans,$rpAlltags);
	$propagateTC		 = $TransPropagatorObj->propagateTC();	
	$propagateIndex		 = $TransPropagatorObj->propagateIndex();			
	  
	
	$sourceNumberOfParagraphs	= $TransPropagatorObj->get_sourceNumberOfParagraphs();
	$targetNumberOfParagraphs	= $TransPropagatorObj->get_targetNumberOfParagraphs();
	
	if($sourceNumberOfParagraphs != $targetNumberOfParagraphs)	
	$html 				.= " \n PROPAGATOR ALERT: \n Paragraphs inconsistency founded ! \n Source paragraphs: $sourceNumberOfParagraphs \n Target paragraphs: $targetNumberOfParagraphs. \n Text is not sync. \n Solve this problem ASAP to can propagate marks. \n\n ";

	if($TransPropagatorObj->get_html_log() && SHOW_DEBUG==true)
	$html 				.= " \n PROPAGATOR LOG: \n".$TransPropagatorObj->get_html_log();
	
	exit(msgJS($html));
}



/**
* LOAD SOURCE COMPONENT (RIGHT SIDE)
* @param $tipo
* @param $lang
* @param $parent
*/
if($mode=='load_source_component') { 	
	
	if (empty($tipo)) throw new Exception("Error Processing Request: Unable load component ! (Few vars1 tipo)", 1);
	if (empty($parent)) throw new Exception("Error Processing Request: Unable load component ! (Few vars1 parent)", 1);
	if (empty($section_tipo)) throw new Exception("Error Processing Request: Unable load component ! (Few vars1 section_tipo)", 1);
	if (empty($lang) ) throw new Exception("Error Processing Request: Unable load component ! (Few vars1 lang)", 1);

	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);	
	$modo 			= 'tool_lang';


	# COMPONENT	
	$component_obj	= component_common::get_instance($modelo_name, $tipo, $parent, $modo, $lang, $section_tipo);	
		#dump($component_obj,"component_obj tipo:$tipo, parent:$parent, modo:$modo, lang: $lang");

	# Get component html
	$html = $component_obj->get_html();
	
	print $html;
	exit();
}

/**
* LOAD TARGET COMPONENT (RIGHT SIDE)
* @param $tipo
* @param $lang
* @param $parent
*/
if($mode=='load_target_component') {
	
	if (empty($tipo)) throw new Exception("Error Processing Request: Unable load component ! (Few vars1 tipo)", 1);
	if (empty($parent)) throw new Exception("Error Processing Request: Unable load component ! (Few vars1 parent)", 1);
	if (empty($section_tipo)) throw new Exception("Error Processing Request: Unable load component ! (Few vars1 section_tipo)", 1);
	if (empty($lang) ) throw new Exception("Error Processing Request: Unable load component ! (Few vars1 lang)", 1);

	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);	
	$modo 			= 'tool_lang';
	
	# COMPONENT	
	$component_obj	= component_common::get_instance($modelo_name, $tipo, $parent, $modo, $lang, $section_tipo);
		#dump($component_obj,'component_obj');

	# Set variant to configure 'identificador_unico' of current component
	$component_obj->set_variant( tool_lang::$target_variant );

	# Get component html
	$html = $component_obj->get_html();

	# Store last target component
	#$_SESSION['tool_lang']['last_target_lang'] = $lang;
	
	print $html;
	exit();
}

/**
* update_tool_header 
* @param $caller_component_tipo
* @param $caller_element
* @param $parent
*/
if($mode=='update_tool_header') { 	
	
	if (empty($tipo)||
		empty($parent) ||
		empty($section_tipo) ||
		empty($lang) ||
		empty($tool_name) || 
		empty($tool_locator)
		) exit("Error Processing Request: Unable update_tool_header ! (Few vars1)");

	$modelo_name    = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
	$component_obj  = component_common::get_instance($modelo_name,
													$tipo,
													$parent,
													'edit_tool',
													$lang,
													$section_tipo);

	#
	# STATE
	# Create component_state configurated
	$component_state 		= $component_obj->get_component_state( $tool_locator, $component_obj->get_lang() );
	$component_state_html 	= '';
	if ( !empty($component_state) && is_object($component_state) ) {
		$component_state_html = $component_state->get_html();
	}
	
	debug_log(__METHOD__." Updated tool header ".to_string(), logger::DEBUG);
	
	print $component_state_html;
	exit();
	
}


/**
* AUTOMATIC TRANSLATION
* @param $source_lang
* @param $target_lang
* @param $source_id
* @param $tipo
* @param $parent
*/
if($mode=='automatic_translation') {

	# mandatory vars
	$mandatoy_vars = array('source_lang','target_lang','tipo','parent');
	foreach ($mandatoy_vars as $var_name) {
		if (empty($$var_name)) throw new Exception("Error Processing Request: $var_name is mandatory!", 1);
	}	

	# SOURCE TEXT . get source text
	# IMPORTANT : use 'list' as 'modo' because 'edit' can change the component lang on the fly when a reference component_select_lang is defined
	$modo = 'list';
	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
	$component_obj	= component_common::get_instance($modelo_name, $tipo, $parent, $modo, $source_lang, $section_tipo);
	$dato 			= $component_obj->get_dato();
	if ($modelo_name==='component_input_text') {
		$dato = $component_obj->get_valor(0);
	}
	$dato			= strip_tags($dato, '<br><strong><em><apertium-notrans>');	# allow only some thtml tags	
	$source_text	= $dato;

	# ADDTAGIMGONTHEFLY : Añadimos las etiquetas de imagen para que Apertium no toque las etiqueta originales de la base de datos
	# Poner Apertium en modo 'html' para ello
	$source_text	= TR::addTagImgOnTheFly($source_text);
		#dump($source_text, "$modelo_name, $tipo, $parent, 'edit', $source_lang, $section_tipo"); die();
	
	
	# DIRECTION
	$direction 		= tool_lang::get_babel_direction($source_lang, $target_lang);
		#dump($direction,'direction',"",true);

	# 
	# CURL_EXEC
	
		# set curl variables
		$url 			= DEDALO_TRANSLATOR_URL;
		$source_text	= trim($source_text);
		$fields = array(
					'text'=>urlencode($source_text),
					'direction'=>urlencode($direction)
				);
		$fields_string = '';
		
		# url-ify the data for the POST
		foreach($fields as $key=>$value) {
			$fields_string .= $key.'='.$value.'&';
		}
		rtrim($fields_string,'&');
		#dump($fields, '$fields - ' .$url.'?'.$fields_string);
		
		# open connection
		$ch = curl_init();
		
		# set the url, number of POST vars, POST data
		curl_setopt($ch,CURLOPT_URL,$url);
		curl_setopt($ch,CURLOPT_POST,count($fields));
		curl_setopt($ch,CURLOPT_POSTFIELDS,$fields_string);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
		
		# execute post
		$result = curl_exec($ch);
		
		# close connection
		curl_close($ch);
		#dump($result,'$result',"");
			
	# Set and save (save result text)
	$ar_invalid_respone = array('Error: Mode','Error. You need authorization');
	foreach ($ar_invalid_respone as $invalid_respone) {
		if( strpos($result,$invalid_respone)!==false ) exit($result);
	}

	# DECODE HTML ENTITIES . Babel devuelve los caracteres especiales codificados como entidades html. Para revertir el formato usamos html_entity_decode
	# convirtiendo las comillas dobles en sencillas (flag ENT_COMPAT) y forzando el formato final a UTF-8
	# error_log( "encoding: ".mb_detect_encoding($result) ." - ".$result );
	$result = html_entity_decode($result,ENT_COMPAT,'UTF-8');

	# SANITIZE BABEL RESULT
	# Apertium cambia el formato de las etiquetas al devolverlas. Se restitituyen aquí
	tool_lang::sanitize_result($result);	
		#dump($result,'$result'); die();
	
	
	# TARGET TEXT 
	# IMPORTANT : use 'list' as 'modo' because 'edit' can change the component lang on the fly when a reference component_select_lang is defined
	$modo = 'list';
	$component_obj	= component_common::get_instance($modelo_name, $tipo, $parent, $modo, $target_lang, $section_tipo);
		#dump($component_obj,'$component_obj PRE');
	$component_obj->set_dato($result);
	$component_obj->Save(false);	# Important: send arg 'false' to save for avoid alter other langs tags (propagate)
		#dump($component_obj,'$component_obj POST SAVE');

	$id = $component_obj->get_parent();
	
	#print $result;
	print $id;
	exit();
}

?>