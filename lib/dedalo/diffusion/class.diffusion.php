<?php
require_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.diffusion_sql.php');

/*
* CLASS DIFUSSION
*/


abstract class diffusion  {
	
	
	/**
	* GET HTML CODE . RETURN INCLUDE FILE __CLASS__.PHP
	* @return $html
	*	Get standar path file "DEDALO_LIB_BASE_PATH .'/'. $class_name .'/'. $class_name .'.php'" (ob_start)
	*	and return rendered html code
	*/
	public function get_html() {

		#dump($this);
		
		if(SHOW_DEBUG) $start_time = start_time();
		
		# Class name is called class (ex. component_input_text), not this class (common)
		$class_name	= get_called_class();	#dump($class_name,'$class_name');

		$file		= DEDALO_LIB_BASE_PATH .'/diffusion/'. $class_name .'/'. $class_name .'.php' ; 	#dump("$class_name");		
	
		ob_start();
		include ( $file );
		$html =  ob_get_clean();
		


		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' [element '.$class_name.']', "html");
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.microtime(1)]=microtime(1);
		}
		
		return $html;
	}

	


	# GET_DIFFUSION_DOMAINS : Get array of ALL diffusion domains in struture
	public static function get_diffusion_domains() {

		$diffusion_domains = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation(DEDALO_DIFFUSION_TIPO, $modelo_name='diffusion_domain', $relation_type='children');
			#dump($tipo_filter_master,'$tipo_filter_master');

		return $diffusion_domains;
	}
	

	# GET_MY_DIFFUSION_DOMAIN : Get only one diffusion domain by tipo
	public static function get_my_diffusion_domain($diffusion_domain_tipo, $caller_class_name) {

		$diffusion_domains = diffusion::get_diffusion_domains();
			#dump($diffusion_domains,'$diffusion_domains');

		foreach ($diffusion_domains as $current_tipo) {
			
			$current_name = RecordObj_ts::get_termino_by_tipo($current_tipo);

			if($current_name==$diffusion_domain_tipo) {
				
				$my_diffusion_domain = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($current_tipo, $modelo_name=$caller_class_name, $relation_type='children');
					#dump($tipo_filter_master,'$tipo_filter_master');

				return $my_diffusion_domain;
			}
		}
	}



	
}
?>