<?php
include(dirname(dirname(dirname(__FILE__))) .'/config/config.php');
include(dirname(dirname(__FILE__)) .'/web_ts_term/class.web_ts_term.php');
include(dirname(dirname(__FILE__)) .'/web_indexation_node/class.web_indexation_node.php');

# set vars
$vars = array('mode');
	foreach($vars as $name)	$$name = common::setVar($name);	



if ($mode==='toggle_childrens') {
	
	$vars = array('term_id','ar_childrens','tree_mode');
		foreach($vars as $name)	$$name = common::setVar($name);

		if(!$term_id || !$ar_childrens) return 'Error: few vars';
		#dump($ar_childrens, ' ar_childrens ++ '.to_string()); die();
	

	$html='';
	if ($ar_childrens = json_decode($ar_childrens)) {
	
		#dump($ar_childrens, ' ar_childrens ++ '.to_string());

		# Load childrens data from server api as json
		$options = new stdClass();
			$options->dedalo_get 	= 'thesaurus_term';
			$options->ar_term_id 	= $ar_childrens;
			$options->lang  	 	= WEB_CURRENT_LANG_CODE;
		$ar_ts_terms = json_web_data::get_data($options);
			#dump($ar_ts_terms, ' ar_ts_terms ++ '.to_string(WEB_CURRENT_LANG_CODE));

		
		switch ($tree_mode) {
			case 'search_combined':
			case 'search_cumulative':
				$node_html_mode = 'combined';
				break;
			default:
				$node_html_mode = 'list';
				break;
		}

		foreach ((array)$ar_ts_terms->result as $current_term_obj) {

			# Ignore empty terms
			#if (empty($current_term_obj->indexation) && empty($current_term_obj->ar_childrens)) {
			#	continue;
			#}

			$web_ts_term = new web_ts_term($current_term_obj);

			$html .= $web_ts_term->get_html( $node_html_mode );
		}
	}//end if ($ar_childrens = json_decode($ar_childrens)) 


	echo $html;
	exit();
}//end toggle_childrens




if ($mode==='toggle_indexation') {

	$vars = array('term_id','ar_indexation','term');
		foreach($vars as $name)	$$name = common::setVar($name);
	
		if(!$term_id || !$ar_indexation) return 'Error: few vars';
		#dump($ar_indexation, ' ar_indexation ++ '.to_string($term_id)); #die();

	$html='';
	if ($ar_indexation = json_decode($ar_indexation)) {
		#dump($ar_indexation, ' ar_indexation ++ '.to_string());

		# Load indexation data from server api as json
		$options = new stdClass();
			$options->dedalo_get 	= 'thesaurus_indexation_node';
			$options->term_id 		= $term_id;
			$options->ar_locators 	= $ar_indexation;
			$options->lang  	 	= WEB_CURRENT_LANG_CODE;
			$options->image_type   	= 'posterframe';
		$ar_indexation_node = json_web_data::get_data($options);
			#dump($ar_indexation_node, ' ar_indexation_node ++ '.to_string()); #die();

		$ar_resolved = array();
		foreach ($ar_indexation_node->result as $current_indexation_node_data) {
			#dump($current_indexation_node_data, ' $current_indexation_node_data ++ '.to_string());
			
			$current_locator = $current_indexation_node_data->locator;
			#dump($current_locator, ' current_locator ++ '.to_string());
			if (in_array($current_locator->section_top_id, $ar_resolved)) {
				continue; # Only one by interview
			}

			# Inject term
			$current_indexation_node_data->term = $term;
			
			$web_indexation_node = new web_indexation_node($current_indexation_node_data);

			$html .= $web_indexation_node->get_html('icon');			

			$ar_resolved[] = $current_locator->section_top_id;
		}
	}//end if ($ar_indexation = json_decode($ar_indexation))


	echo $html;
	exit();
}//end toggle_indexation



?>